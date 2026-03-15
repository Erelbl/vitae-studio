/**
 * Final Film Assembly — Pairwise Merge Strategy
 *
 * Assembles all rendered scene videos into a single final film with
 * page-turn transitions between scenes.
 *
 * SOURCE OF TRUTH: the ONLY visual input is the pre-rendered scene MP4 files
 * at each scene's `rendered_scene_path`. The assembly NEVER re-renders from
 * page data, still images, or thumbnails. Each scene clip already contains
 * the full Remotion animation (image reveal, text reveal, Ken Burns,
 * narration-synced timing). The assembly's job is strictly:
 *   download clips → mux narration audio → stitch with transitions → upload
 *
 * STRATEGY: Pairwise iterative merging.
 *
 * Previous approach (monolithic xfade filter chain) built a single ffmpeg
 * filter_complex with N-1 chained xfade filters. This is fragile:
 *   - Offset calculation: offset_i = sum(durations[0..i]) - (i+1)*td
 *   - Floating-point rounding errors accumulate across the chain
 *   - By clip 8-10 (~45s), the accumulated drift causes ffmpeg to read past
 *     clip boundaries → black frames / freeze while audio continues
 *   - The filter graph is opaque — impossible to isolate which transition broke
 *
 * New approach: iterative pairwise merges.
 *   Step 1: merge clip[0] + clip[1] → intermediate_1  (offset = dur(clip[0]) - td)
 *   Step 2: merge intermediate_1 + clip[2] → intermediate_2  (offset = dur(intermediate_1) - td)
 *   ...and so on.
 *
 * Each merge is a single, isolated 2-input xfade with exactly ONE offset value
 * computed from the ffprobe-measured duration of the left-hand input. No offset
 * accumulation. No chain. If any clip has a timing issue, the error is isolated
 * to that merge step with a clear diagnostic.
 *
 * ⚠️  ENVIRONMENT REQUIREMENTS
 * - ffmpeg + ffprobe must be installed
 * - Node.js environment (not Vercel serverless)
 *
 * Storage paths (relative to "films" bucket — no bucket-name prefix):
 *   {orderId}/{filmProjectId}/final/film.mp4
 *   {orderId}/{filmProjectId}/final/thumbnail.jpg
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";

import { createAdminClient } from "@/lib/supabase/admin";
import { uploadFilmAsset } from "@/services/film/storage/film-storage";
import { filmEnv } from "@/lib/film-env-node";

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
 *   Visible stillness = (500 + 2000) - TRANSITION_DURATION(800) ≈ 1700ms
 *
 * Flow: narration ends → ~1.7s still spread → page turn (0.8s) → next spread
 */
const TRANSITION_DURATION = 0.8;

/**
 * ffmpeg xfade transition type.
 * "wipeleft" simulates pages turning right-to-left (Hebrew reading direction).
 */
const TRANSITION_TYPE = "wipeleft";

/** Timeout for a single ffmpeg merge operation (3 minutes). */
const MERGE_TIMEOUT_MS = 3 * 60 * 1000;

/** Timeout for individual scene mux operations (2 minutes). */
const MUX_TIMEOUT_MS = 2 * 60 * 1000;

// ── Preview export mode ──────────────────────────────────────────────────────
//
// Supabase free plan storage cap blocks large final film uploads.
// When true, the final re-encode uses lower resolution/bitrate.
// TO RESTORE PRODUCTION QUALITY: set to false.
//
const PREVIEW_EXPORT_MODE = true;
const PREVIEW_SCALE = "960:540";
const PREVIEW_CRF = "30";
const PREVIEW_PRESET = "fast";
const PREVIEW_AUDIO_BITRATE = "96k";

// ── Helpers ──────────────────────────────────────────────────────────────────

function runFfmpeg(
  command: string,
  args: string[],
  timeoutMs = MERGE_TIMEOUT_MS
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
 * If no audio, adds a silent audio track (required for concat).
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

// ── Pairwise xfade merge ─────────────────────────────────────────────────────

/**
 * Merge two video clips with a single xfade transition.
 *
 * This is the atomic building block: exactly 2 inputs, 1 xfade, 1 output.
 * The offset is simply `duration_of_left_clip - transition_duration`.
 * No chaining, no accumulated offsets, no filter graph complexity.
 *
 * @param leftPath  - Left (earlier) video file
 * @param rightPath - Right (later) video file
 * @param outputPath - Output merged file
 * @param leftDuration - Measured duration of leftPath (from ffprobe)
 * @param stepLabel - Human-readable label for logging
 */
async function mergeTwoClips(
  leftPath: string,
  rightPath: string,
  outputPath: string,
  leftDuration: number,
  stepLabel: string
): Promise<void> {
  const td = TRANSITION_DURATION;
  const offset = leftDuration - td;

  if (offset <= 0) {
    throw new Error(
      `[${stepLabel}] Left clip duration (${leftDuration.toFixed(2)}s) ≤ ` +
        `transition duration (${td}s). Cannot compute valid xfade offset.`
    );
  }

  console.log(
    `[film-assemble] ${stepLabel}: xfade offset=${offset.toFixed(3)}s ` +
      `(left=${leftDuration.toFixed(2)}s, transition=${td}s ${TRANSITION_TYPE})`
  );

  const filterComplex =
    `[0:v][1:v]xfade=transition=${TRANSITION_TYPE}:duration=${td}:offset=${offset.toFixed(3)}[vout];` +
    `[0:a][1:a]acrossfade=d=${td}:c1=tri:c2=tri[aout]`;

  await runFfmpeg(
    "ffmpeg",
    [
      "-y",
      "-i", leftPath,
      "-i", rightPath,
      "-filter_complex", filterComplex,
      "-map", "[vout]",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "18",
      "-c:a", "aac",
      "-b:a", "192k",
      outputPath,
    ],
    MERGE_TIMEOUT_MS
  );
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
      `[film-assemble] Strategy: pairwise iterative merge (no monolithic filter chain)`
    );
    console.log(
      `[film-assemble] Source: rendered_scene_path MP4 files ONLY (no page data, no stills)`
    );
    console.log(
      `[film-assemble] ═══════════════════════════════════════════════════════`
    );

    // ── Download + mux audio into each scene clip ─────────────────────────

    const muxedPaths: string[] = [];

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

      // Verify muxed clip duration
      const dur = await getClipDuration(muxedPath);
      if (dur <= 0) {
        throw new Error(
          `Scene ${i + 1} (${sceneId}) has zero duration after muxing. ` +
            `Re-render this scene.`
        );
      }

      const dbDur = ((scene.duration_ms as number | null) ?? 5000) / 1000;
      console.log(
        `[film-assemble] [${i + 1}/${scenes.length}] ✓ Duration: ` +
          `${dur.toFixed(2)}s (db: ${dbDur.toFixed(2)}s) key=${spreadKey} ` +
          `audio=${audioLocal ? "yes" : "silent"}`
      );

      muxedPaths.push(muxedPath);
    }

    // ── Stitch clips with pairwise merges ─────────────────────────────────

    let finalVideoLocal: string;

    if (muxedPaths.length === 1) {
      // Single scene — no transitions needed
      finalVideoLocal = muxedPaths[0];
      console.log("[film-assemble] Single scene — no transitions needed");
    } else {
      console.log(
        `[film-assemble] ─── Pairwise merge: ${muxedPaths.length} clips, ` +
          `${muxedPaths.length - 1} transitions ───`
      );

      // Start with the first muxed clip
      let currentPath = muxedPaths[0];
      let currentDuration = await getClipDuration(currentPath);

      for (let i = 1; i < muxedPaths.length; i++) {
        const nextPath = muxedPaths[i];
        const outputPath = path.join(tmpDir, `merge-${i}.mp4`);
        const stepLabel = `merge ${i}/${muxedPaths.length - 1}`;

        await mergeTwoClips(
          currentPath,
          nextPath,
          outputPath,
          currentDuration,
          stepLabel
        );

        // Measure the output — this becomes the "left" input for the next merge
        currentDuration = await getClipDuration(outputPath);

        if (currentDuration <= 0) {
          throw new Error(
            `${stepLabel} produced zero-duration output. ` +
              `Assembly cannot continue.`
          );
        }

        console.log(
          `[film-assemble] ${stepLabel}: ✓ output duration=${currentDuration.toFixed(2)}s`
        );

        currentPath = outputPath;
      }

      finalVideoLocal = currentPath;
      console.log(
        `[film-assemble] ─── All merges complete. Pre-final duration: ` +
          `${currentDuration.toFixed(2)}s ───`
      );
    }

    // ── Preview mode re-encode (optional) ─────────────────────────────────

    const outputPath = path.join(tmpDir, "final.mp4");

    if (PREVIEW_EXPORT_MODE) {
      console.log(
        `[film-assemble] ⚠️  Preview export mode — re-encoding to ` +
          `${PREVIEW_SCALE} CRF ${PREVIEW_CRF}`
      );
      await runFfmpeg(
        "ffmpeg",
        [
          "-y",
          "-i", finalVideoLocal,
          "-vf", `scale=${PREVIEW_SCALE}`,
          "-c:v", "libx264",
          "-preset", PREVIEW_PRESET,
          "-crf", PREVIEW_CRF,
          "-c:a", "aac",
          "-b:a", PREVIEW_AUDIO_BITRATE,
          "-movflags", "+faststart",
          outputPath,
        ],
        10 * 60 * 1000
      );
    } else if (finalVideoLocal !== muxedPaths[0]) {
      // Multi-scene: the last merge output IS the final film, just rename
      await fs.rename(finalVideoLocal, outputPath);
    } else {
      // Single-scene production: copy directly
      await fs.copyFile(finalVideoLocal, outputPath);
    }

    // ── Thumbnail ─────────────────────────────────────────────────────────

    const finalThumbLocal = path.join(tmpDir, "thumbnail.jpg");
    const firstDur = await getClipDuration(outputPath);
    const thumbTimeSec = Math.min(2, firstDur * 0.5);
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

    // ── Final duration ────────────────────────────────────────────────────

    const finalDurationSec = await getClipDuration(outputPath);

    // ── Upload ────────────────────────────────────────────────────────────

    const videoBuffer = await fs.readFile(outputPath);
    const thumbBuffer = await fs.readFile(finalThumbLocal);

    const finalVideoStoragePath = `${orderId}/${filmProjectId}/final/film.mp4`;
    const finalThumbStoragePath = `${orderId}/${filmProjectId}/final/thumbnail.jpg`;

    console.log(
      `[film-assemble] Uploading final film ` +
        `(${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB, ` +
        `${Math.round(finalDurationSec)}s)`
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
        final_duration_seconds: Math.round(finalDurationSec),
        last_assembled_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", filmProjectId);

    console.log(
      `[film-assemble] ═══════════════════════════════════════════════════════`
    );
    console.log(
      `[film-assemble] ✓ Assembly complete (pairwise merge, rendered clips only)`
    );
    console.log(
      `[film-assemble]   Duration: ${Math.round(finalDurationSec)}s`
    );
    console.log(
      `[film-assemble]   Scenes: ${scenes.length}`
    );
    console.log(
      `[film-assemble]   Transitions: ${Math.max(0, scenes.length - 1)} × ${TRANSITION_TYPE}`
    );
    console.log(
      `[film-assemble] ═══════════════════════════════════════════════════════`
    );

    return {
      finalVideoPath: finalVideoStoragePath,
      finalThumbnailPath: finalThumbStoragePath,
      finalDurationSeconds: finalDurationSec,
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
