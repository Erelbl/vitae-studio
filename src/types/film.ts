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
  "queued",
  "rendering",
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
  /**
   * Per-scene pronunciation overrides applied at TTS time only.
   * Takes precedence over project-level tts_overrides_json for the same `original` key.
   * Never modifies album text shown to the customer.
   */
  scene_overrides_json: TtsOverride[] | null;
  /**
   * When true, the scene uses ONE unified Kling video spanning both pages instead of
   * separate right-page / left-page videos. The spread video is a single continuous
   * visual background across the full open-book spread. Only meaningful for 2-page
   * spread scenes (page_ids_json.length >= 2). Manually toggled per scene by the admin.
   */
  is_unified_spread: boolean;
  /**
   * Storage path inside the films/ bucket for the unified spread Kling video.
   * Non-null only when is_unified_spread is true and the video has been generated.
   * Cleared when is_unified_spread is toggled off (or when forcing regeneration).
   */
  spread_video_path: string | null;
  /**
   * Job type set by the UI when queuing. Controls what the worker does.
   * 'full_render' (default) — full pipeline. 'regenerate_video_only' — clears
   * the requested Kling path(s) and re-renders the scene.
   */
  render_job_type: string;
  /**
   * Which Kling video asset to regenerate. Only meaningful for 'regenerate_video_only'.
   * Values: 'right' | 'left' | 'both' | 'spread'
   */
  render_video_target: string | null;
  /** Machine-readable render stage. Null when idle. */
  render_stage: string | null;
  /** 0–100 progress within the current render. */
  render_progress_pct: number;
  /** Hebrew label for the current render stage, shown in the admin UI. Null when idle. */
  render_stage_message: string | null;
  /** Last render error message. Persists past status changes; cleared on success. */
  last_render_error: string | null;
  created_at: string;
  updated_at: string;
}
