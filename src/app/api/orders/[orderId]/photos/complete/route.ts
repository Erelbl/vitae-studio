import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrderRequest } from "@/lib/order-auth";
import { assertTransition } from "@/lib/state-machine";
import type { OrderStatus } from "@/types/order";

// POST /api/orders/[orderId]/photos/complete?token=...
//
// Marks photo upload as done and transitions the order to photos_uploaded.
// Requires at least one uploaded photo.
// Story generation is NOT triggered here — it starts after payment.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = request.nextUrl.searchParams.get("token");

  const supabase = createAdminClient();
  const auth = await authorizeOrderRequest(supabase, orderId, token);

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 404 ? "Order not found" : "Forbidden" },
      { status: auth.status }
    );
  }

  // Must have at least one uploaded photo
  const { count, error: countError } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .eq("is_uploaded", true);

  if (countError) {
    return NextResponse.json({ error: "Failed to check photos" }, { status: 500 });
  }

  if ((count ?? 0) === 0) {
    return NextResponse.json(
      { error: "At least one photo must be uploaded" },
      { status: 422 }
    );
  }

  // Transition order status
  try {
    assertTransition(auth.order.status as OrderStatus, "photos_uploaded");
  } catch {
    return NextResponse.json(
      { error: "Invalid state transition", current_status: auth.order.status },
      { status: 409 }
    );
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "photos_uploaded" })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update order status" }, { status: 500 });
  }

  return NextResponse.json({ status: "photos_uploaded" });
}
