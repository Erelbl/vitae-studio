/**
 * Final Film Assembly
 *
 * Assembles all rendered scene videos into a single final film with
 * page-turn transitions between scenes. Scenes represent open album spreads
 * (two pages side-by-side) — the assembly preserves this layout.
 *
 * ⚠️  ENVIRONMENT REQUIREMENTS
 * - ffmpeg + ffprobe must be installed (for video concatenation + transitions)
 * - Node.js environment (not Vercel serverless)
 * - Same machine requirements as the render worker
 *
 * Audio handling:
 * - Scene narration audio (MP3) is muxed into each scene's silent MP4
 * - Scenes without audio get a silent audio track (required for concat)
 * - Audio crossfades match visual transitions
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
 * At 1.0s with fadeblack, the outgoing scene fades to black over ~0.5s
 * and the incoming scene fades from black over ~0.5s, creating a natural
 * breathing pause between spreads.
 */
const TRANSITION_DURATION = 1.0;

/**
 * ffmpeg xfade transition type.
 * "fadeblack" creates a page-turn feel: the outgoing spread gracefully
 * fades to black, holds briefly, then the next spread fades in from black.
 * This provides both a visual page-turn and a breathing pause between scenes.
 */
const TRANSITION_TYPE = "fadeblack";

/** Timeout for the full assembly ffmpeg process (10 minutes). */
const ASSEMBLY_TIMEOUT_MS = 10 * 60 * 1000;

/** Timeout for individual scene mux operations (2 minutes). */
const MUX_TIMEOUT_MS = 2 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Run an ffmpeg/ffprobe command and return { stdout, stderr }.
 * Uses spawn to avoid buffer overflow on large stderr output.
 */
function runFfmpeg(
  command: string,
  args: string[],
  timeoutMs = ASSEMBLY_TIMEOUT_MS
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
        const lastLines = stderr.split("\n").filter(Boolean).slice(-5).join("\n");
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

/**
 * Check that ffmpeg and ffprobe are available on the system.
 */
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

/**
 * Download a file from Supabase storage to a local path.
 */
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
 * If no audio, adds a silent audio track (required for concat with xfade).
 *
 * IMPORTANT: When audio exists, we do NOT use -shortest. The scene video is
 * always longer than the audio by design (1500ms padding from computeSceneDuration).
 * Using -shortest would truncate the video to audio length, cutting off:
 *   - The fade-out transition at the end of the scene
 *   - The tail of the text reveal animation
 *   - Ken Burns zoom completion
 * This was the root cause of the "freeze" bug: truncated clips caused xfade
 * offsets to exceed actual durations, making ffmpeg hold the last frame.
 */
async function muxAudioIntoVideo(
  videoPath: string,
  audioPath: string | null,
  outputPath: string
): Promise<void> {
  if (!audioPath) {
    // No narration — add silent audio track so all scenes have matching streams.
    // -shortest is needed here to limit anullsrc (infinite) to the video length.
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
    // Video duration > audio duration by design (1500ms padding).
    // We want the full video so all animations complete naturally.
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

/**
 * Measure actual duration of a video/audio file via ffprobe.
 * Used after muxing to get accurate clip durations for xfade offset calculation.
 */
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

/**
 * Assemble all rendered scenes for a film project into a single final film.
 *
 * Flow:
 * 1. Validate all scenes are rendered
 * 2. Download scene videos + audio to temp directory
 * 3. Mux audio into each scene video
 * 4. Concatenate with page-turn (wipeleft) transitions via ffmpeg xfade
 * 5. Upload final MP4 + thumbnail to storage
 * 6. Update film_projects row
 */
export async function assembleFilm(
  input: AssembleFilmInput
): Promise<AssembleFilmResult> {
  const { orderId, filmProjectId } = input;
  const adminClient = createAdminClient();

  // 1. Check ffmpeg availability
  await checkFfmpeg();

  // 2. Fetch film project
  const { data: project, error: projErr } = await adminClient
    .from("film_projects")
    .select("*")
    .eq("id", filmProjectId)
    .single();

  if (projErr || !project) {
    throw new Error(`Film project not found: ${filmProjectId}`);
  }

  // 3. Fetch all scenes sorted by scene_order
  const { data: scenes, error: scenesErr } = await adminClient
    .from("film_scenes")
    .select("*")
    .eq("film_project_id", filmProjectId)
    .order("scene_order");

  if (scenesErr || !scenes || scenes.length === 0) {
    throw new Error("No scenes found for this film project");
  }

  // 4. Validate all scenes are rendered with video paths
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
      `Cannot assemble: ${missingVideo.length} scene(s) missing rendered video`
    );
  }

  // 5. Create temp directory for all intermediate files
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vitae-assemble-"));
  const storageBucket = filmEnv.storageBucket!;

  try {
    console.log(
      `[film-assemble] Assembling ${scenes.length} scenes for project ${filmProjectId}`
    );

    // 6. Download all scene videos + audio, mux audio into each
    const muxedPaths: string[] = [];
    const sceneDurations: number[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneId = scene.id as string;
      const videoStoragePath = scene.rendered_scene_path as string;
      const audioStoragePath = scene.audio_path as string | null;

      console.log(
        `[film-assemble] Downloading scene ${i + 1}/${scenes.length} (${sceneId})`
      );

      // Download video
      const videoLocal = path.join(tmpDir, `scene-${i}-video.mp4`);
      await downloadStorageFile(videoStoragePath, videoLocal, storageBucket);

      // Download audio if exists
      let audioLocal: string | null = null;
      if (audioStoragePath) {
        audioLocal = path.join(tmpDir, `scene-${i}-audio.mp3`);
        await downloadStorageFile(audioStoragePath, audioLocal, storageBucket);
      }

      // Mux audio into video (or add silent track)
      const muxedPath = path.join(tmpDir, `scene-${i}-muxed.mp4`);
      console.log(
        `[film-assemble] Muxing scene ${i + 1} (audio: ${audioLocal ? "yes" : "silent"})`
      );
      await muxAudioIntoVideo(videoLocal, audioLocal, muxedPath);

      // Measure ACTUAL clip duration via ffprobe — critical for correct xfade offsets.
      // DB duration_ms may differ from actual clip duration due to codec frame alignment
      // or rounding. Using actual durations prevents the freeze bug.
      const actualDuration = await getClipDuration(muxedPath);
      const dbDurationSec = ((scene.duration_ms as number | null) ?? 5000) / 1000;

      if (Math.abs(actualDuration - dbDurationSec) > 0.5) {
        console.log(
          `[film-assemble] Scene ${i + 1} duration: actual=${actualDuration.toFixed(2)}s, ` +
            `db=${dbDurationSec.toFixed(2)}s (using actual)`
        );
      }

      muxedPaths.push(muxedPath);
      sceneDurations.push(actualDuration);
    }

    // 7. Assemble final film
    const finalVideoLocal = path.join(tmpDir, "final.mp4");

    if (muxedPaths.length === 1) {
      // Single scene — just copy, no transitions needed
      await fs.copyFile(muxedPaths[0], finalVideoLocal);
      console.log(
        "[film-assemble] Single scene — copied directly (no transitions)"
      );
    } else {
      // Multiple scenes — concatenate with page-turn transitions
      await concatenateWithTransitions(
        muxedPaths,
        sceneDurations,
        finalVideoLocal
      );
    }

    // 8. Extract thumbnail from the final film
    const finalThumbLocal = path.join(tmpDir, "thumbnail.jpg");
    const thumbTimeSec = Math.min(2, sceneDurations[0] * 0.5);
    await runFfmpeg(
      "ffmpeg",
      [
        "-y",
        "-i", finalVideoLocal,
        "-ss", thumbTimeSec.toFixed(2),
        "-vframes", "1",
        "-q:v", "3",
        finalThumbLocal,
      ],
      MUX_TIMEOUT_MS
    );

    // 9. Get actual final duration via ffprobe
    const { stdout: probeOut } = await runFfmpeg(
      "ffprobe",
      [
        "-v", "quiet",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        finalVideoLocal,
      ],
      30_000
    );
    const finalDurationSec = parseFloat(probeOut.trim()) || 0;

    // 10. Upload final film + thumbnail to storage
    const videoBuffer = await fs.readFile(finalVideoLocal);
    const thumbBuffer = await fs.readFile(finalThumbLocal);

    // Paths relative to the "films" bucket — no bucket-name prefix
    const finalVideoStoragePath = `${orderId}/${filmProjectId}/final/film.mp4`;
    const finalThumbStoragePath = `${orderId}/${filmProjectId}/final/thumbnail.jpg`;

    console.log(
      `[film-assemble] Uploading final film (${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB)`
    );
    await uploadFilmAsset(finalVideoStoragePath, videoBuffer, "video/mp4");
    await uploadFilmAsset(finalThumbStoragePath, thumbBuffer, "image/jpeg");

    // 11. Update film_projects
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
      `[film-assemble] Assembly complete. Duration: ${Math.round(finalDurationSec)}s, ` +
        `Scenes: ${scenes.length}, Transitions: ${Math.max(0, scenes.length - 1)}`
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
    // Clean up temp directory (best-effort)
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Concatenation with transitions ───────────────────────────────────────────

/**
 * Concatenate multiple scene videos with page-turn (wipeleft) transitions.
 *
 * Uses ffmpeg's xfade filter for video and acrossfade for audio.
 * Each transition overlaps by TRANSITION_DURATION seconds.
 *
 * The wipeleft transition reinforces the album-flipping feeling:
 * the current spread wipes away to the left as the next spread appears,
 * mimicking pages turning right-to-left (Hebrew reading direction).
 */
async function concatenateWithTransitions(
  videoPaths: string[],
  durations: number[],
  outputPath: string
): Promise<void> {
  const n = videoPaths.length;
  const td = TRANSITION_DURATION;

  // Build ffmpeg input arguments
  const inputs: string[] = [];
  for (const p of videoPaths) {
    inputs.push("-i", p);
  }

  // Build xfade filter chain for video + acrossfade for audio
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];

  for (let i = 0; i < n - 1; i++) {
    // Video xfade
    const vPrev = i === 0 ? `[${i}:v]` : `[v${i}]`;
    const vNext = `[${i + 1}:v]`;
    const vOut = i === n - 2 ? "[vout]" : `[v${i + 1}]`;

    // offset_i = sum(durations[0..i]) - (i + 1) * td
    const offset =
      durations.slice(0, i + 1).reduce((a, b) => a + b, 0) - (i + 1) * td;

    videoFilters.push(
      `${vPrev}${vNext}xfade=transition=${TRANSITION_TYPE}:duration=${td}:offset=${offset.toFixed(3)}${vOut}`
    );

    // Audio acrossfade (matches transition timing)
    const aPrev = i === 0 ? `[${i}:a]` : `[a${i}]`;
    const aNext = `[${i + 1}:a]`;
    const aOut = i === n - 2 ? "[aout]" : `[a${i + 1}]`;

    audioFilters.push(
      `${aPrev}${aNext}acrossfade=d=${td}:c1=tri:c2=tri${aOut}`
    );
  }

  const filterComplex = [...videoFilters, ...audioFilters].join(";");

  const args = [
    "-y",
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outputPath,
  ];

  console.log(
    `[film-assemble] Running ffmpeg: ${n} inputs, ${n - 1} ${TRANSITION_TYPE} transitions (${td}s each)`
  );

  await runFfmpeg("ffmpeg", args, ASSEMBLY_TIMEOUT_MS);
}
