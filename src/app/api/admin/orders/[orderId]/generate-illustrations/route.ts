import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIllustrationProvider } from "@/services/illustration";

// Allow up to 300s — each Gemini image call takes ~10–30s, and we may process several photos.
export const maxDuration = 300;

// POST /api/admin/orders/[orderId]/generate-illustrations
//
// Admin-only. Starts watercolor illustration generation for a selection of uploaded photos.
//
// Body: { photoIds: string[] }
//
// Flow:
//   1. Verify admin session
//   2. Validate body + ownership of photoIds
//   3. Mark selected photos as illustration_status = 'generating'
//   4. Return 202 immediately
//   5. after(): for each photo sequentially:
//      a. Create a signed URL for the source image in the originals bucket
//      b. Call Gemini image generation provider
//      c. Upload result to illustrations bucket at {orderId}/{photoId}.png
//      d. Update photo row with result (path, status, model, timestamp) or error
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // ── Verify admin ──
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderId } = await params;
  const adminClient = createAdminClient();

  // ── Parse body ──
  let photoIds: string[];
  try {
    const body = await request.json();
    if (!Array.isArray(body.photoIds) || body.photoIds.length === 0) {
      return NextResponse.json(
        { error: "photoIds must be a non-empty array" },
        { status: 400 }
      );
    }
    photoIds = body.photoIds as string[];
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log(
    `[generate-illustrations] orderId=${orderId} selectedPhotos=${photoIds.length}`
  );

  // ── Verify photos belong to this order and are uploaded ──
  const { data: photos, error: fetchError } = await adminClient
    .from("photos")
    .select("id, original_storage_path, original_filename, illustration_status")
    .eq("order_id", orderId)
    .eq("is_uploaded", true)
    .in("id", photoIds);

  if (fetchError) {
    console.error("[generate-illustrations] Failed to fetch photos:", fetchError);
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }

  if (!photos || photos.length === 0) {
    return NextResponse.json(
      { error: "No matching uploaded photos found for this order" },
      { status: 404 }
    );
  }

  // Skip photos already generating to avoid duplicate runs
  const eligiblePhotos = photos.filter(
    (p) => (p.illustration_status as string | null) !== "generating"
  );

  if (eligiblePhotos.length === 0) {
    return NextResponse.json(
      { message: "All selected photos are already being generated", started: 0 },
      { status: 200 }
    );
  }

  console.log(
    `[generate-illustrations] Eligible photos: ${eligiblePhotos.length} (skipped ${photos.length - eligiblePhotos.length} already generating)`
  );

  // ── Mark selected photos as generating ──
  const eligibleIds = eligiblePhotos.map((p) => p.id as string);
  const { error: markError } = await adminClient
    .from("photos")
    .update({ illustration_status: "generating", illustration_error: null })
    .in("id", eligibleIds);

  if (markError) {
    console.error("[generate-illustrations] Failed to mark photos as generating:", markError);
    return NextResponse.json({ error: "Failed to start generation" }, { status: 500 });
  }

  // ── Fire generation pipeline after the HTTP response ──
  after(async () => {
    console.log(
      `[generate-illustrations/after] Starting pipeline for ${eligiblePhotos.length} photos`
    );

    const provider = getIllustrationProvider();

    for (const photo of eligiblePhotos) {
      const photoId = photo.id as string;
      const storagePath = photo.original_storage_path as string;
      const filename = photo.original_filename as string;

      console.log(`[generate-illustrations/after] Processing photo ${photoId} (${filename})`);

      try {
        // Generate a short-lived signed URL for the source image
        const { data: signedData, error: signedError } = await adminClient.storage
          .from("originals")
          .createSignedUrl(storagePath, 600); // 10-minute URL, enough for download

        if (signedError || !signedData?.signedUrl) {
          throw new Error(`Could not create signed URL for source: ${signedError?.message}`);
        }

        // Generate the watercolor illustration
        const output = await provider.stylizeImage({
          sourceImageUrl: signedData.signedUrl,
          style: "watercolor",
          preserveIdentity: true,
          outputFormat: "png",
          outputWidth: 1024,
          outputHeight: 1024,
        });

        // Save to illustrations bucket: {orderId}/{photoId}.png
        const illustrationPath = `${orderId}/${photoId}.png`;

        const { error: uploadError } = await adminClient.storage
          .from("illustrations")
          .upload(illustrationPath, output.imageBuffer, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }

        console.log(
          `[generate-illustrations/after] ✓ Photo ${photoId} → illustrations/${illustrationPath}`
        );

        // Update the photo row with success
        await adminClient
          .from("photos")
          .update({
            illustration_storage_path: illustrationPath,
            illustration_status: "completed",
            illustration_model: output.modelUsed,
            illustration_generated_at: new Date().toISOString(),
            illustration_error: null,
          })
          .eq("id", photoId);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(
          `[generate-illustrations/after] ✗ Photo ${photoId} failed: ${errMsg}`
        );

        await adminClient
          .from("photos")
          .update({
            illustration_status: "failed",
            illustration_error: errMsg.slice(0, 500),
          })
          .eq("id", photoId);
      }
    }

    console.log(
      `[generate-illustrations/after] Pipeline complete for order ${orderId}`
    );
  });

  return NextResponse.json(
    {
      status: "generating",
      started: eligiblePhotos.length,
      photo_ids: eligibleIds,
    },
    { status: 202 }
  );
}
