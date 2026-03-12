import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrderRequest } from "@/lib/order-auth";
import { assertTransition } from "@/lib/state-machine";
import { resolveGenerationSettings } from "@/lib/generation-settings";
import { runGenerationPipeline } from "@/services/story/run-generation-pipeline";
import type { OrderStatus } from "@/types/order";
import type { QuestionnaireResponses, FollowUpQA } from "@/types/questionnaire";
import type { GenerationSettings } from "@/types/page";

// Allow up to 300s — pipeline runs synchronously here.
// This route is called from photos/complete's after() which already runs in a
// real browser-request context, so after() is not needed inside this route.
// Admin-triggered generation goes through /api/admin/orders/[orderId]/generate
// which manages its own after() directly.
export const maxDuration = 300;

// POST /api/orders/[orderId]/generate-story?token=...
//
// Synchronous story generation pipeline — called from the photos/complete
// after() callback (where the outer after() is already in a real request context).
//
// Flow:
//   1. Validate token + order state
//   2. Create processing_job row
//   3. Resolve generation settings
//   4. Create story_draft row with status='generating'
//   5. Load questionnaire + person data
//   6. Transition order to generating_text
//   7. Run full Claude pipeline synchronously
//   8. Return result
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = request.nextUrl.searchParams.get("token");

  console.log(
    `[generate-story] ▶ orderId=${orderId} token=${token ? token.slice(0, 8) + "…" : "null"}`
  );

  const supabase = createAdminClient();
  const auth = await authorizeOrderRequest(supabase, orderId, token);

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 404 ? "Order not found" : "Forbidden" },
      { status: auth.status }
    );
  }

  const currentStatus = auth.order.status as OrderStatus;

  const ALLOWED_START: OrderStatus[] = [
    "enrichment_complete",
    "photos_uploaded",
    "revision_requested",
    "error_generation",
    "preview_ready",
    "admin_review",
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

  // ── Resolve generation settings (soft-fail) ──
  let generationSettings: GenerationSettings | null = null;
  try {
    generationSettings = await resolveGenerationSettings(
      supabase,
      orderId,
      "story"
    );
  } catch {
    // Settings not seeded — providers use built-in defaults
  }

  // ── Create processing_job row ──
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

  // ── Determine next version number and create story_draft immediately ──
  const { data: maxDraftRow } = await supabase
    .from("story_drafts")
    .select("version_number")
    .eq("order_id", orderId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const nextVersionNumber =
    ((maxDraftRow?.version_number as number | null) ?? 0) + 1;

  const { data: newDraft, error: draftError } = await supabase
    .from("story_drafts")
    .insert({
      order_id: orderId,
      version_number: nextVersionNumber,
      generation_settings_id: generationSettings?.id ?? null,
      status: "generating",
    })
    .select("id")
    .single();

  if (draftError || !newDraft) {
    await failJob(
      supabase,
      jobId,
      `Failed to create story draft: ${draftError?.message ?? "unknown"}`
    );
    return NextResponse.json(
      { error: "Failed to create story draft" },
      { status: 500 }
    );
  }

  const draftId = newDraft.id as string;
  console.log(
    `[generate-story] created story_draft id=${draftId} version=${nextVersionNumber}`
  );

  // ── Load questionnaire + follow-up data ──
  const { data: qData } = await supabase
    .from("questionnaire_responses")
    .select("responses, followup_questions")
    .eq("order_id", orderId)
    .single();

  const responses =
    (qData?.responses as Partial<QuestionnaireResponses>) ?? {};
  const followupQA = (qData?.followup_questions as FollowUpQA[]) ?? [];

  // ── Load person details ──
  const { data: orderDetails } = await supabase
    .from("orders")
    .select("person_name, person_gender")
    .eq("id", orderId)
    .single();

  const personName = (orderDetails?.person_name as string | null) ?? "";
  const personGender =
    (orderDetails?.person_gender as "male" | "female" | null) ?? "male";

  // ── If starting from enrichment_complete, advance to photos_uploaded first ──
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
      await supabase
        .from("story_drafts")
        .update({ status: "failed", error_message: String(err) })
        .eq("id", draftId);
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
    await supabase
      .from("story_drafts")
      .update({ status: "failed", error_message: String(err) })
      .eq("id", draftId);
    return NextResponse.json(
      { error: "Failed to start text generation", detail: String(err) },
      { status: 500 }
    );
  }

  // ── Run the generation pipeline synchronously ──
  // (The caller — photos/complete's after() — already has a proper request
  //  context that keeps the function alive for up to maxDuration seconds.)
  await runGenerationPipeline({
    orderId,
    draftId,
    responses,
    followupQA,
    personName,
    personGender,
    generationSettings,
    jobId,
  });

  // Re-fetch order status so we can report the final state
  const { data: finalOrder } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();

  const { data: finalDraft } = await supabase
    .from("story_drafts")
    .select("status")
    .eq("id", draftId)
    .single();

  return NextResponse.json({
    success: finalDraft?.status === "completed",
    order_status: finalOrder?.status ?? "unknown",
    story_draft_id: draftId,
    story_version: nextVersionNumber,
    draft_status: finalDraft?.status ?? "unknown",
  });
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
