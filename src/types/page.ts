export const TEXT_STATUSES = [
  "pending",
  "generating",
  "ready",
  "approved",
] as const;
export type TextStatus = (typeof TEXT_STATUSES)[number];

export const ILLUSTRATION_STATUSES = [
  "pending",
  "generating",
  "ready",
  "failed",
  "approved",
] as const;
export type IllustrationStatus = (typeof ILLUSTRATION_STATUSES)[number];

export const PAGE_TYPES = [
  "illustration_and_text",
  "text_only",
  "cover",
  "dedication",
  "back_cover",
] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const VERSION_TYPES = ["text", "illustration"] as const;
export type VersionType = (typeof VERSION_TYPES)[number];

export const VERSION_CREATED_BY = [
  "generation",
  "admin_edit",
  "restore",
] as const;
export type VersionCreatedBy = (typeof VERSION_CREATED_BY)[number];

export const SETTING_TYPES = ["story", "illustration", "followup"] as const;
export type SettingType = (typeof SETTING_TYPES)[number];

export interface AlbumPage {
  id: string;
  order_id: string;
  page_number: number;
  created_at: string;
  updated_at: string;
  photo_id: string | null;
  text_content: string | null;
  text_version: number;
  text_status: TextStatus;
  illustration_storage_path: string | null;
  illustration_version: number;
  illustration_status: IllustrationStatus;
  illustration_prompt: string | null;
  illustration_model: string | null;
  text_generation_model: string | null;
  admin_text_override: boolean;
  page_type: PageType;
  narration_audio_path: string | null;
  narration_duration_ms: number | null;
  transition_type: string;
  display_duration_ms: number;
}

export interface PageVersion {
  id: string;
  page_id: string;
  created_at: string;
  version_type: VersionType;
  version_number: number;
  content: string;
  generation_settings_id: string | null;
  input_snapshot: Record<string, unknown> | null;
  output_metadata: Record<string, unknown> | null;
  created_by: VersionCreatedBy;
}

export interface GenerationSettings {
  id: string;
  order_id: string | null;
  created_at: string;
  setting_type: SettingType;
  provider: string;
  model_id: string;
  system_prompt: string | null;
  user_prompt_template: string | null;
  temperature: number | null;
  max_tokens: number | null;
  extra_params: Record<string, unknown> | null;
  is_active: boolean;
  notes: string | null;
}
