import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertTransition } from "@/lib/state-machine";
import { authorizeOrderRequest } from "@/lib/order-auth";
import type { OrderStatus } from "@/types/order";

/** Map new album_type values to legacy occasion enum values stored on orders */
function albumTypeToOccasion(albumType: string | undefined): string | null {
  if (!albumType) return null;
  const map: Record<string, string> = {
    life_story_birthday: "birthday",
    wedding: "anniversary",
    anniversary: "anniversary",
    retirement: "retirement",
    memorial: "memorial",
    other: "other",
  };
  return map[albumType] ?? "other";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = request.nextUrl.searchParams.get("token");
  const body = await request.json();
  const { responses, isComplete, currentStep } = body;

  const supabase = createAdminClient();

  const auth = await authorizeOrderRequest(supabase, orderId, token);
  if (!auth.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  }

  // Upsert questionnaire responses
  const { error: qError } = await supabase
    .from("questionnaire_responses")
    .upsert(
      {
        order_id: orderId,
        responses,
        is_complete: isComplete ?? false,
        ...(typeof currentStep === "number" ? { current_step: currentStep } : {}),
      },
      { onConflict: "order_id" }
    );

  if (qError) {
    console.error("Error saving questionnaire:", qError);
    return NextResponse.json(
      { error: "Failed to save questionnaire" },
      { status: 500 }
    );
  }

  // If complete, transition order status and update denormalised fields
  if (isComplete) {
    const { data: order } = await supabase
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .single();

    if (order) {
      try {
        assertTransition(order.status as OrderStatus, "questionnaire_complete");
        await supabase
          .from("orders")
          .update({
            status: "questionnaire_complete",
            buyer_name: responses.buyer_name || "",
            buyer_email: responses.buyer_email || "",
            buyer_phone: responses.buyer_phone || "",
            occasion: albumTypeToOccasion(responses.album_type),
            person_name: responses.person_name || undefined,
            person_gender: responses.person_gender || undefined,
            person_birth_date: responses.person_birth_date || null,
          })
          .eq("id", orderId);

        // Skip the follow-up step entirely — advance directly to enrichment_complete
        await supabase
          .from("orders")
          .update({ status: "enrichment_complete" })
          .eq("id", orderId);
      } catch {
        // Status transition not valid – already completed, silently skip
      }
    }
  }

  return NextResponse.json({ success: true });
}
