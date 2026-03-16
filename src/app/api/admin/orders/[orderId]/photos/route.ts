import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { photoUploadSchema } from "@/lib/validation/photo";

type RouteParams = { params: Promise<{ orderId: string }> };

// POST /api/admin/orders/[orderId]/photos
// Admin-only: creates a photo record and returns a signed upload URL.
// Same flow as the customer endpoint but uses admin auth instead of access tokens.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { orderId } = await params;

  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const body = await request.json();
  const parsed = photoUploadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // Auto-assign display_order: append after the current last photo
  let displayOrder = parsed.data.display_order;
  if (displayOrder === undefined) {
    const { count } = await adminClient
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);
    displayOrder = count ?? 0;
  }

  const ext = parsed.data.filename.split(".").pop()?.toLowerCase() || "jpg";
  const { data: photo, error: photoError } = await adminClient
    .from("photos")
    .insert({
      order_id: orderId,
      original_storage_path: "",
      original_filename: parsed.data.filename,
      mime_type: parsed.data.mime_type,
      file_size_bytes: parsed.data.file_size_bytes,
      life_stage: parsed.data.life_stage ?? null,
      display_order: displayOrder,
      caption: parsed.data.caption ?? null,
      is_uploaded: false,
    })
    .select("id")
    .single();

  if (photoError || !photo) {
    console.error("Error creating photo record:", photoError);
    return NextResponse.json(
      { error: "Failed to create photo record" },
      { status: 500 }
    );
  }

  const storagePath = `${orderId}/${photo.id}.${ext}`;

  const { data: uploadData, error: uploadError } = await adminClient.storage
    .from("originals")
    .createSignedUploadUrl(storagePath);

  if (uploadError || !uploadData) {
    console.error("Error creating upload URL:", uploadError);
    await adminClient.from("photos").delete().eq("id", photo.id);
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 }
    );
  }

  // Store the storage path
  await adminClient
    .from("photos")
    .update({ original_storage_path: storagePath })
    .eq("id", photo.id);

  return NextResponse.json(
    {
      photoId: photo.id,
      uploadUrl: uploadData.signedUrl,
      storagePath,
    },
    { status: 201 }
  );
}
