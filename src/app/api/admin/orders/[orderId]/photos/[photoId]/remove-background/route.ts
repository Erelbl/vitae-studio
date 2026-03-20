import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import sharp from "sharp";

const BUCKET = "illustrations";

// Flood-fill thresholds for white background detection.
// Pixels with min(r,g,b) > FLOOD_THRESHOLD are eligible background candidates.
// Pixels with min(r,g,b) >= FULL_TRANSPARENT are set fully transparent.
// The range between the two gets linearly-interpolated alpha (feathering).
const FLOOD_THRESHOLD = 220;
const FULL_TRANSPARENT = 245;

/**
 * Remove the white/near-white background from an illustration using a
 * flood-fill algorithm seeded from the image edges.
 *
 * Only white regions *connected to the edges* become transparent, so
 * enclosed light areas (skin highlights, light clothing) are preserved.
 */
async function removeWhiteBackground(inputBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const pixels = new Uint8ClampedArray(data);

  const isNearWhite = (r: number, g: number, b: number) =>
    Math.min(r, g, b) > FLOOD_THRESHOLD;

  // visited[i] = 1 if pixel i has been enqueued
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  // Seed from top and bottom edges
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const pi = y * width + x;
      const idx = pi * 4;
      if (!visited[pi] && isNearWhite(pixels[idx], pixels[idx + 1], pixels[idx + 2])) {
        visited[pi] = 1;
        queue.push(pi);
      }
    }
  }
  // Seed from left and right edges (skip corners already seeded)
  for (let y = 1; y < height - 1; y++) {
    for (const x of [0, width - 1]) {
      const pi = y * width + x;
      const idx = pi * 4;
      if (!visited[pi] && isNearWhite(pixels[idx], pixels[idx + 1], pixels[idx + 2])) {
        visited[pi] = 1;
        queue.push(pi);
      }
    }
  }

  // BFS — process all background pixels reachable from edges
  let head = 0;
  while (head < queue.length) {
    const pi = queue[head++];
    const x = pi % width;
    const y = (pi - x) / width;
    const idx = pi * 4;

    // Feathered transparency: linearly interpolate from opaque at FLOOD_THRESHOLD
    // to fully transparent at FULL_TRANSPARENT.
    const minC = Math.min(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
    if (minC >= FULL_TRANSPARENT) {
      pixels[idx + 3] = 0;
    } else {
      // t = 0 at minC = FLOOD_THRESHOLD (keep full alpha), 1 at FULL_TRANSPARENT (zero alpha)
      const t = (minC - FLOOD_THRESHOLD) / (FULL_TRANSPARENT - FLOOD_THRESHOLD);
      pixels[idx + 3] = Math.round(pixels[idx + 3] * (1 - t));
    }

    // Enqueue 4-connected neighbors that are near-white and not yet visited
    const neighbors: number[] = [];
    if (x > 0) neighbors.push(pi - 1);
    if (x < width - 1) neighbors.push(pi + 1);
    if (y > 0) neighbors.push(pi - width);
    if (y < height - 1) neighbors.push(pi + width);

    for (const npi of neighbors) {
      if (visited[npi]) continue;
      const nidx = npi * 4;
      if (isNearWhite(pixels[nidx], pixels[nidx + 1], pixels[nidx + 2])) {
        visited[npi] = 1;
        queue.push(npi);
      }
    }
  }

  // Re-encode as PNG (preserves alpha channel)
  return await sharp(Buffer.from(pixels.buffer), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/**
 * POST /api/admin/orders/[orderId]/photos/[photoId]/remove-background
 *
 * Generates a white-background-removed PNG for a photo's illustration.
 * Idempotent: returns the existing signed URL if already processed.
 * Pass ?force=1 to re-process even if illustration_nobg_path already exists.
 *
 * Response: { ok: true, nobgUrl: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string; photoId: string }> }
) {
  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId, photoId } = await params;
  const force = req.nextUrl.searchParams.get("force") === "1";

  const adminClient = createAdminClient();

  // Load photo — verify it belongs to this order and has a completed illustration
  const { data: photo } = await adminClient
    .from("photos")
    .select("id, illustration_storage_path, illustration_status, illustration_nobg_path")
    .eq("id", photoId)
    .eq("order_id", orderId)
    .single();

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  if (photo.illustration_status !== "completed" || !photo.illustration_storage_path) {
    return NextResponse.json(
      { error: "Photo illustration is not completed" },
      { status: 400 }
    );
  }

  const nobgPath = `${orderId}/${photoId}-nobg.png`;

  // Idempotent: if already processed and not forced, return existing signed URL
  if (photo.illustration_nobg_path && !force) {
    const { data: signedData } = await adminClient.storage
      .from(BUCKET)
      .createSignedUrl(photo.illustration_nobg_path as string, 3600);

    if (signedData?.signedUrl) {
      return NextResponse.json({ ok: true, nobgUrl: signedData.signedUrl });
    }
    // Fall through to re-process if signing failed (stale path)
  }

  // Download the original illustration
  const { data: downloadData, error: downloadError } = await adminClient.storage
    .from(BUCKET)
    .download(photo.illustration_storage_path as string);

  if (downloadError || !downloadData) {
    return NextResponse.json(
      { error: "Failed to download illustration" },
      { status: 500 }
    );
  }

  // Convert Blob → Buffer
  const arrayBuffer = await downloadData.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  // Process: remove white background via flood-fill from edges
  let outputBuffer: Buffer;
  try {
    outputBuffer = await removeWhiteBackground(inputBuffer);
  } catch (err) {
    console.error("[remove-background] Processing failed:", err);
    return NextResponse.json(
      { error: "Image processing failed" },
      { status: 500 }
    );
  }

  // Upload the transparent PNG to the illustrations bucket
  const { error: uploadError } = await adminClient.storage
    .from(BUCKET)
    .upload(nobgPath, outputBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "Failed to upload processed image" },
      { status: 500 }
    );
  }

  // Persist the nobg path on the photo row
  await adminClient
    .from("photos")
    .update({ illustration_nobg_path: nobgPath })
    .eq("id", photoId);

  // Return a fresh signed URL for the processed image
  const { data: signedData } = await adminClient.storage
    .from(BUCKET)
    .createSignedUrl(nobgPath, 3600);

  if (!signedData?.signedUrl) {
    return NextResponse.json(
      { error: "Processed image uploaded but signing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, nobgUrl: signedData.signedUrl });
}
