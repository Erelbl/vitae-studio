import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertTransition } from "@/lib/state-machine";
import type { OrderStatus } from "@/types/order";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const body = await request.json();
  const { responses, isComplete } = body;

  const supabase = createAdminClient();

  // Upsert questionnaire responses
  const { error: qError } = await supabase
    .from("questionnaire_responses")
    .upsert(
      {
        order_id: orderId,
        responses,
        is_complete: isComplete ?? false,
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

  // If complete, transition order status
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
            occasion: responses.occasion || null,
            person_birth_date: responses.person_birth_date || null,
          })
          .eq("id", orderId);
      } catch (e) {
        // Status transition not valid, that's OK for re-saves
      }
    }
  }

  return NextResponse.json({ success: true });
}
