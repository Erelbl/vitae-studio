/**
 * Film scene renderer — Node.js only.
 *
 * ⚠️  ENVIRONMENT REQUIREMENT
 * This module uses @remotion/bundler (webpack) and @remotion/renderer (Puppeteer /
 * headless Chrome). It works in:
 *   - Local `npm run dev` / `npm run start`
 *   - A VPS or EC2 instance with Chrome installed
 *
 * It does NOT work on Vercel serverless functions (no bundled Chrome).
 * For production cloud rendering, migrate to @remotion/lambda (AWS Lambda).
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildRenderHash } from "@/services/film/utils/build-render-hash";
import { uploadFilmAsset } from "@/services/film/storage/film-storage";
import { filmEnv } from "@/lib/film-env";
import type { SceneCompositionProps } from "@/remotion/SceneComposition";

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

// ── Bundle cache (per process) ────────────────────────────────────────────────
// Caches the Remotion webpack bundle URL so subsequent renders skip the
// ~30-60 s webpack step.
let cachedBundleUrl: string | null = null;

async function getBundle(): Promise<string> {
  if (cachedBundleUrl) return cachedBundleUrl;

  // Dynamic import so this module can be imported without failing on Vercel
  // (the import will still fail at call time, but not at module parse time).
  const { bundle } = await import("@remotion/bundler");

  const entryPoint = path.join(process.cwd(), "src/remotion/index.ts");
  console.log("[film-render] Bundling Remotion composition from", entryPoint);

  const bundleUrl = await bundle({
    entryPoint,
    onProgress: (p) => process.stdout.write(`\r[film-render] Bundle: ${p}%`),
  });

  process.stdout.write("\n");
  cachedBundleUrl = bundleUrl;
  return bundleUrl;
}

// ── Image URL resolution ──────────────────────────────────────────────────────

/**
 * Resolves signed image URLs for a set of page IDs.
 * Prefers page_images (slot 1) → falls back to pages.illustration_storage_path.
 * URLs are valid for 1 hour — enough time for rendering to complete.
 */
async function fetchPageImageUrls(
  pageIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any
): Promise<string[]> {
  if (pageIds.length === 0) return [];

  // 1. Fetch pages (legacy illustration path)
  const { data: pages } = await adminClient
    .from("pages")
    .select("id, illustration_storage_path")
    .in("id", pageIds)
    .order("page_number");

  if (!pages || pages.length === 0) return [];

  // 2. Fetch slot-1 page_images for these pages
  const { data: pageImages } = await adminClient
    .from("page_images")
    .select("page_id, photo_id")
    .in("page_id", pageIds)
    .eq("slot", 1);

  // page_id → photo_id
  const pageImagePhotoMap = new Map<string, string>(
    (pageImages ?? [])
      .filter((pi: { page_id: string; photo_id: string | null }) => pi.photo_id)
      .map((pi: { page_id: string; photo_id: string }) => [pi.page_id, pi.photo_id])
  );

  // 3. Fetch illustration paths for those photos
  const photoIds = [...new Set(pageImagePhotoMap.values())];
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

  // 4. Resolve signed URLs
  const urls: string[] = [];

  for (const page of pages) {
    const photoId = pageImagePhotoMap.get(page.id as string);
    let illustrationPath: string | null = null;

    if (photoId && photoIllustrationMap.has(photoId)) {
      illustrationPath = photoIllustrationMap.get(photoId)!;
    } else if (page.illustration_storage_path) {
      illustrationPath = page.illustration_storage_path as string;
    }

    if (illustrationPath) {
      const { data } = await adminClient.storage
        .from("illustrations")
        .createSignedUrl(illustrationPath, 3600);

      if (data?.signedUrl) {
        urls.push(data.signedUrl as string);
      }
    }
  }

  return urls;
}

// ── Main render function ──────────────────────────────────────────────────────

/**
 * Renders a single film scene to an MP4 video and JPEG thumbnail.
 *
 * Steps:
 * 1. Fetch scene row + resolve page image URLs
 * 2. Bundle Remotion composition (cached after first call)
 * 3. Render video with renderMedia() — silent (no audio in this phase)
 * 4. Render thumbnail with renderStill() at 15% of the duration
 * 5. Upload both to film storage
 * 6. Update film_scenes row (status, paths, render_hash)
 *
 * Storage paths:
 *   films/{orderId}/{filmProjectId}/scenes/{sceneId}/scene.mp4
 *   films/{orderId}/{filmProjectId}/scenes/{sceneId}/thumbnail.jpg
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
    // Resolve page image URLs
    const pageIds = (sceneRow.page_ids_json as string[]) ?? [];
    const imageUrls = await fetchPageImageUrls(pageIds, adminClient);

    // Build render hash (used to detect input changes in batch rendering)
    const renderHash = buildRenderHash({
      narrationText: sceneRow.narration_text as string | null,
      voiceId: sceneRow.voice_id as string | null,
      motionPreset: sceneRow.motion_preset as string | null,
      transitionIn: sceneRow.transition_in as string | null,
      transitionOut: sceneRow.transition_out as string | null,
      pageIds: pageIds,
    });

    // Compute duration
    const durationMs = (sceneRow.duration_ms as number | null) ?? 5000;
    const durationInFrames = Math.max(1, Math.round((durationMs / 1000) * fps));

    // Composition props (cast to satisfy Remotion's Record<string,unknown> constraint)
    const compositionProps = {
      imageUrls,
      narrationText: (sceneRow.narration_text as string | null) ?? null,
      motionPreset:
        (sceneRow.motion_preset as string) === "ken_burns"
          ? "ken_burns"
          : "static",
      transitionIn:
        (sceneRow.transition_in as string) === "fade" ? "fade" : "none",
      transitionOut:
        (sceneRow.transition_out as string) === "fade" ? "fade" : "none",
    };

    // Get bundle
    const bundleUrl = await getBundle();

    // Dynamic import of renderer (avoids parse-time failure on Vercel)
    const { renderMedia, renderStill, selectComposition } = await import(
      "@remotion/renderer"
    );

    // Select composition and override duration
    const composition = await selectComposition({
      serveUrl: bundleUrl,
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
        `[film-render] Rendering scene ${sceneId} (${durationInFrames} frames @ ${fps}fps)`
      );
      await renderMedia({
        composition: compositionWithDuration,
        serveUrl: bundleUrl,
        codec: "h264",
        outputLocation: tmpVideo,
        inputProps: compositionProps,
      });

      // Render thumbnail at ~15% of the scene
      const thumbFrame = Math.max(0, Math.round(durationInFrames * 0.15));
      console.log(`[film-render] Rendering thumbnail at frame ${thumbFrame}`);
      await renderStill({
        composition: compositionWithDuration,
        serveUrl: bundleUrl,
        output: tmpThumb,
        imageFormat: "jpeg",
        frame: thumbFrame,
        inputProps: compositionProps,
      });

      // Upload both to film storage
      const videoBuffer = await fs.readFile(tmpVideo);
      const thumbBuffer = await fs.readFile(tmpThumb);

      const videoStoragePath = `films/${orderId}/${filmProjectId}/scenes/${sceneId}/scene.mp4`;
      const thumbStoragePath = `films/${orderId}/${filmProjectId}/scenes/${sceneId}/thumbnail.jpg`;

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
    const message = err instanceof Error ? err.message : "Render failed";
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
