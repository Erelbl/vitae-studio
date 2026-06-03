import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderStatus, PaymentStatus } from "@/types/order";

const ADMIN_SETTABLE_STATUSES = new Set<OrderStatus>([
  "enrichment_complete",
  "photos_uploaded",
  "ready_for_payment",
  "payment_pending",
  "admin_review",
  "preview_ready",
  "revision_requested",
  "delivered",
]);

const VALID_PAYMENT_STATUSES = new Set<PaymentStatus>([
  "pending",
  "paid",
  "refunded",
  "cancelled",
]);

/**
 * PATCH /api/admin/orders/[orderId]/update-status
 *
 * Admin-only direct override for order status and payment status.
 * Bypasses the state machine intentionally — admin knows the correct state.
 *
 * Body: { status?: OrderStatus, payment_status?: PaymentStatus }
 *
 * Side-effects when payment_status → 'paid':
 *   - Sets payment_date = now() if currently null
 *   - Sets payment_method = 'admin_manual' if currently null
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const body = await req.json().catch(() => ({}));
  const { status, payment_status } = body as {
    status?: OrderStatus;
    payment_status?: PaymentStatus;
  };

  if (!status && !payment_status) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  if (status && !ADMIN_SETTABLE_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `Invalid status: ${status}` },
      { status: 400 }
    );
  }

  if (payment_status && !VALID_PAYMENT_STATUSES.has(payment_status)) {
    return NextResponse.json(
      { error: `Invalid payment_status: ${payment_status}` },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  const { data: order, error: fetchErr } = await adminClient
    .from("orders")
    .select("payment_status, payment_date, payment_method")
    .eq("id", orderId)
    .single();

  if (fetchErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (status) updates.status = status;

  if (payment_status) {
    updates.payment_status = payment_status;
    if (payment_status === "paid") {
      if (!order.payment_date) updates.payment_date = new Date().toISOString();
      if (!order.payment_method) updates.payment_method = "admin_manual";
    }
  }

  const { error: updateErr } = await adminClient
    .from("orders")
    .update(updates)
    .eq("id", orderId);

  if (updateErr) {
    console.error("[update-status] Update failed:", updateErr);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
