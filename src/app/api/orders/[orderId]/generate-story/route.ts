import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrderRequest } from "@/lib/order-auth";
import { assertTransition } from "@/lib/state-machine";
import { resolveGenerationSettings } from "@/lib/generation-settings";
import { buildStoryProfile } from "@/services/story/story-profile-builder";
import { generateAlbumOutline } from "@/services/story/outline-generator";
import { generatePageTexts } from "@/services/story/page-generator";
import { reviewAndFixStory } from "@/services/story/story-review";
import type { OrderStatus } from "@/types/order";
import type { QuestionnaireResponses, FollowUpQA } from "@/types/questionnaire";
import type { GenerationSettings } from "@/types/page";

// POST /api/orders/[orderId]/generate-story?token=...
//
// Orchestrates the full story generation pipeline:
//   1. Validate token + order state
//   2. Build StoryProfile from questionnaire + follow-up data
//   3. Generate 40-page outline via Claude
//   4. Generate Hebrew rhymed text for each page via Claude
//   5. Review pass — regenerate weak pages
//   6. Persist pages + page_versions to DB
//   7. Transition order to preview_ready
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = request.nextUrl.searchParams.get("token");

  console.log(`[DIAG][generate-story] ▶ orderId=${orderId} token=${token ? token.slice(0, 8) + "…" : "null"}`);

  const supabase = createAdminClient();
  const auth = await authorizeOrderRequest(supabase, orderId, token);

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 404 ? "Order not found" : "Forbidden" },
      { status: auth.status }
    );
  }

  const currentStatus = auth.order.status as OrderStatus;

  // ── Accept all statuses from which regeneration makes sense ──
  const ALLOWED_START: OrderStatus[] = [
    "enrichment_complete",
    "photos_uploaded",
    "revision_requested",
    "error_generation",
    "preview_ready",  // admin regenerates from preview
    "admin_review",   // admin regenerates during review
  ];

  if (!ALLOWED_START.includes(currentStatus)) {
    return NextResponse.json(
      {
        error: "Order is not in a state that allows story generation",
        current_status: currentStatus,
        allowed_statuses: ALLOWED_START,
      },
      { status: 409 }
    );
  }

  // ── Resolve generation settings (soft-fail: use provider defaults if not seeded) ──
  let generationSettings: GenerationSettings | null = null;
  try {
    generationSettings = await resolveGenerationSettings(
      supabase,
      orderId,
      "story"
    );
  } catch {
    // Settings not seeded — providers use built-in defaults. That's fine.
  }

  // ── Create a processing_job row ──
  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      order_id: orderId,
      job_type: "generate_story",
      status: "processing",
      started_at: new Date().toISOString(),
      attempts: 1,
      generation_settings_id: generationSettings?.id ?? null,
      input_data: {
        order_id: orderId,
        generation_settings_id: generationSettings?.id ?? null,
      },
    })
    .select("id")
    .single();

  const jobId: string | null = jobError ? null : (job?.id as string);

  // ── If starting from enrichment_complete, advance to photos_uploaded ──
  if (currentStatus === "enrichment_complete") {
    try {
      assertTransition("enrichment_complete", "photos_uploaded");
      const { error } = await supabase
        .from("orders")
        .update({ status: "photos_uploaded" })
        .eq("id", orderId);
      if (error) throw error;
    } catch (err) {
      await failJob(supabase, jobId, String(err));
      return NextResponse.json(
        { error: "Failed to advance order state" },
        { status: 500 }
      );
    }
  }

  // ── Transition to generating_text ──
  const preGeneratingStatus: OrderStatus =
    currentStatus === "enrichment_complete" ? "photos_uploaded" : currentStatus;

  try {
    assertTransition(preGeneratingStatus, "generating_text");
    const { error } = await supabase
      .from("orders")
      .update({ status: "generating_text" })
      .eq("id", orderId);
    if (error) throw error;
  } catch (err) {
    await failJob(supabase, jobId, String(err));
    return NextResponse.json(
      { error: "Failed to start text generation", detail: String(err) },
      { status: 500 }
    );
  }

  // ── Load questionnaire + follow-up data ──
  const { data: qData } = await supabase
    .from("questionnaire_responses")
    .select("responses, followup_questions")
    .eq("order_id", orderId)
    .single();

  const responses =
    (qData?.responses as Partial<QuestionnaireResponses>) ?? {};
  const followupQA = (qData?.followup_questions as FollowUpQA[]) ?? [];

  const responseKeys = Object.keys(responses).filter((k) => !!(responses as Record<string, unknown>)[k]);
  console.log(`[DIAG][generate-story] questionnaire: qData=${qData ? "loaded" : "NULL"} responseKeys(${responseKeys.length})=${JSON.stringify(responseKeys)} followups=${followupQA.length}`);

  // Fetch person details not included in the minimal AuthorizedOrder
  const { data: orderDetails } = await supabase
    .from("orders")
    .select("person_name, person_gender")
    .eq("id", orderId)
    .single();

  const personName = (orderDetails?.person_name as string | null) ?? "";
  const personGender =
    (orderDetails?.person_gender as "male" | "female" | null) ?? "male";

  // ── Run generation pipeline ──
  try {
    // 1. Build story profile
    const profile = buildStoryProfile(
      responses,
      followupQA,
      personName,
      personGender
    );

    const nonEmptySections = (Object.entries(profile) as [string, string][])
      .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
      .map(([k]) => k);
    console.log(`[DIAG][generate-story] profile: subject=${profile.subject_name} gender=${profile.person_gender} nonEmptySections=${JSON.stringify(nonEmptySections)}`);
    console.log(`[DIAG][generate-story] profile.emotional_highlights(${profile.emotional_highlights?.length ?? 0} chars): ${profile.emotional_highlights?.slice(0, 120) ?? "EMPTY"}`);

    // 2. Generate album outline
    const outline = await generateAlbumOutline(profile, generationSettings);

    console.log(`[DIAG][generate-story] outline: ${outline.length} pages generated`);

    // 3. Generate page texts
    const rawPages = await generatePageTexts(
      profile,
      outline,
      generationSettings
    );

    console.log(`[DIAG][generate-story] rawPages: ${rawPages.length} pages from Claude`);
    console.log(`[DIAG][generate-story] rawPages sample(p2): ${JSON.stringify(rawPages.find((p) => p.page_number === 2)?.text_content?.slice(0, 80) ?? "not found")}`);
    const placeholderCount = rawPages.filter((p) => p.text_content?.startsWith("⚠️")).length;
    if (placeholderCount > 0) console.warn(`[DIAG][generate-story] ⚠ ${placeholderCount} pages have placeholder text`);

    // 4. Review pass
    const { pages: finalPages, review } = await reviewAndFixStory(
      rawPages,
      generationSettings
    );

    // 5. Create a new story_draft row for this generation run
    const { data: maxDraftRow } = await supabase
      .from("story_drafts")
      .select("version_number")
      .eq("order_id", orderId)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    const nextVersionNumber = ((maxDraftRow?.version_number as number | null) ?? 0) + 1;

    const { data: newDraft, error: draftError } = await supabase
      .from("story_drafts")
      .insert({
        order_id: orderId,
        version_number: nextVersionNumber,
        generation_settings_id: generationSettings?.id ?? null,
      })
      .select("id")
      .single();

    if (draftError || !newDraft) {
      throw new Error(`Failed to create story draft: ${draftError?.message ?? "unknown"}`);
    }

    const draftId = newDraft.id as string;
    console.log(`[DIAG][generate-story] created story_draft id=${draftId} version=${nextVersionNumber}`);

    // 6. Build all 40 page rows: structural (cover, back-cover) + text pages
    const coverItem = outline.find((o) => o.page_type === "cover");
    const backCoverItem = outline.find((o) => o.page_type === "back_cover");

    const pageRows = [
      // Cover page
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
      // Text pages (dedication + story)
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
      // Back cover page
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

    console.log(`[DIAG][generate-story] pageRows to insert: ${pageRows.length} (cover + ${finalPages.length} text + back_cover)`);

    const { data: insertedPages, error: pagesError } = await supabase
      .from("pages")
      .insert(pageRows)
      .select("id, page_number, text_content");

    console.log(`[DIAG][generate-story] DB insert: inserted=${insertedPages?.length ?? "null"} error=${pagesError ? pagesError.message : "none"}`);

    if (pagesError) {
      throw new Error(`Failed to save pages: ${pagesError.message}`);
    }

    // 7. Insert page_versions for every page with text
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
          console.error("Failed to save page_versions:", versionsError.message);
          // Non-fatal — pages are saved, versions are audit log
        }
      }
    }

    // 8. Chain state transitions: generating_text → text_ready → generating_illustrations → preview_ready
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
      if (error) throw new Error(`Failed to transition ${from} → ${to}: ${error.message}`);
    }

    // 9. Mark processing job complete
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

    return NextResponse.json({
      success: true,
      order_status: "preview_ready",
      pages_saved: insertedPages?.length ?? 0,
      story_draft_id: draftId,
      story_version: nextVersionNumber,
      review: {
        issues_detected: review.issues.length,
        regenerated: review.regenerated_count,
      },
    });
  } catch (err) {
    console.error("Story generation failed:", err);

    // Transition to error state
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
      // Best-effort
    }

    await failJob(supabase, jobId, String(err));

    return NextResponse.json(
      {
        error: "Story generation failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

async function failJob(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  jobId: string | null,
  errorMessage: string
): Promise<void> {
  if (!jobId) return;
  await supabase
    .from("processing_jobs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq("id", jobId);
}
