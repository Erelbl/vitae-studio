import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrderRequest } from "@/lib/order-auth";
import { sendAdminNotificationEmail } from "@/lib/email/send-admin-notification";

/**
 * POST /api/orders/[orderId]/preview-feedback?token=...
 *
 * Customer submits feedback on the preview. Body: { feedback: string }
 * Updates preview_status to "changes_requested".
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

  const body = await request.json().catch(() => null);
  const feedback = body?.feedback?.trim();

  if (!feedback || typeof feedback !== "string") {
    return NextResponse.json(
      { error: "Feedback text is required" },
      { status: 400 }
    );
  }

  if (feedback.length > 5000) {
    return NextResponse.json(
      { error: "Feedback too long (max 5000 characters)" },
      { status: 400 }
    );
  }

  // Fetch order to validate state
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
      { error: "Preview is not available for feedback" },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      preview_status: "changes_requested",
      preview_feedback: feedback,
      preview_feedback_at: now,
      updated_at: now,
    })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }

  // Notify admin (best-effort)
  try {
    await sendAdminNotificationEmail({
      type: "feedback",
      orderId,
      personName: order.person_name as string,
      buyerName: order.buyer_name as string,
      previewRound: (order.preview_round as number) || 1,
      feedback,
    });
  } catch (err) {
    console.error("[preview-feedback] Admin notification failed:", err);
  }

  return NextResponse.json({ success: true });
}
