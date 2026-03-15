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
 *   download clips → mux narration audio → sequence with Remotion → upload
 *
 * STRATEGY: Remotion FinalFilmComposition.
 *
 * Previous approaches (monolithic ffmpeg xfade chain, pairwise iterative merge)
 * both failed because ffmpeg xfade requires precise duration-offset math that
 * breaks when actual clip durations diverge from expected values. Remotion
 * handles timeline sequencing natively via <Sequence> and <OffthreadVideo> —
 * no offset calculations, no filter chains.
 *
 * The FinalFilmComposition receives an array of clip entries (local file://
 * URLs + duration in frames) and renders them in sequence with wipeleft
 * page-turn transitions between scenes.
 *
 * ⚠️  ENVIRONMENT REQUIREMENTS
 * - Chrome installed (Remotion uses headless Chrome)
 * - ffmpeg + ffprobe installed (for audio muxing + thumbnail extraction)
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
import { pathToFileURL } from "url";

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
 *   Visible stillness = (500 + 2000) - TRANSITION_DURATION(0.8s) ≈ 1700ms
 *
 * Flow: narration ends → ~1.7s still spread → page turn (0.8s) → next spread
 */
const TRANSITION_DURATION_SEC = 0.8;

/** Default FPS — matches scene rendering. */
const FPS = 30;

/** Timeout for individual ffmpeg operations (3 minutes). */
const FFMPEG_TIMEOUT_MS = 3 * 60 * 1000;

/** Timeout for individual scene mux operations (2 minutes). */
const MUX_TIMEOUT_MS = 2 * 60 * 1000;

// ── Preview export mode ──────────────────────────────────────────────────────
//
// Supabase free plan storage cap blocks large final film uploads.
// When true, Remotion renders at lower resolution.
// TO RESTORE PRODUCTION QUALITY: set to false.
//
const PREVIEW_EXPORT_MODE = true;
const PREVIEW_WIDTH = 960;
const PREVIEW_HEIGHT = 540;

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
  try {
    await runFfmpeg("ffprobe", ["-version"], 10_000);
  } catch {
    throw new Error(
      "[film-assemble] ffprobe not found. It is usually installed alongside ffmpeg."
    );
  }
}

async function downloadStorageFile(
  storagePath: string,
  localPath: string,
  bucket: string
): Promise<void> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage
    .from(bucket)
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to get signed URL for ${storagePath}: ${error?.message ?? "no URL"}`
    );
  }

  const response = await fetch(data.signedUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${storagePath}: HTTP ${response.status}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(localPath, buffer);
}

/**
 * Mux narration audio into a scene video.
 * If no audio, adds a silent audio track (required for consistent playback).
 *
 * Video stream is copied without re-encoding — Remotion animations
 * are preserved bit-for-bit.
 */
async function muxAudioIntoVideo(
  videoPath: string,
  audioPath: string | null,
  outputPath: string
): Promise<void> {
  if (!audioPath) {
    // No narration — add silent audio track. -shortest limits the infinite
    // anullsrc generator to the video length.
    await runFfmpeg(
      "ffmpeg",
      [
        "-y",
        "-i", videoPath,
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        outputPath,
      ],
      MUX_TIMEOUT_MS
    );
  } else {
    // With narration audio — do NOT use -shortest.
    // Video is longer than audio by design (2500ms breathing pause padding).
    await runFfmpeg(
      "ffmpeg",
      [
        "-y",
        "-i", videoPath,
        "-i", audioPath,
        "-c:v", "copy",
        "-c:a", "aac",
        "-map", "0:v:0",
        "-map", "1:a:0",
        outputPath,
      ],
      MUX_TIMEOUT_MS
    );
  }
}

/** Measure actual duration of a media file via ffprobe. */
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

  // ── Validate all scenes are rendered ────────────────────────────────────

  const notRendered = scenes.filter((s) => s.status !== "rendered");
  if (notRendered.length > 0) {
    const ids = notRendered
      .map((s) => `#${s.scene_order} (${s.status})`)
      .join(", ");
    throw new Error(
      `Cannot assemble: ${notRendered.length} scene(s) not rendered: ${ids}`
    );
  }

  const missingVideo = scenes.filter((s) => !s.rendered_scene_path);
  if (missingVideo.length > 0) {
    throw new Error(
      `Cannot assemble: ${missingVideo.length} scene(s) missing rendered_scene_path`
    );
  }

  // ── Prepare temp directory ──────────────────────────────────────────────

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vitae-assemble-"));
  const storageBucket = filmEnv.storageBucket!;

  try {
    console.log(
      `[film-assemble] ═══════════════════════════════════════════════════════`
    );
    console.log(
      `[film-assemble] Assembling ${scenes.length} rendered scene clips ` +
        `for project ${filmProjectId}`
    );
    console.log(
      `[film-assemble] Strategy: Remotion FinalFilmComposition (no ffmpeg stitching)`
    );
    console.log(
      `[film-assemble] Source: rendered_scene_path MP4 files ONLY (no page data, no stills)`
    );
    console.log(
      `[film-assemble] ═══════════════════════════════════════════════════════`
    );

    // ── Download + mux audio into each scene clip ─────────────────────────

    const clips: ClipEntry[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneId = scene.id as string;
      const videoStoragePath = scene.rendered_scene_path as string;
      const audioStoragePath = scene.audio_path as string | null;
      const spreadKey = (scene.page_spread_key as string | null) ?? `scene_${i}`;

      console.log(
        `[film-assemble] [${i + 1}/${scenes.length}] Downloading ` +
          `scene=${sceneId} key=${spreadKey} path=${videoStoragePath}`
      );

      // Download pre-rendered scene clip (SOLE visual source)
      const videoLocal = path.join(tmpDir, `scene-${i}-video.mp4`);
      await downloadStorageFile(videoStoragePath, videoLocal, storageBucket);

      // Validate file is not empty/corrupt
      const videoStat = await fs.stat(videoLocal);
      if (videoStat.size < 1024) {
        throw new Error(
          `Scene ${i + 1} (${sceneId}) clip is only ${videoStat.size} bytes — ` +
            `likely corrupt. Path: ${videoStoragePath}`
        );
      }
      console.log(
        `[film-assemble] [${i + 1}/${scenes.length}] Downloaded ` +
          `${(videoStat.size / 1024 / 1024).toFixed(1)} MB`
      );

      // Download narration audio if exists
      let audioLocal: string | null = null;
      if (audioStoragePath) {
        audioLocal = path.join(tmpDir, `scene-${i}-audio.mp3`);
        await downloadStorageFile(audioStoragePath, audioLocal, storageBucket);
      }

      // Mux audio into the rendered clip (video copied without re-encoding)
      const muxedPath = path.join(tmpDir, `scene-${i}-muxed.mp4`);
      console.log(
        `[film-assemble] [${i + 1}/${scenes.length}] Muxing ` +
          `${audioLocal ? "narration audio" : "silent track"} into clip`
      );
      await muxAudioIntoVideo(videoLocal, audioLocal, muxedPath);

      // Measure actual duration via ffprobe (the source of truth for timing)
      const actualDurationSec = await getClipDuration(muxedPath);
      if (actualDurationSec <= 0) {
        throw new Error(
          `Scene ${i + 1} (${sceneId}) has zero duration after muxing. ` +
            `Re-render this scene.`
        );
      }

      const durationInFrames = Math.round(actualDurationSec * FPS);

      const dbDur = ((scene.duration_ms as number | null) ?? 5000) / 1000;
      console.log(
        `[film-assemble] [${i + 1}/${scenes.length}] ✓ Duration: ` +
          `${actualDurationSec.toFixed(2)}s (${durationInFrames} frames) ` +
          `(db: ${dbDur.toFixed(2)}s) key=${spreadKey} ` +
          `audio=${audioLocal ? "yes" : "silent"}`
      );

      // Convert local path to file:// URL for Remotion's OffthreadVideo
      const fileUrl = pathToFileURL(muxedPath).href;

      clips.push({
        src: fileUrl,
        durationInFrames,
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
    });

    console.log(`[film-assemble] Remotion render complete → ${outputPath}`);

    // ── Thumbnail ─────────────────────────────────────────────────────────

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
      MUX_TIMEOUT_MS
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
      `[film-assemble]   Scenes: ${scenes.length}`
    );
    console.log(
      `[film-assemble]   Transitions: ${Math.max(0, scenes.length - 1)} × wipeleft`
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
