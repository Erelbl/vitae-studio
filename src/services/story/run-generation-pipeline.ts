import { createAdminClient } from "@/lib/supabase/admin";
import { assertTransition } from "@/lib/state-machine";
import { buildStoryProfile } from "@/services/story/story-profile-builder";
import { generateAlbumOutline } from "@/services/story/outline-generator";
import { generatePageTexts } from "@/services/story/page-generator";
import { reviewAndFixStory } from "@/services/story/story-review";
import type { OrderStatus } from "@/types/order";
import type { QuestionnaireResponses, FollowUpQA } from "@/types/questionnaire";
import type { GenerationSettings } from "@/types/page";

export interface GenerationPipelineParams {
  orderId: string;
  draftId: string;
  responses: Partial<QuestionnaireResponses>;
  followupQA: FollowUpQA[];
  personName: string;
  personGender: "male" | "female";
  generationSettings: GenerationSettings | null;
  jobId: string | null;
}

// Runs the full story generation pipeline asynchronously.
// Called via after() in the generate-story route so it runs after the HTTP
// response is sent. Manages its own Supabase client instance.
export async function runGenerationPipeline(
  params: GenerationPipelineParams
): Promise<void> {
  const {
    orderId,
    draftId,
    responses,
    followupQA,
    personName,
    personGender,
    generationSettings,
    jobId,
  } = params;

  const supabase = createAdminClient();

  try {
    console.log(`[pipeline] ▶ orderId=${orderId} draftId=${draftId}`);

    // 1. Build story profile
    const profile = buildStoryProfile(
      responses,
      followupQA,
      personName,
      personGender
    );

    // 2. Generate album outline
    const outline = await generateAlbumOutline(profile, generationSettings);
    console.log(`[pipeline] outline: ${outline.length} pages`);

    // 3. Generate page texts
    const rawPages = await generatePageTexts(profile, outline, generationSettings);
    console.log(`[pipeline] rawPages: ${rawPages.length} pages`);

    // 4. Review pass
    const { pages: finalPages, review } = await reviewAndFixStory(
      rawPages,
      generationSettings
    );

    // 5. Build page rows
    const coverItem = outline.find((o) => o.page_type === "cover");
    const backCoverItem = outline.find((o) => o.page_type === "back_cover");

    const pageRows = [
      {
        order_id: orderId,
        page_number: coverItem?.page_number ?? 1,
        page_type: "cover" as const,
        text_content: null as string | null,
        text_status: "ready" as const,
        text_version: 1,
        text_generation_model: null as string | null,
        story_draft_id: draftId,
      },
      ...finalPages.map((p) => ({
        order_id: orderId,
        page_number: p.page_number,
        page_type: p.page_type,
        text_content: p.text_content,
        text_status: "ready" as const,
        text_version: 1,
        text_generation_model:
          generationSettings?.model_id ?? "claude-sonnet-4-6",
        story_draft_id: draftId,
      })),
      {
        order_id: orderId,
        page_number: backCoverItem?.page_number ?? 40,
        page_type: "back_cover" as const,
        text_content: null as string | null,
        text_status: "ready" as const,
        text_version: 1,
        text_generation_model: null as string | null,
        story_draft_id: draftId,
      },
    ];

    // 6. Insert pages
    const { data: insertedPages, error: pagesError } = await supabase
      .from("pages")
      .insert(pageRows)
      .select("id, page_number, text_content");

    if (pagesError) {
      throw new Error(`Failed to save pages: ${pagesError.message}`);
    }

    console.log(`[pipeline] inserted ${insertedPages?.length ?? 0} pages`);

    // 7. Insert page_versions
    if (insertedPages && insertedPages.length > 0) {
      const versionRows = insertedPages
        .filter((p) => p.text_content != null)
        .map((p) => ({
          page_id: p.id as string,
          version_type: "text" as const,
          version_number: 1,
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
    }

    // 8. Chain status transitions:
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

    // 9. Mark draft completed
    await supabase
      .from("story_drafts")
      .update({ status: "completed" })
      .eq("id", draftId);

    // 10. Mark processing job complete
    await supabase
      .from("processing_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        output_data: {
          pages_saved: insertedPages?.length ?? 0,
          review_issues: review.issues.length,
          regenerated_count: review.regenerated_count,
        },
      })
      .eq("id", jobId ?? "");

    console.log(
      `[pipeline] ✓ DONE orderId=${orderId} draftId=${draftId} pages=${insertedPages?.length ?? 0}`
    );
  } catch (err) {
    console.error("[pipeline] ✗ FAILED:", err);

    // Mark draft failed
    await supabase
      .from("story_drafts")
      .update({ status: "failed", error_message: String(err) })
      .eq("id", draftId);

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
