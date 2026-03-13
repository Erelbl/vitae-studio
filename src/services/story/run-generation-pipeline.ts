import { createAdminClient } from "@/lib/supabase/admin";
import { assertTransition } from "@/lib/state-machine";
import { buildStoryProfile } from "@/services/story/story-profile-builder";
import { generateFullStory, splitStoryIntoPages } from "@/services/story/full-story-generator";
import { reviewAndFixStory } from "@/services/story/story-review";
import { evaluateStoryRhyme } from "@/services/story/rhyme-evaluator";
import type { OrderStatus } from "@/types/order";
import type { QuestionnaireResponses, FollowUpQA } from "@/types/questionnaire";
import type { GenerationSettings } from "@/types/page";

export interface GenerationPipelineParams {
  orderId: string;
  responses: Partial<QuestionnaireResponses>;
  followupQA: FollowUpQA[];
  personName: string;
  personGender: "male" | "female";
  generationSettings: GenerationSettings | null;
  jobId: string | null;
}

// Runs the full story generation pipeline asynchronously.
// Operates on the real schema: pages (one row per page per order) +
// page_versions (per-page version history). No story_drafts table.
//
// Regeneration strategy:
//   - Fetch existing pages for the order before Claude calls.
//   - After generation: UPDATE existing pages (incrementing text_version),
//     INSERT new pages where they don't exist yet.
//   - INSERT page_versions rows for every text page saved.
//   - This preserves old page_versions (ON DELETE CASCADE from pages means
//     we must never DELETE page rows during regeneration).
export async function runGenerationPipeline(
  params: GenerationPipelineParams
): Promise<void> {
  const {
    orderId,
    responses,
    followupQA,
    personName,
    personGender,
    generationSettings,
    jobId,
  } = params;

  const supabase = createAdminClient();

  try {
    console.log(`[pipeline] ▶ orderId=${orderId}`);

    // 1. Build story profile
    const profile = buildStoryProfile(
      responses,
      followupQA,
      personName,
      personGender
    );

    // 2. Snapshot existing pages so we know which to INSERT vs UPDATE
    //    and what the current text_version is for each.
    const { data: existingPagesRaw } = await supabase
      .from("pages")
      .select("id, page_number, text_version")
      .eq("order_id", orderId);

    const existingByNum = new Map(
      (existingPagesRaw ?? []).map((p) => [
        p.page_number as number,
        { id: p.id as string, textVersion: (p.text_version as number) ?? 0 },
      ])
    );
    console.log(`[pipeline] existing pages for order: ${existingByNum.size}`);

    // 3. Fetch total_pages for this order (default 40)
    const { data: orderRow } = await supabase
      .from("orders")
      .select("total_pages")
      .eq("id", orderId)
      .single();
    const totalPages: number = (orderRow?.total_pages as number | null) ?? 40;
    console.log(`[pipeline] totalPages=${totalPages}`);

    // 4. Generate full continuous story (Step 2)
    const contentPageCount = totalPages - 2; // exclude cover + back-cover
    const fullStory = await generateFullStory(
      profile,
      contentPageCount,
      generationSettings
    );
    console.log(`[pipeline] fullStory: ${fullStory.length} chars`);

    // 5. Split story into pages (Step 3)
    const rawPages = await splitStoryIntoPages(
      fullStory,
      profile,
      totalPages,
      generationSettings
    );
    console.log(`[pipeline] rawPages: ${rawPages.length} pages`);

    // 6. Review pass (skip illustration-only pages automatically)
    const { pages: finalPages, review } = await reviewAndFixStory(
      rawPages,
      generationSettings
    );

    // 7. Build full page list (cover + content pages + back_cover)
    const coverPageNumber = 1;
    const backCoverPageNumber = totalPages;

    interface PageData {
      page_number: number;
      page_type: string;
      text_content: string | null;
      text_generation_model: string | null;
    }

    const allPages: PageData[] = [
      {
        page_number: coverPageNumber,
        page_type: "cover",
        text_content: null,
        text_generation_model: null,
      },
      ...finalPages.map((p) => ({
        page_number: p.page_number,
        page_type: p.page_type,
        text_content: p.text_content,
        text_generation_model:
          generationSettings?.model_id ?? "claude-sonnet-4-6",
      })),
      {
        page_number: backCoverPageNumber,
        page_type: "back_cover",
        text_content: null,
        text_generation_model: null,
      },
    ];

    // 8. Persist pages:
    //    - INSERT rows that don't exist yet (first generation)
    //    - UPDATE rows that already exist (regeneration) — preserves page IDs
    //      and therefore preserves old page_versions history (FK is CASCADE)
    interface SavedPage {
      id: string;
      page_number: number;
      text_content: string | null;
      new_version: number;
    }
    const savedPages: SavedPage[] = [];

    const toInsert: Array<{
      order_id: string;
      page_number: number;
      page_type: string;
      text_content: string | null;
      text_status: string;
      text_version: number;
      text_generation_model: string | null;
    }> = [];

    const toUpdate: Array<{
      id: string;
      page_number: number;
      text_content: string | null;
      new_version: number;
      text_generation_model: string | null;
    }> = [];

    for (const p of allPages) {
      const existing = existingByNum.get(p.page_number);
      if (existing) {
        toUpdate.push({
          id: existing.id,
          page_number: p.page_number,
          text_content: p.text_content,
          new_version: existing.textVersion + 1,
          text_generation_model: p.text_generation_model,
        });
      } else {
        toInsert.push({
          order_id: orderId,
          page_number: p.page_number,
          page_type: p.page_type,
          text_content: p.text_content,
          text_status: "ready",
          text_version: 1,
          text_generation_model: p.text_generation_model,
        });
      }
    }

    // Batch-insert new pages
    if (toInsert.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("pages")
        .insert(toInsert)
        .select("id, page_number, text_content");

      if (insertError) {
        throw new Error(`Failed to insert pages: ${insertError.message}`);
      }

      for (const p of inserted ?? []) {
        savedPages.push({
          id: p.id as string,
          page_number: p.page_number as number,
          text_content: p.text_content as string | null,
          new_version: 1,
        });
      }
    }

    // Update existing pages one-by-one (need different text_version per row)
    for (const p of toUpdate) {
      const { error: updateError } = await supabase
        .from("pages")
        .update({
          text_content: p.text_content,
          text_status: "ready",
          text_version: p.new_version,
          text_generation_model: p.text_generation_model,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id);

      if (updateError) {
        console.error(
          `[pipeline] Failed to update page ${p.page_number}:`,
          updateError.message
        );
      } else {
        savedPages.push({
          id: p.id,
          page_number: p.page_number,
          text_content: p.text_content,
          new_version: p.new_version,
        });
      }
    }

    console.log(`[pipeline] saved ${savedPages.length} pages (${toInsert.length} inserted, ${toUpdate.length} updated)`);

    // 9. Insert page_versions for every text page
    //    version_number matches the new text_version on the pages row.
    //    Unique constraint: (page_id, version_type, version_number) — safe because
    //    new_version is always existingVersion+1 for updates, 1 for inserts.
    const versionRows = savedPages
      .filter((p) => p.text_content != null)
      .map((p) => ({
        page_id: p.id,
        version_type: "text" as const,
        version_number: p.new_version,
        content: p.text_content as string,
        generation_settings_id: generationSettings?.id ?? null,
        input_snapshot: {
          order_id: orderId,
          page_number: p.page_number,
        },
        output_metadata: {
          review_issues: review.issues.filter(
            (i) => i.page_number === p.page_number
          ),
        },
        created_by: "generation" as const,
      }));

    if (versionRows.length > 0) {
      const { error: versionsError } = await supabase
        .from("page_versions")
        .insert(versionRows);

      if (versionsError) {
        console.error(
          "[pipeline] Failed to save page_versions:",
          versionsError.message
        );
        // Non-fatal — pages are saved; versions are audit log
      }
    }

    // 10. Evaluate rhyme quality (non-fatal — pipeline completes regardless)
    let evaluation = null;
    try {
      const pagesForEval = savedPages.map((p) => ({
        page_number: p.page_number,
        text_content: p.text_content,
        page_type:
          finalPages.find((f) => f.page_number === p.page_number)?.page_type ??
          "illustration_and_text",
      }));
      evaluation = await evaluateStoryRhyme(pagesForEval);

      // Persist to orders.story_evaluation
      await supabase
        .from("orders")
        .update({ story_evaluation: evaluation })
        .eq("id", orderId);

      console.log(
        `[pipeline] evaluation: rhyme=${evaluation.rhyme_score} flow=${evaluation.hebrew_flow_score} overall=${evaluation.overall_story_score}`
      );
    } catch (evalErr) {
      console.warn("[pipeline] Evaluation step failed (non-fatal):", evalErr);
    }

    // 11. Chain status transitions:
    //    generating_text → text_ready → generating_illustrations → preview_ready
    const transitions: [OrderStatus, OrderStatus][] = [
      ["generating_text", "text_ready"],
      ["text_ready", "generating_illustrations"],
      ["generating_illustrations", "preview_ready"],
    ];

    for (const [from, to] of transitions) {
      assertTransition(from, to);
      const { error } = await supabase
        .from("orders")
        .update({ status: to })
        .eq("id", orderId);
      if (error) {
        throw new Error(
          `Failed to transition ${from} → ${to}: ${error.message}`
        );
      }
    }

    // 12. Mark processing job complete
    if (jobId) {
      await supabase
        .from("processing_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          output_data: {
            pages_saved: savedPages.length,
            review_issues: review.issues.length,
            regenerated_count: review.regenerated_count,
            ...(evaluation
              ? {
                  rhyme_score: evaluation.rhyme_score,
                  hebrew_flow_score: evaluation.hebrew_flow_score,
                  overall_story_score: evaluation.overall_story_score,
                }
              : {}),
          },
        })
        .eq("id", jobId);
    }

    console.log(
      `[pipeline] ✓ DONE orderId=${orderId} pages=${savedPages.length}`
    );
  } catch (err) {
    console.error("[pipeline] ✗ FAILED:", err);

    // Best-effort: transition order to error state
    try {
      const { data: currentOrder } = await supabase
        .from("orders")
        .select("status")
        .eq("id", orderId)
        .single();

      const statusNow = currentOrder?.status as OrderStatus | undefined;
      if (
        statusNow &&
        ["generating_text", "text_ready", "generating_illustrations"].includes(
          statusNow
        )
      ) {
        assertTransition(statusNow, "error_generation");
        await supabase
          .from("orders")
          .update({ status: "error_generation" })
          .eq("id", orderId);
      }
    } catch {
      // best-effort
    }

    // Mark job failed
    if (jobId) {
      await supabase
        .from("processing_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: String(err),
        })
        .eq("id", jobId);
    }
  }
}
