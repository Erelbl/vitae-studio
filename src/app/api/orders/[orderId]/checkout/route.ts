import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrderRequest } from "@/lib/order-auth";
import { assertTransition } from "@/lib/state-machine";
import { checkoutSchema } from "@/lib/validation/checkout";
import { buildPricingSnapshot, requiresShipping } from "@/lib/pricing";
import type { OrderStatus } from "@/types/order";
import type { DeliveryMode, AlbumSize } from "@/types/order";

/**
 * POST: Submit checkout → validate → compute pricing → transition to ready_for_payment.
 * PATCH: Save intermediate checkout data (product selection, shipping) without status change.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = request.nextUrl.searchParams.get("token");
  const body = await request.json();

  const supabase = createAdminClient();
  const auth = await authorizeOrderRequest(supabase, orderId, token);
  if (!auth.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  }

  // Validate checkout data
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { delivery_mode, album_size, shipping } = parsed.data;

  // Compute pricing server-side (source of truth)
  let pricingSnapshot;
  try {
    pricingSnapshot = buildPricingSnapshot({
      deliveryMode: delivery_mode,
      albumSize: album_size,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }

  // Validate state transition — skip if already in a payment state (idempotent re-submit)
  const currentStatus = auth.order.status as OrderStatus;
  const alreadyInPaymentFlow =
    currentStatus === "ready_for_payment" || currentStatus === "payment_pending";

  if (!alreadyInPaymentFlow) {
    try {
      assertTransition(currentStatus, "ready_for_payment");
    } catch {
      return NextResponse.json(
        { error: `Cannot checkout from status: ${currentStatus}` },
        { status: 409 }
      );
    }
  }

  // Build update payload
  const update: Record<string, unknown> = {
    status: "ready_for_payment",
    delivery_mode,
    album_size,
    pricing_snapshot: pricingSnapshot,
    payment_amount: pricingSnapshot.total_price_ils,
    currency: "ILS",
  };

  // Shipping fields
  if (shipping && requiresShipping(delivery_mode)) {
    update.shipping_full_name = shipping.shipping_full_name;
    update.shipping_phone = shipping.shipping_phone;
    update.shipping_city = shipping.shipping_city;
    update.shipping_street = shipping.shipping_street;
    update.shipping_apartment = shipping.shipping_apartment;
    update.shipping_postal_code = shipping.shipping_postal_code;
    update.shipping_notes = shipping.shipping_notes;
  } else {
    // Clear shipping fields for film-only
    update.shipping_full_name = null;
    update.shipping_phone = null;
    update.shipping_city = null;
    update.shipping_street = null;
    update.shipping_apartment = null;
    update.shipping_postal_code = null;
    update.shipping_notes = null;
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update(update)
    .eq("id", orderId);

  if (updateError) {
    console.error("Error updating order for checkout:", updateError);
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    pricing: pricingSnapshot,
  });
}

/** PATCH: Save intermediate checkout data without changing order status. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = request.nextUrl.searchParams.get("token");
  const body = await request.json();

  const supabase = createAdminClient();
  const auth = await authorizeOrderRequest(supabase, orderId, token);
  if (!auth.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  }

  // Partial save — only update fields that are provided
  const update: Record<string, unknown> = {};

  if (body.delivery_mode) {
    const dm = body.delivery_mode as DeliveryMode;
    if (!["film", "print", "bundle"].includes(dm)) {
      return NextResponse.json({ error: "Invalid delivery_mode" }, { status: 400 });
    }
    update.delivery_mode = dm;
  }

  if (body.album_size !== undefined) {
    const as_ = body.album_size as AlbumSize | null;
    if (as_ !== null && !["25x25", "30x30"].includes(as_)) {
      return NextResponse.json({ error: "Invalid album_size" }, { status: 400 });
    }
    update.album_size = as_;
  }

  // Shipping fields — save whatever is provided
  const shippingFields = [
    "shipping_full_name",
    "shipping_phone",
    "shipping_city",
    "shipping_street",
    "shipping_apartment",
    "shipping_postal_code",
    "shipping_notes",
  ] as const;

  for (const field of shippingFields) {
    if (body[field] !== undefined) {
      update[field] = body[field];
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: true });
  }

  const { error } = await supabase
    .from("orders")
    .update(update)
    .eq("id", orderId);

  if (error) {
    console.error("Error saving checkout data:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
