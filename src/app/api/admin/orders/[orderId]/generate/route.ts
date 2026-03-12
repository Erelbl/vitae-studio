import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/admin/orders/[orderId]/generate
//
// Admin-only endpoint that triggers story generation for an order.
// Fetches the order's access token and forwards to the customer-facing
// generate-story route, which handles all state transitions and generation.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Verify admin session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderId } = await params;
  const adminClient = createAdminClient();

  // Fetch the order's access token (needed by generate-story route)
  const { data: order } = await adminClient
    .from("orders")
    .select("access_token, status")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!order.access_token) {
    return NextResponse.json(
      { error: "Order has no access token — regenerate it from the order detail page" },
      { status: 422 }
    );
  }

  // Forward to the generate-story route using the order's access token
  const baseUrl = new URL(request.url).origin;
  const res = await fetch(
    `${baseUrl}/api/orders/${orderId}/generate-story?token=${order.access_token}`,
    { method: "POST" }
  );

  const body = await res.json().catch(() => ({ error: "Invalid response" }));
  return NextResponse.json(body, { status: res.status });
}
