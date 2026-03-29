import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { photoUpdateSchema } from "@/lib/validation/photo";

type RouteParams = { params: Promise<{ orderId: string; photoId: string }> };

// DELETE /api/admin/orders/[orderId]/photos/[photoId]
// Admin-only: delete original photo from storage, then remove DB record.
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { orderId, photoId } = await params;

  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();

  // Load photo row
  const { data: photo, error: fetchError } = await adminClient
    .from("photos")
    .select("id, original_storage_path")
    .eq("id", photoId)
    .eq("order_id", orderId)
    .single();

  if (fetchError || !photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  if (!photo.original_storage_path) {
    return NextResponse.json(
      { error: "Photo has no storage path" },
      { status: 422 }
    );
  }

  // Storage-first: delete from originals bucket
  const { error: storageError } = await adminClient.storage
    .from("originals")
    .remove([photo.original_storage_path]);

  if (storageError) {
    console.error("Storage deletion failed:", storageError);
    return NextResponse.json(
      { error: "Failed to delete file from storage", details: storageError.message },
      { status: 500 }
    );
  }

  // Only after successful storage deletion, remove DB record
  const { error: dbError } = await adminClient
    .from("photos")
    .delete()
    .eq("id", photoId)
    .eq("order_id", orderId);

  if (dbError) {
    console.error("DB deletion failed after storage deletion:", dbError);
    return NextResponse.json(
      { error: "File deleted from storage but failed to remove DB record", details: dbError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

// PATCH /api/admin/orders/[orderId]/photos/[photoId]
// Admin-only: confirm upload or update photo metadata.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { orderId, photoId } = await params;

  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();

  // Verify photo belongs to this order
  const { data: existing, error: fetchError } = await adminClient
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

  const { data: updated, error: updateError } = await adminClient
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
