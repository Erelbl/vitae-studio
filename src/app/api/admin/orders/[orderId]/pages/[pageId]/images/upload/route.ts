import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "illustrations";
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * POST /api/admin/orders/[orderId]/pages/[pageId]/images/upload
 *
 * Upload a manual image directly to a page slot.
 * Body: FormData with `file` (image) and `slot` (1|2).
 *
 * Stores the file in the illustrations bucket at:
 *   {orderId}/manual/{pageId}-slot{slot}.{ext}
 *
 * Upserts a page_images row with manual_image_path set and photo_id = null.
 * Returns { ok: true, imageUrl: string } with a fresh 1-hour signed URL.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string; pageId: string }> }
) {
  // Admin check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId, pageId } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const slotRaw = formData.get("slot");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const slot = Number(slotRaw);
  if (slot !== 1 && slot !== 2) {
    return NextResponse.json(
      { error: "slot must be 1 or 2" },
      { status: 400 }
    );
  }

  // Validate MIME type (server-side)
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      { error: "סוג קובץ לא נתמך. השתמש ב-JPEG, PNG, או WebP" },
      { status: 400 }
    );
  }

  // Validate size
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "הקובץ גדול מדי. המקסימום הוא 10MB" },
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

  // Build deterministic storage path (upsert-safe — same path on re-upload)
  const ext =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/webp"
        ? "webp"
        : "png";
  const storagePath = `${orderId}/manual/${pageId}-slot${slot}.${ext}`;

  // Upload to Supabase Storage (upsert: true overwrites existing)
  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await adminClient.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Upsert page_images row — sets manual_image_path, clears photo_id
  const { error: dbError } = await adminClient.from("page_images").upsert(
    {
      page_id: pageId,
      slot,
      manual_image_path: storagePath,
      photo_id: null,
      crop_x: 0,
      crop_y: 0,
      scale: 1,
    },
    { onConflict: "page_id,slot" }
  );

  if (dbError) {
    // Best-effort cleanup if DB fails
    await adminClient.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Return a fresh signed URL for immediate preview in the editor
  const { data: signed } = await adminClient.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json({ ok: true, imageUrl: signed?.signedUrl ?? null });
}
