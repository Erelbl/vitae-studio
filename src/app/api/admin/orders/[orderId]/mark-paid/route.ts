import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderConfirmationEmail } from "@/lib/email/send-order-confirmation";

/**
 * POST /api/admin/orders/[orderId]/mark-paid
 *
 * Admin marks an order as paid and sends the combined order confirmation email.
 * Body: { sendEmail?: boolean } — defaults to true.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const body = await req.json().catch(() => ({}));
  const shouldSendEmail = body.sendEmail !== false;

  const adminClient = createAdminClient();

  // Fetch order
  const { data: order, error: fetchError } = await adminClient
    .from("orders")
    .select("id, payment_status, buyer_email, buyer_name, person_name")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.payment_status === "paid") {
    return NextResponse.json(
      { error: "Order is already marked as paid" },
      { status: 409 }
    );
  }

  // Update payment status
  const { error: updateError } = await adminClient
    .from("orders")
    .update({
      payment_status: "paid",
      payment_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update payment status" },
      { status: 500 }
    );
  }

  // Send order confirmation email (best-effort)
  let emailSent = false;
  if (shouldSendEmail && order.buyer_email) {
    try {
      await sendOrderConfirmationEmail({
        buyerEmail: order.buyer_email as string,
        buyerName: order.buyer_name as string,
        personName: order.person_name as string,
      });
      emailSent = true;
    } catch (err) {
      console.error("[mark-paid] Confirmation email failed:", err);
    }
  }

  return NextResponse.json({
    success: true,
    payment_status: "paid",
    email_sent: emailSent,
  });
}
