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

export const LAYOUT_TYPES = [
  "FULL_IMAGE",
  "TEXT_ONLY",
  "IMAGE_TOP_TEXT_BOTTOM",
  "TEXT_TOP_IMAGE_BOTTOM",
  "IMAGE_LEFT_TEXT_RIGHT",
  "IMAGE_RIGHT_TEXT_LEFT",
  "TWO_IMAGES",
  "FULL_IMAGE_TEXT_TOP",
  "FULL_IMAGE_TEXT_CENTER",
] as const;
export type LayoutType = (typeof LAYOUT_TYPES)[number];

export const TEXT_SIZES = ["sm", "md", "lg", "xl"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_COLORS = ["white", "black"] as const;
export type TextColor = (typeof TEXT_COLORS)[number];

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

export type TextAlign = "left" | "center" | "right";

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
  layout_type: LayoutType;
  text_size: TextSize | null;
  /** Numeric font size in px. Overrides text_size when set. */
  font_size_px: number | null;
  /** Text alignment for page text. Defaults to 'center'. */
  text_align: TextAlign | null;
  /** Free-position text X (0–1). Null = use layout-default position. */
  text_x: number | null;
  /** Free-position text Y (0–1). Null = use layout-default position. */
  text_y: number | null;
  /** Text color for page text. Null = layout default (white for overlays, foreground for splits). */
  text_color: TextColor | null;
  /** Line-height multiplier for text blocks (e.g. 1.0–2.5). Null = default (1.4). */
  line_height: number | null;
  /** Text box width as a percentage of the page (30–100). Null = layout default. */
  text_width_pct: number | null;
  /** Page background hex color (e.g. '#FAF8F2'). Null = layout default. */
  bg_color: string | null;
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

/** One image slot assigned to a page, with crop/zoom values. */
export interface PageImageSlot {
  id: string;
  slot: 1 | 2;
  photo_id: string | null;
  crop_x: number;  // 0-1: horizontal pan (0 = left edge, 1 = right edge)
  crop_y: number;  // 0-1: vertical pan (0 = top edge, 1 = bottom edge)
  scale: number;   // ≥1: zoom level (1 = fill frame, 2 = 2× zoom)
  /**
   * Decorative frame mask preset. Applied as CSS clip-path on the image container.
   * null = no mask (default). Values: torn_top | torn_bottom | torn_left | torn_right
   */
  frame_style: string | null;
  /** Pre-resolved signed URL. null when photo has no illustration or URL expired. */
  image_url: string | null;
  /**
   * Whether this slot renders the white-background-removed version of the illustration.
   * Requires photos.illustration_nobg_path to be set on the referenced photo.
   */
  use_nobg: boolean;
}

export const TEXT_POSITIONS = ["top", "bottom", "overlay"] as const;
export type TextPosition = (typeof TEXT_POSITIONS)[number];

/** Slim read model for the customer album preview */
export interface PreviewPage {
  id: string;
  page_number: number;
  page_type: PageType;
  /**
   * Controls which layout template is used for illustration_and_text pages.
   * Defaults to FULL_IMAGE for all existing pages.
   */
  layout_type: LayoutType;
  text_content: string | null;
  /**
   * Legacy: pre-resolved signed URL from pages.illustration_storage_path.
   * Used as slot-1 fallback when page_images is empty.
   */
  image_url: string | null;
  /** Where the text sits (only used by FULL_IMAGE overlay). Defaults to "overlay". */
  text_position?: TextPosition;
  /** Display font size for page text (legacy enum). Defaults to "md" (15 px). */
  text_size?: TextSize | null;
  /** Numeric font size in px. Overrides text_size when set. */
  font_size_px?: number | null;
  /** Text alignment. Defaults to 'center'. */
  text_align?: TextAlign | null;
  /** Free-position text X (0–1). Null = use layout-default gradient position. */
  text_x?: number | null;
  /** Free-position text Y (0–1). Null = use layout-default gradient position. */
  text_y?: number | null;
  /** Text color. Null = layout default (white for overlays, foreground for splits). */
  text_color?: TextColor | null;
  /** Line-height multiplier. Null = default (1.4). */
  line_height?: number | null;
  /** Text box width percentage (30–100). Null = layout default. */
  text_width_pct?: number | null;
  /** Page background hex color. Null = layout default. */
  bg_color?: string | null;
  /**
   * New slot-based image assignments from page_images table.
   * Slot 1 = primary image, Slot 2 = secondary (TWO_IMAGES layout only).
   * Takes priority over legacy image_url.
   */
  images: PageImageSlot[];
}

export interface PreviewData {
  personName: string;
  pages: PreviewPage[];
  /** true when real pages do not exist yet and mock data is shown */
  isMock: boolean;
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
