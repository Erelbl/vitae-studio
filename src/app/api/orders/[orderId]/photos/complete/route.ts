import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrderRequest } from "@/lib/order-auth";
import { assertTransition } from "@/lib/state-machine";
import type { OrderStatus } from "@/types/order";

// POST /api/orders/[orderId]/photos/complete?token=...
//
// Marks photo upload as done and transitions the order to photos_uploaded.
// Requires at least one uploaded photo.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = request.nextUrl.searchParams.get("token");

  const supabase = createAdminClient();
  const auth = await authorizeOrderRequest(supabase, orderId, token);

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 404 ? "Order not found" : "Forbidden" },
      { status: auth.status }
    );
  }

  // Must have at least one uploaded photo
  const { count, error: countError } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .eq("is_uploaded", true);

  if (countError) {
    return NextResponse.json({ error: "Failed to check photos" }, { status: 500 });
  }

  if ((count ?? 0) === 0) {
    return NextResponse.json(
      { error: "At least one photo must be uploaded" },
      { status: 422 }
    );
  }

  // Transition order status
  try {
    assertTransition(auth.order.status as OrderStatus, "photos_uploaded");
  } catch {
    return NextResponse.json(
      { error: "Invalid state transition", current_status: auth.order.status },
      { status: 409 }
    );
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "photos_uploaded" })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update order status" }, { status: 500 });
  }

  // Fire story generation in the background after responding to the client
  const accessToken = auth.order.access_token;
  const baseUrl = new URL(request.url).origin;
  after(async () => {
    try {
      console.log(`[photos/complete] Triggering generate-story for order ${orderId}`);
      const res = await fetch(
        `${baseUrl}/api/orders/${orderId}/generate-story?token=${accessToken}`,
        { method: "POST" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(`[photos/complete] generate-story returned ${res.status}:`, body);
      } else {
        console.log(`[photos/complete] generate-story started: pages_saved=${body.pages_saved}`);
      }
    } catch (err) {
      console.error("[photos/complete] Failed to trigger story generation:", err);
    }
  });

  return NextResponse.json({ status: "photos_uploaded" });
}
