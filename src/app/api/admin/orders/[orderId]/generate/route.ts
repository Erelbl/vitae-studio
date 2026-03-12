import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertTransition } from "@/lib/state-machine";
import { resolveGenerationSettings } from "@/lib/generation-settings";
import { runGenerationPipeline } from "@/services/story/run-generation-pipeline";
import type { OrderStatus } from "@/types/order";
import type { QuestionnaireResponses, FollowUpQA } from "@/types/questionnaire";
import type { GenerationSettings } from "@/types/page";

// Allow up to 300s so after() has time to complete the full Claude pipeline.
export const maxDuration = 300;

// POST /api/admin/orders/[orderId]/generate
//
// Admin-only endpoint. Does all setup synchronously (fast), then uses after()
// to run the heavy Claude pipeline in the background so the HTTP response
// returns immediately to the admin browser.
//
// Uses after() here — in the real admin browser-request context — rather than
// inside generate-story (server-to-server), because Vercel's waitUntil context
// that backs after() is only reliable for real client requests.
//
// Schema: operates on pages + page_versions. No story_drafts table.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Verify admin session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderId } = await params;
  const adminClient = createAdminClient();

  // ── Fetch order status + person details ──
  const { data: order } = await adminClient
    .from("orders")
    .select("status, person_name, person_gender")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const currentStatus = order.status as OrderStatus;

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
      adminClient,
      orderId,
      "story"
    );
  } catch {
    // Settings not seeded — providers use built-in defaults
  }

  // ── Create processing_job row ──
  const { data: job, error: jobError } = await adminClient
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

  // ── Load questionnaire + follow-up data ──
  const { data: qData } = await adminClient
    .from("questionnaire_responses")
    .select("responses, followup_questions")
    .eq("order_id", orderId)
    .single();

  const responses =
    (qData?.responses as Partial<QuestionnaireResponses>) ?? {};
  const followupQA = (qData?.followup_questions as FollowUpQA[]) ?? [];

  const personName = (order.person_name as string | null) ?? "";
  const personGender =
    (order.person_gender as "male" | "female" | null) ?? "male";

  // ── If starting from enrichment_complete, advance to photos_uploaded first ──
  if (currentStatus === "enrichment_complete") {
    try {
      assertTransition("enrichment_complete", "photos_uploaded");
      const { error } = await adminClient
        .from("orders")
        .update({ status: "photos_uploaded" })
        .eq("id", orderId);
      if (error) throw error;
    } catch (err) {
      if (jobId) {
        await adminClient
          .from("processing_jobs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: String(err),
          })
          .eq("id", jobId);
      }
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
    const { error } = await adminClient
      .from("orders")
      .update({ status: "generating_text" })
      .eq("id", orderId);
    if (error) throw error;
  } catch (err) {
    if (jobId) {
      await adminClient
        .from("processing_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: String(err),
        })
        .eq("id", jobId);
    }
    return NextResponse.json(
      { error: "Failed to start text generation", detail: String(err) },
      { status: 500 }
    );
  }

  console.log(
    `[admin/generate] orderId=${orderId} jobId=${jobId ?? "null"} transitioning to generating_text`
  );

  // ── Fire off the Claude pipeline after the HTTP response is sent ──
  // after() is called here — in the real admin browser-request context —
  // so Vercel's waitUntil correctly keeps this function alive until done.
  after(async () => {
    await runGenerationPipeline({
      orderId,
      responses,
      followupQA,
      personName,
      personGender,
      generationSettings,
      jobId,
    });
  });

  return NextResponse.json(
    {
      status: "generating",
      order_status: "generating_text",
      job_id: jobId,
    },
    { status: 202 }
  );
}
