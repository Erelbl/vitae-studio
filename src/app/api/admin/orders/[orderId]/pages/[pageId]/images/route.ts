import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PUT /api/admin/orders/[orderId]/pages/[pageId]/images
 *
 * Upsert or delete a slot in page_images.
 *
 * Body:
 *   { slot: 1|2, photoId: string }   — assign photo to slot (insert or update)
 *   { slot: 1|2, photoId: null }     — remove photo from slot (delete row)
 *   { slot: 1|2, photoId: string, crop_x: float, crop_y: float, scale: float }
 *                                    — assign + set crop/zoom
 *
 * When updating only crop/zoom on an already-assigned slot, include the current
 * photoId so the upsert preserves the photo assignment.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string; pageId: string }> }
) {
  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId, pageId } = await params;

  let body: {
    slot?: unknown;
    photoId?: string | null;
    crop_x?: number;
    crop_y?: number;
    scale?: number;
    frame_style?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const slot = body.slot;
  if (slot !== 1 && slot !== 2) {
    return NextResponse.json(
      { error: "slot must be 1 or 2" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // Verify page belongs to this order
  const { data: page } = await adminClient
    .from("pages")
    .select("id")
    .eq("id", pageId)
    .eq("order_id", orderId)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const photoId = body.photoId;

  // Delete case
  if (photoId === null) {
    await adminClient
      .from("page_images")
      .delete()
      .eq("page_id", pageId)
      .eq("slot", slot);
    return NextResponse.json({ ok: true });
  }

  // Validate photo belongs to order and has a completed illustration
  const { data: photo } = await adminClient
    .from("photos")
    .select("id, illustration_status, illustration_storage_path")
    .eq("id", photoId)
    .eq("order_id", orderId)
    .single();

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  if (photo.illustration_status !== "completed") {
    return NextResponse.json(
      { error: "Photo illustration is not completed" },
      { status: 400 }
    );
  }

  // Upsert: insert or update on conflict (page_id, slot)
  // Clear manual_image_path when assigning a photo so they don't coexist.
  const upsertData: Record<string, unknown> = {
    page_id: pageId,
    photo_id: photoId,
    manual_image_path: null,
    slot,
    crop_x: body.crop_x ?? 0.5,
    crop_y: body.crop_y ?? 0.5,
    scale: body.scale != null ? Math.max(0.1, body.scale) : 1,
  };
  if (body.frame_style !== undefined) upsertData.frame_style = body.frame_style;

  const { error } = await adminClient
    .from("page_images")
    .upsert(upsertData, { onConflict: "page_id,slot" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/admin/orders/[orderId]/pages/[pageId]/images
 *
 * Update crop/zoom on an existing slot without changing the photo.
 * Body: { slot: 1|2, crop_x: float, crop_y: float, scale: float }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string; pageId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId, pageId } = await params;

  let body: { slot?: unknown; crop_x?: number; crop_y?: number; scale?: number; frame_style?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const slot = body.slot;
  if (slot !== 1 && slot !== 2) {
    return NextResponse.json({ error: "slot must be 1 or 2" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Verify page belongs to order
  const { data: page } = await adminClient
    .from("pages")
    .select("id")
    .eq("id", pageId)
    .eq("order_id", orderId)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const cropUpdate: Record<string, unknown> = {};
  // Allow crop values outside [0,1] to support cross-spread image positioning
  if (body.crop_x !== undefined) cropUpdate.crop_x = Math.max(-0.5, Math.min(1.5, body.crop_x));
  if (body.crop_y !== undefined) cropUpdate.crop_y = Math.max(-0.5, Math.min(1.5, body.crop_y));
  if (body.scale !== undefined) cropUpdate.scale = Math.max(0.1, body.scale);
  if (body.frame_style !== undefined) cropUpdate.frame_style = body.frame_style; // null clears the style

  if (Object.keys(cropUpdate).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await adminClient
    .from("page_images")
    .update(cropUpdate)
    .eq("page_id", pageId)
    .eq("slot", slot as number);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
