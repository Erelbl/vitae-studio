// ── Film Project ──────────────────────────────────────────────────────────────

export const FILM_PROJECT_STATUSES = [
  "draft",
  "scenes_built",
  "narration_pending",
  "narration_ready",
  "rendering",
  "rendered",
  "assembled",
  "error",
] as const;
export type FilmProjectStatus = (typeof FILM_PROJECT_STATUSES)[number];

export const NARRATION_MODES = ["ai", "manual", "none"] as const;
export type NarrationMode = (typeof NARRATION_MODES)[number];

export const VOICE_CHOICE_STATUSES = [
  "pending",
  "samples_ready",
  "chosen",
] as const;
export type VoiceChoiceStatus = (typeof VOICE_CHOICE_STATUSES)[number];

export const MOTION_STYLES = ["gentle", "dynamic", "none"] as const;
export type MotionStyle = (typeof MOTION_STYLES)[number];

// ── TTS Overrides ─────────────────────────────────────────────────────────────

/**
 * A single pronunciation override applied at TTS generation time only.
 * Never modifies the stored album or narration text.
 */
export interface TtsOverride {
  /** The exact string to find in the narration text */
  original: string;
  /** The phonetic replacement sent to ElevenLabs */
  spoken: string;
}

export interface TtsOverridesPayload {
  overrides: TtsOverride[];
}

// ── Film Project ──────────────────────────────────────────────────────────────

export interface FilmProject {
  id: string;
  order_id: string;
  status: FilmProjectStatus;
  narration_mode: NarrationMode;
  selected_voice_id: string | null;
  voice_choice_status: VoiceChoiceStatus;
  voice_sample_a_path: string | null;
  voice_sample_b_path: string | null;
  voice_sample_a_voice_id: string | null;
  voice_sample_b_voice_id: string | null;
  motion_style: MotionStyle;
  music_enabled: boolean;
  music_track_path: string | null;
  final_video_path: string | null;
  final_video_thumbnail_path: string | null;
  final_duration_seconds: number | null;
  last_assembled_at: string | null;
  last_rendered_at: string | null;
  render_version: number;
  error_message: string | null;
  /** Pronunciation overrides applied at TTS time only. Never modifies album text. */
  tts_overrides_json: TtsOverride[] | null;
  created_at: string;
  updated_at: string;
}

// ── Voice Samples ─────────────────────────────────────────────────────────────

export interface VoiceSamplesResult {
  filmProject: FilmProject;
  sampleAPath: string;
  sampleBPath: string;
}

export interface VoiceSelectionResult {
  filmProject: FilmProject;
}

// ── Film Scene ───────────────────────────────────────────────────────────────

export const FILM_SCENE_STATUSES = [
  "pending",
  "narration_ready",
  "rendered",
  "error",
] as const;
export type FilmSceneStatus = (typeof FILM_SCENE_STATUSES)[number];

export interface FilmScene {
  id: string;
  film_project_id: string;
  page_spread_key: string | null;
  page_ids_json: string[] | null;
  scene_order: number;
  title: string | null;
  status: FilmSceneStatus;
  source_text: string | null;
  narration_text: string | null;
  voice_id: string | null;
  motion_preset: string | null;
  transition_in: string | null;
  transition_out: string | null;
  duration_ms: number | null;
  audio_duration_ms: number | null;
  audio_path: string | null;
  rendered_scene_path: string | null;
  thumbnail_path: string | null;
  render_hash: string | null;
  version: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
