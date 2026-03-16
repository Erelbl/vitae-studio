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
// which manages its own after() directly in the admin's browser-request context.
export const maxDuration = 300;

// POST /api/orders/[orderId]/generate-story?token=...
//
// Synchronous story generation. Operates on the real schema:
//   pages (40 rows per order) + page_versions (per-page history).
// No story_drafts table.
//
// Flow:
//   1. Validate token + order state
//   2. Create processing_job row for tracking
//   3. Resolve generation settings
//   4. Load questionnaire + person data
//   5. Transition order to generating_text
//   6. Run full Claude pipeline synchronously (INSERT/UPDATE pages + page_versions)
//   7. Return result
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
    "payment_pending",
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

  // ── Create processing_job row for tracking ──
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
      return NextResponse.json(
        { error: "Failed to advance order state" },
        { status: 500 }
      );
    }
  }

  // ── Transition to generating_text ──
  // payment_pending → generating_text is the post-payment path (webhook triggers this)
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
    return NextResponse.json(
      { error: "Failed to start text generation", detail: String(err) },
      { status: 500 }
    );
  }

  console.log(`[generate-story] order=${orderId} transitioned to generating_text, starting pipeline`);

  // ── Run the generation pipeline synchronously ──
  await runGenerationPipeline({
    orderId,
    responses,
    followupQA,
    personName,
    personGender,
    generationSettings,
    jobId,
  });

  // Re-fetch order status and page count for the response
  const [{ data: finalOrder }, { count: pageCount }] = await Promise.all([
    supabase.from("orders").select("status").eq("id", orderId).single(),
    supabase
      .from("pages")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId),
  ]);

  return NextResponse.json({
    success: finalOrder?.status === "preview_ready",
    order_status: finalOrder?.status ?? "unknown",
    pages_saved: pageCount ?? 0,
  });
}
