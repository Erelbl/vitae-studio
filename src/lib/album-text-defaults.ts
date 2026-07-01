import type { TextAlign, TextColor } from "@/types/page";

/** Fallback text-styling values used when a page has no explicit admin overrides. */
export const ALBUM_TEXT_DEFAULTS = {
  fontSizePx: 11,
  lineHeight: 1.2,
  textColor: "black" as TextColor,
  textAlign: "right" as TextAlign,
  textWidthPct: 84,
} as const;
