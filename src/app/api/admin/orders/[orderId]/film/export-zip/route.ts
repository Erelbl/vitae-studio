import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import JSZip from "jszip";

/**
 * POST /api/admin/orders/[orderId]/film/export-zip
 *
 * Admin-only. Downloads requested scene video and/or audio files from
 * Supabase Storage and returns them as a ZIP archive.
 *
 * Body:
 *   sceneIds?: string[]   — specific scene IDs; omit for all scenes
 *   video?:    boolean    — include rendered scene MP4s (default false)
 *   audio?:    boolean    — include narration MP3s (default false)
 *
 * File layout inside the ZIP:
 *   video/scene-01-cover.mp4
 *   video/scene-02-spread_01.mp4
 *   audio/scene-02-spread_01.mp3
 *   ...
 *
 * Notes:
 * - Video files are stored with STORE (no re-compression — already h264).
 * - Audio files are stored with DEFLATE level 1 (fast, minor savings for MP3).
 * - Files that fail to download are skipped (logged server-side) rather than
 *   aborting the whole export.
 * - maxDuration = 60 allows up to 60s for Vercel Pro; adjust for free tier.
 */
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;

  // ── Parse body ────────────────────────────────────────────────────────────
  let sceneIds: string[] | undefined;
  let includeVideo = false;
  let includeAudio = false;

  try {
    const body = await req.json();
    if (Array.isArray(body.sceneIds) && body.sceneIds.length > 0) {
      sceneIds = body.sceneIds as string[];
    }
    includeVideo = Boolean(body.video);
    includeAudio = Boolean(body.audio);
  } catch {
    // malformed body — fall through to validation
  }

  if (!includeVideo && !includeAudio) {
    return NextResponse.json(
      { error: "At least one of video or audio must be true" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();
  const filmBucket = process.env.FILM_STORAGE_BUCKET ?? "films";

  // ── Fetch film project ────────────────────────────────────────────────────
  const { data: project, error: projErr } = await adminClient
    .from("film_projects")
    .select("id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (projErr || !project) {
    return NextResponse.json(
      { error: "No film project found for this order" },
      { status: 404 }
    );
  }

  // ── Fetch scenes ──────────────────────────────────────────────────────────
  let query = adminClient
    .from("film_scenes")
    .select("id, scene_order, page_spread_key, rendered_scene_path, audio_path")
    .eq("film_project_id", project.id as string)
    .order("scene_order");

  if (sceneIds && sceneIds.length > 0) {
    query = query.in("id", sceneIds);
  }

  const { data: scenes, error: scenesErr } = await query;

  if (scenesErr || !scenes || scenes.length === 0) {
    return NextResponse.json({ error: "No scenes found" }, { status: 404 });
  }

  // ── Build ZIP ─────────────────────────────────────────────────────────────
  console.log(
    `[export-zip] orderId=${orderId} scenes=${scenes.length} ` +
      `video=${includeVideo} audio=${includeAudio} ` +
      `scope=${sceneIds ? `selected(${sceneIds.length})` : "all"}`
  );

  const zip = new JSZip();
  let filesAdded = 0;
  const errors: string[] = [];

  // Sequential downloads to keep memory usage predictable
  for (const scene of scenes) {
    const order = String(scene.scene_order as number).padStart(2, "0");
    const spreadKey = (
      (scene.page_spread_key as string | null) ?? `scene-${order}`
    ).replace(/[^a-z0-9_-]/gi, "-");

    if (includeVideo && scene.rendered_scene_path) {
      const path = scene.rendered_scene_path as string;
      try {
        const { data: fileData, error: dlErr } = await adminClient.storage
          .from(filmBucket)
          .download(path);

        if (dlErr || !fileData) {
          const msg = `scene-${order} video: ${dlErr?.message ?? "download returned no data"}`;
          console.error(`[export-zip] Failed: ${msg}`);
          errors.push(msg);
        } else {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          // STORE (no re-compression) — h264 is already compressed
          zip.file(`video/scene-${order}-${spreadKey}.mp4`, buffer, {
            compression: "STORE",
          });
          filesAdded++;
          console.log(
            `[export-zip] ✓ video scene-${order} (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`
          );
        }
      } catch (e) {
        const msg = `scene-${order} video: ${e instanceof Error ? e.message : String(e)}`;
        console.error(`[export-zip] Error: ${msg}`);
        errors.push(msg);
      }
    }

    if (includeAudio && scene.audio_path) {
      const path = scene.audio_path as string;
      try {
        const { data: fileData, error: dlErr } = await adminClient.storage
          .from(filmBucket)
          .download(path);

        if (dlErr || !fileData) {
          const msg = `scene-${order} audio: ${dlErr?.message ?? "download returned no data"}`;
          console.error(`[export-zip] Failed: ${msg}`);
          errors.push(msg);
        } else {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          // STORE (no compression) — MP3 is already compressed; DEFLATE is
          // lossless but using STORE avoids any theoretical decompression edge
          // cases and keeps the extracted file byte-for-byte identical to storage.
          zip.file(`audio/scene-${order}-${spreadKey}.mp3`, buffer, {
            compression: "STORE",
          });
          filesAdded++;
          console.log(
            `[export-zip] ✓ audio scene-${order} (${(buffer.byteLength / 1024).toFixed(0)} KB)`
          );
        }
      } catch (e) {
        const msg = `scene-${order} audio: ${e instanceof Error ? e.message : String(e)}`;
        console.error(`[export-zip] Error: ${msg}`);
        errors.push(msg);
      }
    }
  }

  if (filesAdded === 0) {
    const detail = errors.length > 0 ? ` Errors: ${errors.join("; ")}` : "";
    return NextResponse.json(
      { error: `No assets could be exported.${detail}` },
      { status: 404 }
    );
  }

  // ── Generate and return ZIP ───────────────────────────────────────────────
  console.log(`[export-zip] Generating ZIP with ${filesAdded} file(s)`);
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  console.log(
    `[export-zip] ✓ ZIP ready: ${(zipBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`
  );

  const typeSuffix =
    includeVideo && includeAudio ? "all" : includeVideo ? "video" : "audio";
  const scopeSuffix = sceneIds
    ? `selected-${sceneIds.length}`
    : `all-${scenes.length}`;
  const zipFilename = `film-${typeSuffix}-${scopeSuffix}-${orderId.slice(0, 8)}.zip`;

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFilename}"`,
      "Content-Length": String(zipBuffer.byteLength),
    },
  });
}
