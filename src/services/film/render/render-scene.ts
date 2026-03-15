/**
 * Film scene renderer — Node.js only.
 *
 * ⚠️  ENVIRONMENT REQUIREMENT
 * This module uses @remotion/renderer (Puppeteer / headless Chrome). It works in:
 *   - Local `npm run dev` / `npm run start`
 *   - A VPS or EC2 instance with Chrome installed
 *
 * It does NOT work on Vercel serverless functions (no bundled Chrome).
 * For production cloud rendering, migrate to @remotion/lambda (AWS Lambda).
 *
 * ⚠️  PRE-BUILD REQUIREMENT
 * The Remotion composition must be bundled before rendering. Run once:
 *   npm run bundle:remotion
 * Or set REMOTION_BUNDLE_PATH to point to an existing bundle directory.
 */

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as os from "os";
import * as path from "path";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildRenderHash } from "@/services/film/utils/build-render-hash";
import { uploadFilmAsset } from "@/services/film/storage/film-storage";
import { filmEnv } from "@/lib/film-env-node";
import type { SlotImageData } from "@/remotion/SceneComposition";

export interface RenderSceneInput {
  sceneId: string;
  orderId: string;
  filmProjectId: string;
  /** Override render dimensions (defaults from filmEnv). */
  width?: number;
  height?: number;
  fps?: number;
}

export interface RenderSceneResult {
  renderedPath: string;
  thumbnailPath: string;
  durationMs: number;
  renderHash: string;
}

// ── Pre-built bundle path ─────────────────────────────────────────────────────

/** Default bundle output directory — must match `--out-dir` in package.json bundle:remotion. */
const REMOTION_BUNDLE_DIR = ".remotion-bundle";

function getBundlePath(): string {
  const bundleDir =
    process.env.REMOTION_BUNDLE_PATH ??
    path.join(process.cwd(), REMOTION_BUNDLE_DIR);

  const indexHtml = path.join(bundleDir, "index.html");

  if (!fsSync.existsSync(indexHtml)) {
    const envInfo = process.env.REMOTION_BUNDLE_PATH
      ? `\n  REMOTION_BUNDLE_PATH : ${process.env.REMOTION_BUNDLE_PATH}`
      : `\n  Default bundle dir   : ${bundleDir}`;

    throw new Error(
      `[film-render] Remotion bundle not found.\n` +
        `  Looking for : ${indexHtml}\n` +
        `  process.cwd(): ${process.cwd()}${envInfo}\n` +
        `  Build the bundle first:\n` +
        `    npm run bundle:remotion\n` +
        `  To use a custom location set REMOTION_BUNDLE_PATH in .env.local.\n` +
        `  Note: rendering requires Chrome — it does not work on Vercel serverless.`
    );
  }

  return bundleDir;
}

// ── Page data resolution ──────────────────────────────────────────────────────

interface ScenePageData {
  layoutType: string;
  textContent: string | null;
  textSize: string | null;
  fontSizePx: number | null;
  textAlign: string;
  textX: number | null;
  textY: number | null;
  slot1: SlotImageData | null;
  slot2: SlotImageData | null;
}

/**
 * Resolves the primary page's layout + image slot data for a set of page IDs.
 *
 * Uses the first page ID as the layout source. Fetches slot images (with crop
 * params) from page_images, falling back to pages.illustration_storage_path
 * for slot 1 if no page_images rows exist.
 *
 * Returns a layout-faithful data structure matching SceneCompositionProps.
 */
async function fetchScenePageData(
  pageIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any
): Promise<ScenePageData> {
  const defaultResult: ScenePageData = {
    layoutType: "FULL_IMAGE",
    textContent: null,
    textSize: null,
    fontSizePx: null,
    textAlign: "start",
    textX: null,
    textY: null,
    slot1: null,
    slot2: null,
  };

  if (pageIds.length === 0) return defaultResult;

  // 1. Fetch primary page (first in list) for layout metadata
  const primaryPageId = pageIds[0];
  const { data: page } = await adminClient
    .from("pages")
    .select(
      "id, layout_type, text_content, text_size, font_size_px, text_align, text_x, text_y, illustration_storage_path"
    )
    .eq("id", primaryPageId)
    .single();

  if (!page) return defaultResult;

  // 2. Fetch slot images for the primary page
  const { data: pageImages } = await adminClient
    .from("page_images")
    .select("slot, photo_id, crop_x, crop_y, scale")
    .eq("page_id", primaryPageId)
    .in("slot", [1, 2]);

  // 3. Fetch illustration paths for photos referenced in slot images
  const photoIds = (pageImages ?? [])
    .filter((pi: { photo_id: string | null }) => pi.photo_id)
    .map((pi: { photo_id: string }) => pi.photo_id);

  const photoIllustrationMap = new Map<string, string>();

  if (photoIds.length > 0) {
    const { data: photos } = await adminClient
      .from("photos")
      .select("id, illustration_storage_path")
      .in("id", photoIds);

    for (const photo of photos ?? []) {
      if (photo.illustration_storage_path) {
        photoIllustrationMap.set(
          photo.id as string,
          photo.illustration_storage_path as string
        );
      }
    }
  }

  // 4. Resolve signed URLs for each slot
  async function resolveSlotUrl(illustrationPath: string): Promise<string | null> {
    const { data } = await adminClient.storage
      .from("illustrations")
      .createSignedUrl(illustrationPath, 3600);
    return data?.signedUrl ?? null;
  }

  // Build slot data from page_images rows
  const slotMap = new Map<
    number,
    { crop_x: number; crop_y: number; scale: number; photo_id: string | null }
  >();
  for (const pi of pageImages ?? []) {
    slotMap.set(pi.slot as number, {
      crop_x: (pi.crop_x as number) ?? 0,
      crop_y: (pi.crop_y as number) ?? 0,
      scale: (pi.scale as number) ?? 1,
      photo_id: pi.photo_id as string | null,
    });
  }

  async function buildSlot(slot: 1 | 2): Promise<SlotImageData | null> {
    const slotData = slotMap.get(slot);

    if (slotData?.photo_id) {
      const illustPath = photoIllustrationMap.get(slotData.photo_id);
      if (illustPath) {
        const url = await resolveSlotUrl(illustPath);
        if (url) {
          return {
            url,
            crop_x: slotData.crop_x,
            crop_y: slotData.crop_y,
            scale: slotData.scale,
          };
        }
      }
    }

    // Legacy fallback: slot 1 → pages.illustration_storage_path
    if (slot === 1 && page.illustration_storage_path) {
      const url = await resolveSlotUrl(page.illustration_storage_path as string);
      if (url) {
        return { url, crop_x: 0, crop_y: 0, scale: 1 };
      }
    }

    return null;
  }

  const [slot1, slot2] = await Promise.all([buildSlot(1), buildSlot(2)]);

  return {
    layoutType: (page.layout_type as string) ?? "FULL_IMAGE",
    textContent: (page.text_content as string | null) ?? null,
    textSize: (page.text_size as string | null) ?? null,
    fontSizePx: (page.font_size_px as number | null) ?? null,
    textAlign: (page.text_align as string) ?? "start",
    textX: (page.text_x as number | null) ?? null,
    textY: (page.text_y as number | null) ?? null,
    slot1,
    slot2,
  };
}

// ── Main render function ──────────────────────────────────────────────────────

/**
 * Renders a single film scene to an MP4 video and JPEG thumbnail.
 *
 * Steps:
 * 1. Fetch scene row + resolve page layout/image data
 * 2. Pass layout-faithful props to the Remotion composition
 * 3. Render video with renderMedia() — silent (no audio in this phase)
 * 4. Render thumbnail with renderStill() at 15% of the duration
 * 5. Upload both to film storage
 * 6. Update film_scenes row (status, paths, render_hash)
 *
 * Storage paths (relative to "films" bucket — no bucket-name prefix):
 *   {orderId}/{filmProjectId}/scenes/{sceneId}/scene.mp4
 *   {orderId}/{filmProjectId}/scenes/{sceneId}/thumbnail.jpg
 */
export async function renderScene(
  input: RenderSceneInput
): Promise<RenderSceneResult> {
  const { sceneId, orderId, filmProjectId } = input;
  const fps = input.fps ?? filmEnv.defaultFps;
  const width = input.width ?? filmEnv.defaultWidth;
  const height = input.height ?? filmEnv.defaultHeight;

  const adminClient = createAdminClient();

  // Fetch scene
  const { data: sceneRow, error: sceneError } = await adminClient
    .from("film_scenes")
    .select("*")
    .eq("id", sceneId)
    .single();

  if (sceneError || !sceneRow) {
    throw new Error(`Scene not found: ${sceneId}`);
  }

  if ((sceneRow.film_project_id as string) !== filmProjectId) {
    throw new Error(
      `Scene ${sceneId} does not belong to film project ${filmProjectId}`
    );
  }

  try {
    const pageIds = (sceneRow.page_ids_json as string[]) ?? [];

    // Resolve page layout + slot image data (layout-faithful)
    const pageData = await fetchScenePageData(pageIds, adminClient);

    // Build render hash
    const renderHash = buildRenderHash({
      narrationText: sceneRow.narration_text as string | null,
      voiceId: sceneRow.voice_id as string | null,
      motionPreset: sceneRow.motion_preset as string | null,
      transitionIn: sceneRow.transition_in as string | null,
      transitionOut: sceneRow.transition_out as string | null,
      pageIds,
    });

    // Compute duration
    const durationMs = (sceneRow.duration_ms as number | null) ?? 5000;
    const durationInFrames = Math.max(1, Math.round((durationMs / 1000) * fps));

    // Composition props — layout-faithful, matching SceneCompositionProps
    const compositionProps = {
      slot1: pageData.slot1,
      slot2: pageData.slot2,
      layoutType: pageData.layoutType,
      textContent: pageData.textContent,
      textSize: pageData.textSize,
      fontSizePx: pageData.fontSizePx,
      textAlign: pageData.textAlign,
      textX: pageData.textX,
      textY: pageData.textY,
      motionPreset:
        (sceneRow.motion_preset as string) === "ken_burns"
          ? "ken_burns"
          : ("static" as const),
      transitionIn:
        (sceneRow.transition_in as string) === "fade" ? "fade" : ("none" as const),
      transitionOut:
        (sceneRow.transition_out as string) === "fade" ? "fade" : ("none" as const),
      narrationDurationMs:
        (sceneRow.audio_duration_ms as number | null) ?? null,
    };

    // Resolve pre-built bundle path
    const serveUrl = getBundlePath();

    // Dynamic import of renderer (avoids parse-time failure on Vercel)
    const { renderMedia, renderStill, selectComposition } = await import(
      "@remotion/renderer"
    );

    const composition = await selectComposition({
      serveUrl,
      id: "Scene",
      inputProps: compositionProps,
    });

    const compositionWithDuration = {
      ...composition,
      durationInFrames,
      fps,
      width,
      height,
    };

    // Temp output paths
    const tmpDir = os.tmpdir();
    const tmpVideo = path.join(
      tmpDir,
      `vitae-scene-${sceneId}-${Date.now()}.mp4`
    );
    const tmpThumb = path.join(
      tmpDir,
      `vitae-thumb-${sceneId}-${Date.now()}.jpg`
    );

    try {
      // Render video (silent — no audio in this phase)
      console.log(
        `[film-render] Rendering scene ${sceneId} (${durationInFrames} frames @ ${fps}fps, layout: ${pageData.layoutType})`
      );
      await renderMedia({
        composition: compositionWithDuration,
        serveUrl,
        codec: "h264",
        outputLocation: tmpVideo,
        inputProps: compositionProps,
      });

      // Render thumbnail at ~15% of the scene
      const thumbFrame = Math.max(0, Math.round(durationInFrames * 0.15));
      console.log(`[film-render] Rendering thumbnail at frame ${thumbFrame}`);
      await renderStill({
        composition: compositionWithDuration,
        serveUrl,
        output: tmpThumb,
        imageFormat: "jpeg",
        frame: thumbFrame,
        inputProps: compositionProps,
      });

      // Upload both to film storage
      const videoBuffer = await fs.readFile(tmpVideo);
      const thumbBuffer = await fs.readFile(tmpThumb);

      // Paths relative to the "films" bucket — no bucket-name prefix
      const videoStoragePath = `${orderId}/${filmProjectId}/scenes/${sceneId}/scene.mp4`;
      const thumbStoragePath = `${orderId}/${filmProjectId}/scenes/${sceneId}/thumbnail.jpg`;

      await uploadFilmAsset(videoStoragePath, videoBuffer, "video/mp4");
      await uploadFilmAsset(thumbStoragePath, thumbBuffer, "image/jpeg");

      // Update scene record
      const actualDurationMs = Math.round((durationInFrames / fps) * 1000);
      await adminClient
        .from("film_scenes")
        .update({
          status: "rendered",
          rendered_scene_path: videoStoragePath,
          thumbnail_path: thumbStoragePath,
          render_hash: renderHash,
          duration_ms: actualDurationMs,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);

      console.log(`[film-render] Scene ${sceneId} rendered successfully`);

      return {
        renderedPath: videoStoragePath,
        thumbnailPath: thumbStoragePath,
        durationMs: actualDurationMs,
        renderHash,
      };
    } finally {
      // Clean up temp files (best-effort)
      await fs.unlink(tmpVideo).catch(() => {});
      await fs.unlink(tmpThumb).catch(() => {});
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    let message = raw;
    if (raw.includes("REMOTION_BUNDLE_PATH") || raw.includes(REMOTION_BUNDLE_DIR)) {
      // Already a clear message from getBundlePath() — pass through as-is.
    } else if (
      raw.includes("Chrome") ||
      raw.includes("Chromium") ||
      raw.includes("puppeteer") ||
      raw.includes("browser")
    ) {
      message = `[film-render] Chrome not found. Rendering requires a Node.js environment with Chrome installed (not available on Vercel serverless). Original error: ${raw}`;
    } else {
      message = `[film-render] Render failed: ${raw}`;
    }
    console.error(`[film-render] Scene ${sceneId} failed: ${message}`);

    await adminClient
      .from("film_scenes")
      .update({
        status: "error",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);

    throw err;
  }
}
