import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ orderId: string }> };

// PUT /api/admin/orders/[orderId]/album-length
// Sets the target_page_count for the album.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { orderId } = await params;

  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { target_page_count } = body as { target_page_count: number };

  // Validate
  if (typeof target_page_count !== "number") {
    return NextResponse.json(
      { error: "target_page_count must be a number" },
      { status: 400 }
    );
  }
  if (target_page_count < 20 || target_page_count > 40) {
    return NextResponse.json(
      { error: "target_page_count must be between 20 and 40" },
      { status: 400 }
    );
  }
  if (target_page_count % 2 !== 0) {
    return NextResponse.json(
      { error: "target_page_count must be even" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // Verify order exists
  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { error: updateError } = await adminClient
    .from("orders")
    .update({ target_page_count })
    .eq("id", orderId);

  if (updateError) {
    console.error("Error updating target_page_count:", updateError);
    return NextResponse.json(
      { error: "Failed to update album length" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, target_page_count });
}
