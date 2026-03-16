import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrderRequest } from "@/lib/order-auth";
import { assertTransition } from "@/lib/state-machine";
import { calculateOrderPricing } from "@/lib/pricing";
import { createPaymentPage } from "@/services/payment/cardcom";
import type { OrderStatus, PricingSnapshot, DeliveryMode, AlbumSize } from "@/types/order";

/**
 * POST /api/orders/[orderId]/pay?token=...
 *
 * Initiates a CardCom payment for a ready_for_payment order.
 * Returns a redirect URL for the client.
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

  const currentStatus = auth.order.status as OrderStatus;

  // Only allow payment from ready_for_payment (or payment_pending for retry)
  if (currentStatus !== "ready_for_payment" && currentStatus !== "payment_pending") {
    return NextResponse.json(
      { error: `Cannot initiate payment from status: ${currentStatus}` },
      { status: 409 }
    );
  }

  // Fetch full order for pricing verification
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, delivery_mode, album_size, pricing_snapshot, buyer_name, buyer_email, buyer_phone, person_name, access_token"
    )
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const pricing = order.pricing_snapshot as PricingSnapshot | null;
  if (!pricing || !order.delivery_mode) {
    return NextResponse.json(
      { error: "Order not configured for payment" },
      { status: 400 }
    );
  }

  // Re-validate price against canonical server pricing
  const canonical = calculateOrderPricing({
    deliveryMode: order.delivery_mode as DeliveryMode,
    albumSize: (order.album_size as AlbumSize) ?? null,
  });

  if (canonical.totalPriceIls !== pricing.total_price_ils) {
    return NextResponse.json(
      { error: "Pricing mismatch — please reconfigure your order" },
      { status: 409 }
    );
  }

  const totalIls = pricing.total_price_ils;

  // Create payment attempt record
  const returnValue = `pa_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

  const { data: attempt, error: insertError } = await supabase
    .from("payment_attempts")
    .insert({
      order_id: orderId,
      provider: "cardcom",
      return_value: returnValue,
      amount_ils: totalIls * 100, // store in agorot for precision
      currency: "ILS",
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !attempt) {
    console.error("Failed to create payment attempt:", insertError);
    return NextResponse.json(
      { error: "Failed to create payment attempt" },
      { status: 500 }
    );
  }

  // Build URLs
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const accessToken = order.access_token as string;
  const successUrl = `${appUrl}/order/${orderId}/payment-return?token=${accessToken}&status=success`;
  const failureUrl = `${appUrl}/order/${orderId}/payment-return?token=${accessToken}&status=failed`;
  const webhookUrl = `${appUrl}/api/webhooks/cardcom`;

  // Build product name for CardCom
  const DELIVERY_LABELS: Record<string, string> = {
    film: "סרט סיפור חיים בחרוזים",
    print: "אלבום סיפור חיים בחרוזים",
    bundle: "אלבום + סרט סיפור חיים בחרוזים",
  };
  const productName = DELIVERY_LABELS[pricing.delivery_mode] ?? "Vitae Studio";

  // Call CardCom
  const result = await createPaymentPage({
    totalIls,
    productName,
    returnValue,
    successUrl,
    failureUrl,
    webhookUrl,
    customerName: (order.buyer_name as string) || (order.person_name as string) || "",
    customerEmail: (order.buyer_email as string) || "",
    customerPhone: (order.buyer_phone as string) || "",
    invoiceDescription: productName,
  });

  // Store provider response on the payment attempt
  await supabase
    .from("payment_attempts")
    .update({
      provider_page_code: result.lowProfileCode,
      provider_create_response: result.rawResponse,
      status: result.success ? "redirected" : "failed",
      error_message: result.error,
    })
    .eq("id", attempt.id);

  if (!result.success || !result.redirectUrl) {
    return NextResponse.json(
      { error: result.error || "Failed to create payment page" },
      { status: 502 }
    );
  }

  // Transition order to payment_pending if coming from ready_for_payment
  if (currentStatus === "ready_for_payment") {
    try {
      assertTransition(currentStatus, "payment_pending");
      await supabase
        .from("orders")
        .update({ status: "payment_pending" })
        .eq("id", orderId);
    } catch {
      // Non-fatal — payment can still proceed
      console.warn("Could not transition to payment_pending, continuing anyway");
    }
  }

  return NextResponse.json({
    redirectUrl: result.redirectUrl,
  });
}
