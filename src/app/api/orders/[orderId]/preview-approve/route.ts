import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrderRequest } from "@/lib/order-auth";
import { sendAdminNotificationEmail } from "@/lib/email/send-admin-notification";

/**
 * POST /api/orders/[orderId]/preview-approve?token=...
 *
 * Customer approves the preview. Updates preview_status to "approved".
 */
export async function POST(
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

  // Only allow approval when preview has been sent to customer
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, preview_status, person_name, buyer_name, preview_round")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status !== "approved") {
    return NextResponse.json(
      { error: "Preview is not available for approval" },
      { status: 409 }
    );
  }

  if (order.preview_status === "approved") {
    return NextResponse.json({ success: true, already_approved: true });
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      preview_status: "approved",
      preview_approved_at: now,
      updated_at: now,
    })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }

  // Notify admin (best-effort)
  try {
    await sendAdminNotificationEmail({
      type: "approved",
      orderId,
      personName: order.person_name as string,
      buyerName: order.buyer_name as string,
      previewRound: (order.preview_round as number) || 1,
    });
  } catch (err) {
    console.error("[preview-approve] Admin notification failed:", err);
  }

  return NextResponse.json({ success: true });
}
