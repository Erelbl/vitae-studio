import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrderRequest } from "@/lib/order-auth";

/**
 * GET /api/orders/[orderId]/payment-status?token=...
 *
 * Lightweight endpoint for the return page to poll.
 * Returns only the payment_status and order status — no sensitive data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = request.nextUrl.searchParams.get("token");

  const supabase = createAdminClient();
  const auth = await authorizeOrderRequest(supabase, orderId, token);
  if (!auth.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("payment_status, status")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    payment_status: order.payment_status,
    order_status: order.status,
  });
}
