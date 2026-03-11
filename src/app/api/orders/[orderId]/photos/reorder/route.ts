import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrderRequest } from "@/lib/order-auth";
import { photoReorderSchema } from "@/lib/validation/photo";

// PUT /api/orders/[orderId]/photos/reorder?token=...
//
// Reorders photos for an order by updating display_order on each record.
// The client sends the complete desired ordering; the server verifies that
// every supplied ID belongs to this order before writing.
export async function PUT(
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

  const body = await request.json();
  const parsed = photoReorderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const incomingIds = parsed.data.photos.map((p) => p.id);

  // Verify all submitted IDs belong to this order
  const { data: owned, error: fetchError } = await supabase
    .from("photos")
    .select("id")
    .eq("order_id", orderId)
    .in("id", incomingIds);

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to verify photo ownership" },
      { status: 500 }
    );
  }

  const ownedIds = new Set((owned ?? []).map((r) => r.id as string));
  const unauthorized = incomingIds.filter((id) => !ownedIds.has(id));
  if (unauthorized.length > 0) {
    return NextResponse.json(
      { error: "Some photo IDs do not belong to this order" },
      { status: 403 }
    );
  }

  // Apply updates. Supabase JS doesn't support bulk updates natively,
  // so we issue individual updates in parallel.
  const updates = parsed.data.photos.map(({ id, display_order }) =>
    supabase
      .from("photos")
      .update({ display_order })
      .eq("id", id)
      .eq("order_id", orderId)
  );

  const results = await Promise.all(updates);
  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    console.error("Some reorder updates failed:", failed.map((r) => r.error));
    return NextResponse.json(
      { error: "Failed to update some photo orders" },
      { status: 500 }
    );
  }

  return NextResponse.json({ reordered: parsed.data.photos.length });
}
