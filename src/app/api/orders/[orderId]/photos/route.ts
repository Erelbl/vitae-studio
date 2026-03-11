import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrderRequest } from "@/lib/order-auth";
import { photoUploadSchema } from "@/lib/validation/photo";

// GET /api/orders/[orderId]/photos?token=...
// Returns all photos for the order, ordered by display_order.
// Only returns is_uploaded=true photos — pending records are excluded.
export async function GET(
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

  const { data, error } = await supabase
    .from("photos")
    .select("*")
    .eq("order_id", orderId)
    .eq("is_uploaded", true)
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch photos" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

// POST /api/orders/[orderId]/photos?token=...
// Creates a photo record and returns a signed upload URL.
// The client uploads directly to Supabase Storage, then calls
// PATCH /photos/[photoId] with { is_uploaded: true } to confirm completion.
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

  const body = await request.json();
  const parsed = photoUploadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // Auto-assign display_order if not provided: append after the current last photo.
  let displayOrder = parsed.data.display_order;
  if (displayOrder === undefined) {
    const { count } = await supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);
    displayOrder = count ?? 0;
  }

  const ext = parsed.data.filename.split(".").pop()?.toLowerCase() || "jpg";
  const { data: photo, error: photoError } = await supabase
    .from("photos")
    .insert({
      order_id: orderId,
      original_storage_path: "", // updated after upload confirmed
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

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("originals")
    .createSignedUploadUrl(storagePath);

  if (uploadError || !uploadData) {
    console.error("Error creating upload URL:", uploadError);
    // Clean up the orphaned record
    await supabase.from("photos").delete().eq("id", photo.id);
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 }
    );
  }

  // Store the storage path so PATCH can reference it later
  await supabase
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
