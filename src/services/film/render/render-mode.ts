/**
 * Film assembly render mode configuration.
 *
 * "preview" — fast review at lower resolution (default)
 * "final"   — delivery/projection at full resolution
 */

export type FilmRenderMode = "preview" | "final";

export interface FilmRenderModeConfig {
  mode: FilmRenderMode;
  width: number;
  height: number;
  crf: number;
  label: string;
}

export const FILM_RENDER_MODES: Record<FilmRenderMode, FilmRenderModeConfig> = {
  preview: { mode: "preview", width: 960,  height: 540,  crf: 24, label: "תצוגה מקדימה" },
  final:   { mode: "final",   width: 1920, height: 1080, crf: 22, label: "סופי" },
};

export const DEFAULT_RENDER_MODE: FilmRenderMode = "preview";

/** Coerce an unknown string to a valid FilmRenderMode, falling back to the default. */
export function toRenderMode(value: unknown): FilmRenderMode {
  if (value === "final") return "final";
  return DEFAULT_RENDER_MODE;
}
