import { createAdminClient } from "@/lib/supabase/admin";
import { textToSpeech } from "@/services/film/narration/elevenlabs";
import { applyTtsOverrides, mergeOverrides } from "@/services/film/utils/apply-tts-overrides";
import { computeSceneDuration } from "@/services/film/utils/compute-scene-duration";
import { getMp3DurationMs } from "@/services/film/utils/mp3-duration";
import { uploadFilmAsset } from "@/services/film/storage/film-storage";
import type { TtsOverride } from "@/types/film";

export interface GenerateSceneAudioInput {
  sceneId: string;
  orderId: string;
  filmProjectId: string;
}

export interface GenerateSceneAudioResult {
  audioPath: string;
  /** True audio duration in ms parsed from MP3 frame structure. */
  audioDurationMs: number;
  /** Scene display duration: audioDurationMs + visual padding, minimum 3000ms. */
  durationMs: number;
}

/**
 * Generates narration audio for a single film scene via ElevenLabs TTS.
 *
 * Steps:
 *   1. Fetch scene row to get narration_text
 *   2. Fetch film project for selected_voice_id and tts_overrides_json
 *   3. Apply TTS pronunciation overrides (non-mutating — never touches stored text)
 *   4. Call ElevenLabs TTS → MP3 buffer
 *   5. Parse true audio duration from MP3 frame structure (getMp3DurationMs)
 *   6. Upload MP3 to: {orderId}/{filmProjectId}/scenes/{sceneId}/narration.mp3 (inside "films" bucket)
 *   7. Update film_scenes: audio_path, audio_duration_ms, duration_ms, status → narration_ready
 *
 * Duration notes:
 *   audio_duration_ms = getMp3DurationMs(buffer)
 *   Reads the Xing/Info VBR header (exact frame count × 1152/sampleRate) when
 *   present, and falls back to bitrate-from-header × audioBytes for CBR files.
 *   ElevenLabs eleven_v3 uses VBR, so the old buffer-size heuristic was
 *   systematically short by 30–50 %, causing the Remotion sequence to end
 *   before the audio finished.
 *   duration_ms = computeSceneDuration(audio_duration_ms) = max(3000, audio_duration_ms + 3500).
 *
 * Errors propagate to caller; the caller is responsible for storing error_message.
 */
export async function generateSceneAudio(
  input: GenerateSceneAudioInput
): Promise<GenerateSceneAudioResult> {
  const { sceneId, orderId, filmProjectId } = input;
  const adminClient = createAdminClient();

  // 1. Fetch scene (include scene_overrides_json for per-scene pronunciation corrections)
  const { data: scene, error: sceneError } = await adminClient
    .from("film_scenes")
    .select("id, narration_text, film_project_id, scene_overrides_json")
    .eq("id", sceneId)
    .single();

  if (sceneError || !scene) {
    throw new Error(`Scene not found: ${sceneId}`);
  }
  if ((scene.film_project_id as string) !== filmProjectId) {
    throw new Error(
      `Scene ${sceneId} does not belong to film project ${filmProjectId}`
    );
  }

  const narrationText = (scene.narration_text as string | null)?.trim();
  if (!narrationText) {
    throw new Error(
      `Scene ${sceneId} has no narration text — cannot generate audio`
    );
  }

  // 2. Fetch film project for voice ID and TTS overrides
  const { data: project, error: projectError } = await adminClient
    .from("film_projects")
    .select("id, selected_voice_id, tts_overrides_json")
    .eq("id", filmProjectId)
    .single();

  if (projectError || !project) {
    throw new Error(`Film project not found: ${filmProjectId}`);
  }

  const voiceId = project.selected_voice_id as string | null;
  if (!voiceId) {
    throw new Error(
      "No voice selected — choose a voice before generating audio"
    );
  }

  // 3. Apply TTS pronunciation overrides.
  // IMPORTANT: applyTtsOverrides is non-mutating. The original narration_text
  // in the database is never modified — overrides only affect the TTS input.
  //
  // Scene-level overrides take precedence over project-level overrides for
  // the same `original` key. Both sets are merged before applying.
  const projectOverrides = project.tts_overrides_json as TtsOverride[] | null;
  const sceneOverrides = scene.scene_overrides_json as TtsOverride[] | null;
  const mergedOverrides = mergeOverrides(projectOverrides, sceneOverrides);
  const ttsText = applyTtsOverrides(narrationText, mergedOverrides);

  if (mergedOverrides.length > 0) {
    const applied = mergedOverrides.filter(
      (o) => o.original?.trim() && narrationText.includes(o.original.trim())
    );
    console.log(
      `[generate-scene-audio] scene=${sceneId}: ${applied.length}/${mergedOverrides.length} overrides matched. ttsText changed=${ttsText !== narrationText}`
    );
  }

  // 4. Generate audio via ElevenLabs TTS
  const { audioBuffer } = await textToSpeech({ text: ttsText, voiceId });

  // 5. Measure true audio duration by parsing the MP3 frame structure.
  // ElevenLabs eleven_v3 generates VBR audio: silence between Hebrew words
  // is encoded at a much lower bitrate than the nominal 128 kbps, so a plain
  // buffer-size ÷ 16 000 estimate can be less than half the real duration.
  // getMp3DurationMs() reads the Xing/Info VBR header (exact frame count) when
  // present, and falls back to bitrate-from-header × audioBytes for CBR files.
  const audioDurationMs = getMp3DurationMs(audioBuffer);
  console.log(
    `[generate-scene-audio] scene=${sceneId}: parsed audioDurationMs=${audioDurationMs} ` +
    `bufferBytes=${audioBuffer.length} ` +
    `(legacy estimate would have been ${Math.round((audioBuffer.length / 16000) * 1000)} ms)`
  );
  const durationMs = computeSceneDuration(audioDurationMs);

  // 6. Upload MP3 to film storage
  // Path is relative to the "films" bucket — no bucket-name prefix
  const audioPath = `${orderId}/${filmProjectId}/scenes/${sceneId}/narration.mp3`;
  await uploadFilmAsset(audioPath, audioBuffer, "audio/mpeg");

  // 7. Persist audio metadata and advance scene status
  await adminClient
    .from("film_scenes")
    .update({
      audio_path: audioPath,
      audio_duration_ms: audioDurationMs,
      duration_ms: durationMs,
      status: "narration_ready",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sceneId);

  return { audioPath, audioDurationMs, durationMs };
}
