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
      "id, status, buyer_email, buyer_name, person_name, access_token, access_token_expires_at, preview_round, preview_status"
    )
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const currentStatus = order.status as OrderStatus;

  // Allow publish from preview_ready, admin_review, or re-publish when
  // already approved with changes_requested (iteration support)
  const isRepublish =
    currentStatus === "approved" &&
    order.preview_status === "changes_requested";

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

  // Update order: status + preview loop fields
  const { error: updateError } = await adminClient
    .from("orders")
    .update({
      status: "approved",
      updated_at: now,
      preview_status: "sent_to_customer",
      preview_sent_at: now,
      preview_round: newPreviewRound,
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
