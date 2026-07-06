import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertTransition } from "@/lib/state-machine";
import { sendPreviewReadyEmail } from "@/lib/email/send-preview-ready";
import {
  generateAccessToken,
  generateAccessTokenExpiry,
} from "@/lib/access-token";
import type { OrderStatus } from "@/types/order";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Verify caller is an authenticated admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const adminClient = createAdminClient();

  // Fetch current order with fields needed for email
  const { data: order, error: fetchError } = await adminClient
    .from("orders")
    .select(
      "id, status, buyer_email, buyer_name, person_name, access_token, access_token_expires_at, preview_round, preview_status, completed_at"
    )
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const currentStatus = order.status as OrderStatus;

  // Truly terminal states: no further preview rounds once delivered/completed.
  const isTerminal = currentStatus === "delivered" || Boolean(order.completed_at);
  if (isTerminal) {
    return NextResponse.json(
      {
        error: `Cannot publish a new preview: order is in a terminal state ("${currentStatus}").`,
      },
      { status: 409 }
    );
  }

  // Once an order has been published at least once (status "approved"), admin
  // can always publish another preview round — regardless of whether the
  // previous round was approved, has no feedback yet, or had changes requested.
  const isRepublish = currentStatus === "approved";

  if (!isRepublish) {
    try {
      assertTransition(currentStatus, "approved");
    } catch {
      return NextResponse.json(
        {
          error: `Cannot publish from status "${currentStatus}". Order must be in preview_ready or admin_review.`,
        },
        { status: 409 }
      );
    }
  }

  // Ensure a valid access token exists (refresh if expired or missing)
  let accessToken = order.access_token as string | null;
  const tokenUpdate: Record<string, unknown> = {};

  if (!accessToken) {
    accessToken = generateAccessToken();
    tokenUpdate.access_token = accessToken;
    tokenUpdate.access_token_expires_at = generateAccessTokenExpiry().toISOString();
  } else {
    const expiresAt = order.access_token_expires_at as string | null;
    if (!expiresAt || new Date(expiresAt) < new Date()) {
      // Token expired — regenerate
      accessToken = generateAccessToken();
      tokenUpdate.access_token = accessToken;
      tokenUpdate.access_token_expires_at = generateAccessTokenExpiry().toISOString();
    }
  }

  const now = new Date().toISOString();
  const newPreviewRound = ((order.preview_round as number) || 0) + 1;

  // Update order: status + preview loop fields.
  // Every new publish starts a fresh review round: it is not yet approved,
  // and any feedback/approval from a prior round no longer applies.
  const { error: updateError } = await adminClient
    .from("orders")
    .update({
      status: "approved",
      updated_at: now,
      preview_status: "sent_to_customer",
      preview_sent_at: now,
      preview_round: newPreviewRound,
      preview_approved_at: null,
      preview_feedback: null,
      preview_feedback_at: null,
      ...tokenUpdate,
    })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to publish order" },
      { status: 500 }
    );
  }

  // Send the preview ready email (best-effort — don't fail the publish if email fails)
  let emailSent = false;
  try {
    await sendPreviewReadyEmail({
      buyerEmail: order.buyer_email as string,
      buyerName: order.buyer_name as string,
      personName: order.person_name as string,
      orderId,
      accessToken,
    });
    emailSent = true;
  } catch (err) {
    console.error("[publish] Preview email failed (order still published):", err);
  }

  return NextResponse.json({
    success: true,
    status: "approved",
    preview_round: newPreviewRound,
    email_sent: emailSent,
  });
}
