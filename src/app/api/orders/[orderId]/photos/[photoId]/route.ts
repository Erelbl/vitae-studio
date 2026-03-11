import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrderRequest } from "@/lib/order-auth";
import { photoUpdateSchema } from "@/lib/validation/photo";

type RouteParams = { params: Promise<{ orderId: string; photoId: string }> };

// PATCH /api/orders/[orderId]/photos/[photoId]?token=...
//
// Two use cases share this endpoint:
//   1. Confirm upload complete: { is_uploaded: true, width?: n, height?: n }
//      Call this immediately after the client finishes uploading to Supabase Storage.
//   2. Update metadata: any subset of { caption, life_stage, display_order }
//      Can be called at any time after the photo record exists.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { orderId, photoId } = await params;
  const token = request.nextUrl.searchParams.get("token");
  const supabase = createAdminClient();

  const auth = await authorizeOrderRequest(supabase, orderId, token);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 404 ? "Order not found" : "Forbidden" },
      { status: auth.status }
    );
  }

  // Verify photo belongs to this order
  const { data: existing, error: fetchError } = await supabase
    .from("photos")
    .select("id")
    .eq("id", photoId)
    .eq("order_id", orderId)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = photoUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("photos")
    .update(parsed.data)
    .eq("id", photoId)
    .select()
    .single();

  if (updateError) {
    console.error("Error updating photo:", updateError);
    return NextResponse.json(
      { error: "Failed to update photo" },
      { status: 500 }
    );
  }

  return NextResponse.json(updated);
}

// DELETE /api/orders/[orderId]/photos/[photoId]?token=...
//
// Deletes the photo record and its file from Supabase Storage.
// Only allowed while the order has not yet reached generating_text.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { orderId, photoId } = await params;
  const token = request.nextUrl.searchParams.get("token");
  const supabase = createAdminClient();

  const auth = await authorizeOrderRequest(supabase, orderId, token);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 404 ? "Order not found" : "Forbidden" },
      { status: auth.status }
    );
  }

  // Prevent deletion once generation has started
  const generationStartedStatuses = [
    "generating_text",
    "text_ready",
    "generating_illustrations",
    "preview_ready",
    "admin_review",
    "approved",
    "revision_requested",
    "generating_pdf",
    "delivered",
  ];
  if (generationStartedStatuses.includes(auth.order.status)) {
    return NextResponse.json(
      { error: "Cannot delete photos after generation has started" },
      { status: 409 }
    );
  }

  // Fetch photo to get storage path
  const { data: photo, error: fetchError } = await supabase
    .from("photos")
    .select("id, original_storage_path")
    .eq("id", photoId)
    .eq("order_id", orderId)
    .single();

  if (fetchError || !photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  // Delete from storage (best-effort — don't fail the whole request if storage delete fails)
  if (photo.original_storage_path) {
    await supabase.storage
      .from("originals")
      .remove([photo.original_storage_path]);
  }

  const { error: deleteError } = await supabase
    .from("photos")
    .delete()
    .eq("id", photoId);

  if (deleteError) {
    console.error("Error deleting photo record:", deleteError);
    return NextResponse.json(
      { error: "Failed to delete photo" },
      { status: 500 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
