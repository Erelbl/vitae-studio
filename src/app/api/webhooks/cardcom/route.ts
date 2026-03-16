import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseWebhookPayload,
  parseCardComResponse,
  type CardComWebhookPayload,
} from "@/services/payment/cardcom";

/**
 * POST /api/webhooks/cardcom
 *
 * Server-to-server report from CardCom after payment attempt.
 * This is the SOURCE OF TRUTH for payment confirmation — not the browser return.
 *
 * Idempotent: safe to call multiple times for the same transaction.
 * CardCom expects HTTP 200 response to acknowledge receipt.
 */
export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    console.error("[cardcom-webhook] Failed to read request body");
    return new NextResponse("OK", { status: 200 });
  }

  // Parse webhook body. CardCom may send semicolon-delimited key=value (same
  // format as its API responses) or standard URL-encoded form data. Use the
  // shared parser that handles both, with JSON as a further fallback.
  let payload: CardComWebhookPayload;
  try {
    payload = parseCardComResponse(rawBody) as CardComWebhookPayload;
  } catch {
    console.error("[cardcom-webhook] Failed to parse payload:", rawBody.slice(0, 500));
    return new NextResponse("OK", { status: 200 });
  }

  const parsed = parseWebhookPayload(payload);

  console.log(
    `[cardcom-webhook] ReturnValue=${parsed.returnValue} ResponseCode=${parsed.responseCode} TxId=${parsed.transactionId} Success=${parsed.success}`
  );

  if (!parsed.returnValue) {
    console.error("[cardcom-webhook] Missing ReturnValue, ignoring");
    return new NextResponse("OK", { status: 200 });
  }

  const supabase = createAdminClient();

  // Find the payment attempt by our return_value reference
  const { data: attempt, error: findError } = await supabase
    .from("payment_attempts")
    .select("id, order_id, status, provider_transaction_id")
    .eq("return_value", parsed.returnValue)
    .single();

  if (findError || !attempt) {
    console.error(
      `[cardcom-webhook] No payment attempt found for ReturnValue=${parsed.returnValue}`,
      findError
    );
    return new NextResponse("OK", { status: 200 });
  }

  // Idempotency: if already completed, skip processing but still return OK
  if (attempt.status === "completed") {
    console.log(
      `[cardcom-webhook] attempt=${attempt.id} order=${attempt.order_id} already completed, skipping`
    );
    return new NextResponse("OK", { status: 200 });
  }

  if (parsed.success) {
    // ── Payment succeeded ──
    await processSuccessfulPayment(supabase, attempt, parsed);
  } else {
    // ── Payment failed ──
    await processFailedPayment(supabase, attempt, parsed);
  }

  return new NextResponse("OK", { status: 200 });
}

// Also handle GET in case CardCom sends a GET report
export async function GET(request: NextRequest) {
  // Some CardCom setups send GET with query params
  const payload: CardComWebhookPayload = {};
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    payload[key] = value;
  }

  if (!payload.ReturnValue) {
    return new NextResponse("OK", { status: 200 });
  }

  // Reuse POST logic by constructing a fake request
  const fakeRequest = new NextRequest(request.url, {
    method: "POST",
    body: new URLSearchParams(payload as Record<string, string>).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return POST(fakeRequest);
}

// ---------------------------------------------------------------------------
// Process successful payment
// ---------------------------------------------------------------------------

async function processSuccessfulPayment(
  supabase: ReturnType<typeof createAdminClient>,
  attempt: { id: string; order_id: string },
  parsed: ReturnType<typeof parseWebhookPayload>
) {
  const now = new Date().toISOString();

  // Update payment attempt
  await supabase
    .from("payment_attempts")
    .update({
      status: "completed",
      provider_transaction_id: parsed.transactionId,
      provider_approval_number: parsed.approvalNumber,
      invoice_number: parsed.invoiceNumber,
      invoice_type: parsed.invoiceType,
      provider_webhook_payload: parsed.raw,
      paid_at: now,
    })
    .eq("id", attempt.id);

  // Update order — mark as paid and advance to photos_uploaded
  const orderUpdate: Record<string, unknown> = {
    payment_status: "paid",
    payment_method: "cardcom",
    payment_date: now,
    status: "photos_uploaded",
  };

  // Invoice tracking on order
  if (parsed.invoiceNumber) {
    orderUpdate.invoice_number = parsed.invoiceNumber;
    orderUpdate.invoice_status = "issued";
  }

  const { error: orderError } = await supabase
    .from("orders")
    .update(orderUpdate)
    .eq("id", attempt.order_id)
    // Only update if still in a payment-related state (idempotency)
    .in("status", ["ready_for_payment", "payment_pending"]);

  if (orderError) {
    console.error(
      `[cardcom-webhook] Failed to update order ${attempt.order_id}:`,
      orderError
    );
  } else {
    console.log(
      `[cardcom-webhook] Order ${attempt.order_id} marked as paid, status → photos_uploaded`
    );
  }
}

// ---------------------------------------------------------------------------
// Process failed payment
// ---------------------------------------------------------------------------

async function processFailedPayment(
  supabase: ReturnType<typeof createAdminClient>,
  attempt: { id: string; order_id: string },
  parsed: ReturnType<typeof parseWebhookPayload>
) {
  await supabase
    .from("payment_attempts")
    .update({
      status: "failed",
      provider_transaction_id: parsed.transactionId,
      provider_webhook_payload: parsed.raw,
      error_message: parsed.description || `Error code: ${parsed.responseCode}`,
    })
    .eq("id", attempt.id);

  // Revert order back to ready_for_payment so user can retry
  await supabase
    .from("orders")
    .update({ status: "ready_for_payment" })
    .eq("id", attempt.order_id)
    .eq("status", "payment_pending");

  console.log(
    `[cardcom-webhook] Payment failed for order ${attempt.order_id}: ${parsed.description}`
  );
}
