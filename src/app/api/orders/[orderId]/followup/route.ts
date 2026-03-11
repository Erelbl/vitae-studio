import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";
import { resolveGenerationSettings } from "@/lib/generation-settings";
import { assertTransition } from "@/lib/state-machine";
import { getFollowUpProvider } from "@/services/followup";
import type { OrderStatus } from "@/types/order";
import type { FollowUpQA } from "@/types/questionnaire";
import type { GenerationSettings } from "@/types/page";

// POST /api/orders/[orderId]/followup?token=...
//
// Generates 3-5 follow-up questions based on the completed questionnaire,
// stores them in questionnaire_responses.followup_questions, and transitions
// the order from questionnaire_complete → enrichment_complete.
//
// Never blocks the order flow: if generation fails or settings are not seeded,
// stores an empty questions array and still transitions to enrichment_complete.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = request.nextUrl.searchParams.get("token");

  const supabase = createAdminClient();

  // 1. Fetch order with token fields
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, status, access_token, access_token_expires_at, language, person_name, person_gender"
    )
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // 2. Validate access token
  const tokenResult = validateAccessToken(
    token,
    order.access_token as string | null,
    order.access_token_expires_at as string | null
  );
  if (!tokenResult.valid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Verify order is in the correct state
  const currentStatus = order.status as OrderStatus;
  if (currentStatus !== "questionnaire_complete") {
    return NextResponse.json(
      {
        error: "Order is not in questionnaire_complete state",
        current_status: currentStatus,
      },
      { status: 409 }
    );
  }

  // 4. Fetch questionnaire responses
  const { data: qResponse } = await supabase
    .from("questionnaire_responses")
    .select("responses, is_complete")
    .eq("order_id", orderId)
    .single();

  if (!qResponse?.is_complete) {
    return NextResponse.json(
      { error: "Questionnaire is not complete" },
      { status: 422 }
    );
  }

  // 5. Attempt follow-up question generation (soft failure — never blocks flow)
  let generatedQuestions: FollowUpQA[] = [];
  let generationError: string | null = null;

  try {
    // Resolve generation settings; if not seeded, fall back to null (provider uses defaults)
    let settings: GenerationSettings | null = null;
    try {
      settings = await resolveGenerationSettings(supabase, orderId, "followup");
    } catch (settingsErr) {
      // Settings not seeded yet — provider will use built-in defaults
      console.warn(
        "followup generation_settings not found, using provider defaults:",
        settingsErr
      );
    }

    const provider = getFollowUpProvider();
    const result = await provider.generateQuestions({
      questionnaire: (qResponse.responses as Record<string, string>) ?? {},
      personName: order.person_name as string,
      personGender: (order.person_gender as "male" | "female") ?? "male",
      language: (order.language as "he" | "en") ?? "he",
      settings,
    });

    generatedQuestions = result.questions;
  } catch (err) {
    generationError =
      err instanceof Error ? err.message : "Unknown generation error";
    console.error("Follow-up generation failed (non-blocking):", generationError);
    // generatedQuestions remains [] — order flow continues
  }

  // 6. Store generated questions (even if empty) in questionnaire_responses
  const { error: updateError } = await supabase
    .from("questionnaire_responses")
    .update({ followup_questions: generatedQuestions })
    .eq("order_id", orderId);

  if (updateError) {
    console.error("Failed to store follow-up questions:", updateError);
    // Non-fatal — proceed to transition
  }

  // 7. Transition order to enrichment_complete (always, regardless of generation outcome)
  try {
    assertTransition(currentStatus, "enrichment_complete");
    const { error: statusError } = await supabase
      .from("orders")
      .update({ status: "enrichment_complete" })
      .eq("id", orderId);

    if (statusError) {
      console.error("Failed to update order status:", statusError);
      return NextResponse.json(
        { error: "Failed to update order status" },
        { status: 500 }
      );
    }
  } catch (transitionErr) {
    console.error("State transition error:", transitionErr);
    return NextResponse.json(
      { error: "Invalid state transition" },
      { status: 409 }
    );
  }

  return NextResponse.json({
    questions: generatedQuestions,
    generation_error: generationError,
    order_status: "enrichment_complete",
  });
}
