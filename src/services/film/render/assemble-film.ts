/**
 * Final Film Assembly — Remotion-based
 *
 * Assembles all rendered scene videos into a single final film with
 * page-turn transitions between scenes.
 *
 * SOURCE OF TRUTH: the ONLY visual input is the pre-rendered scene MP4 files
 * at each scene's `rendered_scene_path`. The assembly NEVER re-renders from
 * page data, still images, or thumbnails. Each scene clip already contains
 * the full Remotion animation (image reveal, text reveal, Ken Burns,
 * narration-synced timing). The assembly's job is strictly:
 *   sign URLs → sequence with Remotion → upload
 *
 * STRATEGY: Remotion FinalFilmComposition.
 *
 * Remotion handles timeline sequencing natively via <Sequence> + <OffthreadVideo>.
 * No offset calculations, no filter chains. Sources are Supabase signed URLs wrapped
 * through /api/proxy — Chrome (Remotion's renderer) loads them via the proxy endpoint.
 * Narration audio is handled via Remotion's <Audio> component alongside
 * <OffthreadVideo>, so no ffmpeg mux step is needed.
 *
 * ⚠️  ENVIRONMENT REQUIREMENTS
 * - Chrome installed (Remotion uses headless Chrome)
 * - ffmpeg installed (for thumbnail extraction only)
 * - Remotion bundle built: npm run bundle:remotion
 * - Node.js environment (not Vercel serverless)
 *
 * Storage paths (relative to "films" bucket — no bucket-name prefix):
 *   {orderId}/{filmProjectId}/final/film.mp4
 *   {orderId}/{filmProjectId}/final/thumbnail.jpg
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as fsSync from "fs";
import { spawn } from "child_process";

import { createAdminClient } from "@/lib/supabase/admin";
import { uploadFilmAsset } from "@/services/film/storage/film-storage";
import { filmEnv } from "@/lib/film-env-node";
import { computeTotalDuration } from "@/remotion/FinalFilmComposition";
import type { ClipEntry } from "@/remotion/FinalFilmComposition";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AssembleFilmInput {
  orderId: string;
  filmProjectId: string;
}

export interface AssembleFilmResult {
  finalVideoPath: string;
  finalThumbnailPath: string;
  finalDurationSeconds: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Duration of page-turn transition between scenes, in seconds.
 *
 * Breathing pause timing (see compute-scene-duration.ts):
 *   Scene duration = audio_ms + AUDIO_TAIL_MS(500) + BREATHING_PAUSE_MS(2000)
 *   Visible stillness = 2500ms − TRANSITION_DURATION
 *
 * At 1.5 s: transition starts 1.5 s before clip end → ~1000 ms of visible still
 * spread before the page begins turning. Feels more alive than the 0.8 s default
 * (which left ~1700 ms of dead pause before any motion began).
 *
 * Flow: narration ends → ~1.0 s still spread → page turn (1.5 s) → next spread
 */
const TRANSITION_DURATION_SEC = 1.5;

/** Default FPS — matches scene rendering. */
const FPS = 30;

/** Timeout for ffmpeg operations (thumbnail extraction). */
const FFMPEG_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Signed URL expiry in seconds. Must exceed the total assembly render time.
 * 40 scenes × ~2 min/scene = ~80 min; use 3 hours to be safe.
 */
const SIGNED_URL_EXPIRY_SEC = 3 * 60 * 60;

// ── Preview export mode ──────────────────────────────────────────────────────
//
// Supabase free plan storage cap blocks large final film uploads.
// When true, Remotion renders at lower resolution.
// TO RESTORE PRODUCTION QUALITY: set to false.
//
const PREVIEW_EXPORT_MODE = true;
const PREVIEW_WIDTH = 960;
const PREVIEW_HEIGHT = 540;

// ── Proxy URL helper ─────────────────────────────────────────────────────────

/**
 * Wraps a Supabase signed URL through the local proxy endpoint.
 * Remotion's Chrome renderer loads this via HTTP instead of hitting Supabase directly.
 * Base URL: APP_BASE_URL env var, fallback to http://localhost:3000.
 */
function proxyUrl(src: string): string {
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/proxy?src=${encodeURIComponent(src)}`;
}

// ── Remotion bundle path ─────────────────────────────────────────────────────

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
      `[film-assemble] Remotion bundle not found.\n` +
        `  Looking for : ${indexHtml}\n` +
        `  process.cwd(): ${process.cwd()}${envInfo}\n` +
        `  Build the bundle first:\n` +
        `    npm run bundle:remotion\n` +
        `  Note: assembly requires Chrome — it does not work on Vercel serverless.`
    );
  }

  return bundleDir;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function runFfmpeg(
  command: string,
  args: string[],
  timeoutMs = FFMPEG_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: "pipe" });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString();
      const stderr = Buffer.concat(stderrChunks).toString();

      if (code !== 0) {
        const lastLines = stderr.split("\n").filter(Boolean).slice(-8).join("\n");
        reject(
          new Error(`${command} exited with code ${code}:\n${lastLines}`)
        );
      } else {
        resolve({ stdout, stderr });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function checkFfmpeg(): Promise<void> {
  try {
    await runFfmpeg("ffmpeg", ["-version"], 10_000);
  } catch {
    throw new Error(
      "[film-assemble] ffmpeg not found. Install ffmpeg to assemble films.\n" +
        "  macOS: brew install ffmpeg\n" +
        "  Ubuntu: sudo apt install ffmpeg\n" +
        "  Windows: download from https://ffmpeg.org/download.html"
    );
  }
}

/**
 * Generate a signed HTTPS URL for a storage object.
 * Callers wrap the result with proxyUrl() before passing to Remotion.
 */
async function getSignedUrl(storagePath: string, bucket: string): Promise<string> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SEC);

  if (error || !data?.signedUrl) {
    throw new Error(
      `[film-assemble] Failed to sign URL for ${storagePath}: ${error?.message ?? "no URL returned"}`
    );
  }

  return data.signedUrl;
}

/** Measure duration of a local media file via ffprobe. */
async function getClipDuration(filePath: string): Promise<number> {
  const { stdout } = await runFfmpeg(
    "ffprobe",
    [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    30_000
  );
  return parseFloat(stdout.trim()) || 0;
}

// ── Main assembly function ───────────────────────────────────────────────────

export async function assembleFilm(
  input: AssembleFilmInput
): Promise<AssembleFilmResult> {
  const { orderId, filmProjectId } = input;
  const adminClient = createAdminClient();

  const proxyBase = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  console.log(`[render-worker] Using proxy base: ${proxyBase}/api/proxy`);

  await checkFfmpeg();

  // ── Fetch project + scenes ──────────────────────────────────────────────

  const { data: project, error: projErr } = await adminClient
    .from("film_projects")
    .select("*")
    .eq("id", filmProjectId)
    .single();

  if (projErr || !project) {
    throw new Error(`Film project not found: ${filmProjectId}`);
  }

  const { data: scenes, error: scenesErr } = await adminClient
    .from("film_scenes")
    .select("*")
    .eq("film_project_id", filmProjectId)
    .order("scene_order");

  if (scenesErr || !scenes || scenes.length === 0) {
    throw new Error("No scenes found for this film project");
  }

  // ── Exclude album-only page types from assembly ──────────────────────────
  // cover and back_cover are not part of the film pipeline.
  // This filter is a safety net for projects built before this exclusion.
  const FILM_EXCLUDED_SPREAD_KEYS = new Set(["cover", "back_cover"]);
  const assemblyScenes = scenes.filter(
    (s) => !FILM_EXCLUDED_SPREAD_KEYS.has((s.page_spread_key as string | null) ?? "")
  );

  if (assemblyScenes.length === 0) {
    throw new Error("No assembly-eligible scenes found for this film project");
  }

  // ── Validate all scenes are rendered ────────────────────────────────────

  const notRendered = assemblyScenes.filter((s) => s.status !== "rendered");
  if (notRendered.length > 0) {
    const ids = notRendered
      .map((s) => `#${s.scene_order} (${s.status})`)
      .join(", ");
    throw new Error(
      `Cannot assemble: ${notRendered.length} scene(s) not rendered: ${ids}`
    );
  }

  const missingVideo = assemblyScenes.filter((s) => !s.rendered_scene_path);
  if (missingVideo.length > 0) {
    throw new Error(
      `Cannot assemble: ${missingVideo.length} scene(s) missing rendered_scene_path`
    );
  }

  // ── Prepare temp directory (for final.mp4 + thumbnail only) ────────────

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vitae-assemble-"));
  const storageBucket = filmEnv.storageBucket!;

  try {
    console.log(
      `[film-assemble] ═══════════════════════════════════════════════════════`
    );
    console.log(
      `[film-assemble] Assembling ${assemblyScenes.length} rendered scene clips ` +
        `for project ${filmProjectId}`
    );
    console.log(
      `[film-assemble] Strategy: Remotion FinalFilmComposition (proxy URLs via /api/proxy)`
    );
    console.log(
      `[film-assemble] Source: rendered_scene_path MP4s — signed Supabase URL wrapped in proxy`
    );
    console.log(
      `[film-assemble] ═══════════════════════════════════════════════════════`
    );

    // ── Build clip entries (proxy-wrapped URLs) ───────────────────────────
    //
    // Each scene video URL is signed then wrapped through /api/proxy so
    // Remotion's Chrome renderer loads it via a stable local endpoint.
    // No local download or ffmpeg mux needed — narration audio is already
    // baked into each scene MP4 by the scene renderer (via Remotion <Audio>).

    const clips: ClipEntry[] = [];

    for (let i = 0; i < assemblyScenes.length; i++) {
      const scene = assemblyScenes[i];
      const sceneId = scene.id as string;
      const videoStoragePath = scene.rendered_scene_path as string;
      const audioStoragePath = scene.audio_path as string | null;
      const spreadKey = (scene.page_spread_key as string | null) ?? `scene_${i}`;

      // Validate storage path before signing
      if (!videoStoragePath) {
        throw new Error(
          `[film-assemble] Scene ${i + 1} (${sceneId}) has no rendered_scene_path`
        );
      }

      // Sign video URL — Remotion's OffthreadVideo loads this via the proxy
      const videoSignedUrl = proxyUrl(await getSignedUrl(videoStoragePath, storageBucket));

      // Narration audio is already baked into the rendered scene MP4 via
      // Remotion's <Audio> component during scene rendering. Do NOT pass
      // audioSrc here — doing so would cause the narration to play twice
      // (once from the baked-in MP4 audio track, once from the extra <Audio>).
      const audioSignedUrl: null = null;
      const hasNarration = audioStoragePath !== null;

      // Duration from DB — set accurately by renderScene() as
      // Math.round((durationInFrames / fps) * 1000), matching what was rendered.
      const durationMs = (scene.duration_ms as number | null) ?? 5000;
      const durationInFrames = Math.max(1, Math.round((durationMs / 1000) * FPS));

      console.log(
        `[film-assemble] [${i + 1}/${assemblyScenes.length}] ✓ clip ready: ` +
          `key=${spreadKey} duration=${(durationMs / 1000).toFixed(2)}s ` +
          `(${durationInFrames} frames) audio=baked-in ` +
          `video=proxy narration=${audioStoragePath ? "yes" : "none"}`
      );

      clips.push({
        src: videoSignedUrl,
        audioSrc: audioSignedUrl,
        durationInFrames,
        hasNarration,
      });
    }

    // ── Render final film with Remotion ───────────────────────────────────

    const transitionDurationInFrames = Math.round(TRANSITION_DURATION_SEC * FPS);
    const totalDurationInFrames = computeTotalDuration(clips, transitionDurationInFrames);

    console.log(
      `[film-assemble] ─── Remotion render: ${clips.length} clips, ` +
        `${Math.max(0, clips.length - 1)} transitions (${TRANSITION_DURATION_SEC}s each), ` +
        `total ${totalDurationInFrames} frames (${(totalDurationInFrames / FPS).toFixed(1)}s) ───`
    );

    const width = PREVIEW_EXPORT_MODE ? PREVIEW_WIDTH : filmEnv.defaultWidth;
    const height = PREVIEW_EXPORT_MODE ? PREVIEW_HEIGHT : filmEnv.defaultHeight;

    if (PREVIEW_EXPORT_MODE) {
      console.log(
        `[film-assemble] Preview export mode — rendering at ${width}x${height}`
      );
    }

    const serveUrl = getBundlePath();
    const compositionProps = {
      clips,
      transitionDurationInFrames,
    };

    // Dynamic import to avoid parse-time failure on Vercel
    const { renderMedia, selectComposition } = await import(
      "@remotion/renderer"
    );

    const composition = await selectComposition({
      serveUrl,
      id: "FinalFilm",
      inputProps: compositionProps,
    });

    const compositionWithOverrides = {
      ...composition,
      durationInFrames: totalDurationInFrames,
      fps: FPS,
      width,
      height,
    };

    const outputPath = path.join(tmpDir, "final.mp4");

    await renderMedia({
      composition: compositionWithOverrides,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: compositionProps,
      // CRF 28 gives ~50-65% smaller output than the default CRF 18 while
      // maintaining good visual quality for 960×540 preview delivery.
      crf: 28,
    });

    console.log(`[film-assemble] Remotion render complete → ${outputPath}`);

    // ── Local backup copy (before upload) ────────────────────────────────
    // Saves a permanent local copy so the film is not lost if Supabase upload
    // fails (e.g. storage size limits). Runs before upload; failure is non-fatal.
    const LOCAL_BACKUP_DIR = "C:\\Users\\blere\\Documents\\VitaeFilms";
    const localBackupPath = path.join(
      LOCAL_BACKUP_DIR,
      `${orderId}__${filmProjectId}__final.mp4`
    );
    try {
      await fs.mkdir(LOCAL_BACKUP_DIR, { recursive: true });
      await fs.copyFile(outputPath, localBackupPath);
      console.log(`[film-assemble] Local backup saved → ${localBackupPath}`);
    } catch (backupErr) {
      console.error(
        `[film-assemble] WARNING: Local backup failed (upload will still proceed): ` +
          `${backupErr instanceof Error ? backupErr.message : String(backupErr)}`
      );
    }

    // ── Thumbnail (ffmpeg extract from rendered output) ───────────────────

    const finalThumbLocal = path.join(tmpDir, "thumbnail.jpg");
    const finalDurSec = await getClipDuration(outputPath);
    const thumbTimeSec = Math.min(2, finalDurSec * 0.5);
    await runFfmpeg(
      "ffmpeg",
      [
        "-y",
        "-i", outputPath,
        "-ss", thumbTimeSec.toFixed(2),
        "-vframes", "1",
        "-q:v", "3",
        finalThumbLocal,
      ],
      FFMPEG_TIMEOUT_MS
    );

    // ── Upload ────────────────────────────────────────────────────────────

    const videoBuffer = await fs.readFile(outputPath);
    const thumbBuffer = await fs.readFile(finalThumbLocal);

    const finalVideoStoragePath = `${orderId}/${filmProjectId}/final/film.mp4`;
    const finalThumbStoragePath = `${orderId}/${filmProjectId}/final/thumbnail.jpg`;

    console.log(
      `[film-assemble] Uploading final film ` +
        `(${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB, ` +
        `${Math.round(finalDurSec)}s)`
    );
    await uploadFilmAsset(finalVideoStoragePath, videoBuffer, "video/mp4");
    await uploadFilmAsset(finalThumbStoragePath, thumbBuffer, "image/jpeg");

    // ── Update DB ─────────────────────────────────────────────────────────

    await adminClient
      .from("film_projects")
      .update({
        status: "assembled",
        final_video_path: finalVideoStoragePath,
        final_video_thumbnail_path: finalThumbStoragePath,
        final_duration_seconds: Math.round(finalDurSec),
        last_assembled_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", filmProjectId);

    console.log(
      `[film-assemble] ═══════════════════════════════════════════════════════`
    );
    console.log(
      `[film-assemble] ✓ Assembly complete (Remotion FinalFilmComposition)`
    );
    console.log(
      `[film-assemble]   Duration: ${Math.round(finalDurSec)}s`
    );
    console.log(
      `[film-assemble]   Scenes: ${assemblyScenes.length}`
    );
    console.log(
      `[film-assemble]   Transitions: ${Math.max(0, assemblyScenes.length - 1)} × wipeleft`
    );
    console.log(
      `[film-assemble] ═══════════════════════════════════════════════════════`
    );

    return {
      finalVideoPath: finalVideoStoragePath,
      finalThumbnailPath: finalThumbStoragePath,
      finalDurationSeconds: finalDurSec,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[film-assemble] Assembly failed: ${message}`);

    await adminClient
      .from("film_projects")
      .update({
        status: "error",
        error_message: `Assembly failed: ${message}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", filmProjectId);

    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
