import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import JSZip from "jszip";

// Allow enough time to download + compress multiple images
export const maxDuration = 60;

// POST /api/admin/orders/[orderId]/illustrations/download-zip
//
// Admin-only. Builds a ZIP of completed illustration files and returns it
// as an application/zip download.
//
// Body: { photoIds?: string[] }
//   - if photoIds is provided → ZIP only those photos (completed ones only)
//   - if omitted → ZIP all completed illustrations for the order
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
  let photoIds: string[] | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body.photoIds)) {
      photoIds = body.photoIds as string[];
    }
  } catch {
    // No body — download all
  }

  // ── Fetch completed illustrations ──
  let query = adminClient
    .from("photos")
    .select("id, original_filename, illustration_storage_path, illustration_status")
    .eq("order_id", orderId)
    .eq("illustration_status", "completed");

  if (photoIds && photoIds.length > 0) {
    query = query.in("id", photoIds);
  }

  const { data: photos, error: fetchError } = await query;

  if (fetchError) {
    console.error("[download-zip] Failed to fetch photos:", fetchError);
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }

  // Filter to only rows that actually have a storage path
  const completed = (photos ?? []).filter(
    (p) => p.illustration_storage_path && p.illustration_status === "completed"
  );

  console.log(
    `[download-zip] orderId=${orderId} requested=${photoIds?.length ?? "all"} completed=${completed.length}`
  );

  if (completed.length === 0) {
    return NextResponse.json(
      { error: "No completed illustrations to download" },
      { status: 404 }
    );
  }

  // ── Build ZIP ──
  console.log(`[download-zip] Building ZIP for ${completed.length} illustrations`);
  const zip = new JSZip();

  await Promise.all(
    completed.map(async (photo, index) => {
      const storagePath = photo.illustration_storage_path as string;
      const paddedIndex = String(index + 1).padStart(2, "0");
      const filename = `illustration-${paddedIndex}.png`;

      try {
        const { data: fileData, error: downloadError } = await adminClient.storage
          .from("illustrations")
          .download(storagePath);

        if (downloadError || !fileData) {
          console.error(`[download-zip] Failed to download ${storagePath}:`, downloadError);
          return; // Skip this file
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());
        zip.file(filename, buffer);
        console.log(`[download-zip] ✓ Added ${filename} (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
      } catch (err) {
        console.error(`[download-zip] Error processing ${storagePath}:`, err);
      }
    })
  );

  const filesAdded = Object.keys(zip.files).length;
  if (filesAdded === 0) {
    return NextResponse.json(
      { error: "Failed to fetch any illustration files" },
      { status: 500 }
    );
  }

  console.log(`[download-zip] Generating ZIP with ${filesAdded} files`);

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  console.log(`[download-zip] ✓ ZIP ready: ${(zipBuffer.byteLength / 1024).toFixed(1)} KB`);

  const zipFilename = `illustrations-${orderId.slice(0, 8)}.zip`;

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFilename}"`,
      "Content-Length": String(zipBuffer.byteLength),
    },
  });
}
