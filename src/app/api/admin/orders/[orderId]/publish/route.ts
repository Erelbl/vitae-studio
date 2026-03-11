import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertTransition } from "@/lib/state-machine";
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

  // Fetch current order status
  const { data: order, error: fetchError } = await adminClient
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const currentStatus = order.status as OrderStatus;

  // Allow publish from preview_ready or admin_review
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

  const { error: updateError } = await adminClient
    .from("orders")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to publish order" }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: "approved" });
}
