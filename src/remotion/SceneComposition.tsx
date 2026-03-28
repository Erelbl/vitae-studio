import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useAlbumFont } from "./album-font";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SlotImageData {
  url: string;
  /**
   * Image CENTER x as a fraction of the container (0–1).
   * 0.5 = centered (default). Matches the preview/editor's unified crop model.
   * DO NOT confuse with the old "left-edge pan" model — here 0.5 always centers.
   */
  crop_x: number;
  /**
   * Image CENTER y as a fraction of the container (0–1).
   * 0.5 = centered (default).
   */
  crop_y: number;
  /** Image size relative to container. 1 = fills container exactly. */
  scale: number;
  /**
   * SVG mask preset key (e.g. "torn_top", "oval").
   * When set, the image is masked with the corresponding SVG shape and
   * objectFit is switched to "cover" so the image fills the mask fully.
   */
  frameStyle?: string | null;
  /** Non-destructive inset crop (fraction 0–1). Applied as clipPath on the image wrapper. */
  cropInsetTop?: number;
  cropInsetRight?: number;
  cropInsetBottom?: number;
  cropInsetLeft?: number;
}

/** Per-page data passed to spread scenes. Same fields as the primary page props. */
export interface ScenePageData {
  slot1: SlotImageData | null;
  slot2: SlotImageData | null;
  layoutType: string;
  textContent: string | null;
  textSize: string | null;
  fontSizePx: number | null;
  textAlign: string;
  textX: number | null;
  textY: number | null;
  /**
   * Signed HTTPS URL to a Kling-generated page video stored in the films bucket.
   * When set, ImageFill renders this video as the visual source for this page.
   * Null → static resolved page image (no CSS motion, no Ken Burns).
   */
  klingVideoUrl?: string | null;
}

export interface SceneCompositionProps {
  /** Primary image slot with crop params. */
  slot1: SlotImageData | null;
  /** Secondary image slot (TWO_IMAGES layout). */
  slot2: SlotImageData | null;
  /** Album page layout type (e.g. "FULL_IMAGE", "IMAGE_TOP_TEXT_BOTTOM"). */
  layoutType: string;
  /** Album page text content — positioned and styled per layout. */
  textContent: string | null;
  /** Text size enum from album ("sm"|"md"|"lg"|"xl"). */
  textSize: string | null;
  /** Explicit font size in px — takes priority over textSize. */
  fontSizePx: number | null;
  /** Text alignment ("start"|"center"|"end"). start = right in RTL. */
  textAlign: string;
  /** Custom text X position (0–1 fraction) — free-position admin override. */
  textX: number | null;
  /** Custom text Y position (0–1 fraction) — free-position admin override. */
  textY: number | null;
  /**
   * Page type for special scene rendering.
   * "cover" → renders the album cover with person name and branding.
   * "back_cover" → renders the album back cover with Vitae Studio branding.
   * "dedication" → renders the dedication page layout.
   * null → standard content page (dispatches on layoutType).
   */
  pageType: string | null;
  /**
   * Person name from the order — shown prominently on the cover page.
   * Only used when pageType === "cover".
   */
  personName: string | null;
  /** Second page data for spread scenes (2-page open-book view). Null for single-page scenes. */
  secondPage: ScenePageData | null;
  /** Ken Burns zoom or static. */
  motionPreset: "ken_burns" | "static";
  /** Fade in at start. */
  transitionIn: "fade" | "none";
  /** Fade out at end. */
  transitionOut: "fade" | "none";
  /** Narration audio duration in ms — used to sync text reveal with speech. */
  narrationDurationMs: number | null;
  /**
   * Signed HTTPS URL to a Kling-generated video for the primary (right) page.
   * When set, ImageFill renders the video as the visual source.
   * Null → static resolved page image (no CSS motion, no Ken Burns).
   */
  klingVideoUrl?: string | null;
  /**
   * Signed HTTPS URL to the narration MP3 for this scene.
   * When set, the audio plays from frame 0 of the composition — narration
   * is baked directly into the rendered scene MP4 (no separate mux step needed).
   */
  narrationUrl?: string | null;
  /**
   * Signed HTTPS URL to a unified spread Kling video that covers both pages.
   * When non-null, the spread video is rendered as a full-width background layer
   * behind both page containers. ImageFill on each page returns null so the
   * transparent page containers reveal the spread video beneath them.
   * Only meaningful for spread scenes (secondPage != null).
   * Null (default) → normal per-page image/video rendering.
   */
  spreadVideoUrl?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FADE_FRAMES = 15;
const ALBUM_FONT = '"YardenAlbum", "Arial Hebrew", "David", Arial, serif';
/** Warm off-white for text areas in split layouts. */
const BG_CARD = "#F6F3E9";
const TEXT_DARK = "#2A2420";
/**
 * Album preview renders at roughly 400px square.
 * Video is 1080px tall. Scale fonts up accordingly.
 */
const FONT_SCALE = 2.5;

/** Ken Burns zoom — subtle, premium feel. Only affects text parallax (image uses Kling or static). */
const KB_ZOOM_END = 1.05;

/** Text writing/reveal starts at this fraction of scene duration. */
const TEXT_REVEAL_START_FRAC = 0.15;
/** Text fully visible at this fraction. */
const TEXT_REVEAL_END_FRAC = 0.65;
/**
 * Narration text reveal offset from scene start (in seconds, not a fraction).
 *
 * Audio is muxed at t=0 in the assembled film, so text must start near-immediately.
 * A fixed 0.15s offset avoids the very first frame hard-pop while keeping text
 * synced with the narrator's voice. Using absolute time (not a fraction of scene
 * duration) keeps the offset consistent regardless of scene length — a 5s scene
 * and a 10s scene both start text at the same 0.15s after audio begins.
 */
const NARRATION_START_OFFSET_SEC = 0.15;

// ── Cinematic polish constants ────────────────────────────────────────────────

/**
 * Storybook slide-in: scene enters by translating up from slightly below.
 * Layered with the existing opacity fade for a "page being turned" feel.
 * Only active when transitionIn === "fade".
 */
const SLIDE_IN_FRAMES = 22;  // slightly longer than FADE_FRAMES for smoothness
const SLIDE_IN_PX = 14;       // 14px on 1080p ≈ 1.3% — imperceptible but present

/**
 * Text parallax: counter-drift of text overlays vs Ken Burns image zoom.
 * As the image subtly zooms in, text drifts slightly outward (up for bottom
 * overlays, down for top overlays). Creates a sense of depth between the
 * illustration plane and the text plane. Very subtle (6px max on 1080p).
 */
const TEXT_PARALLAX_PX = 6;

// ── SVG frame mask presets — identical to AlbumPageView.tsx ──────────────────
// These match the FRAME_MASKS in the preview exactly so Remotion renders the
// same decorative crop shapes as the album editor.

const svgMask = (d: string) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cpath d='${d}' fill='white'/%3E%3C/svg%3E")`;

const FRAME_MASKS: Record<string, string> = {
  torn_top: svgMask("M0,100 L100,100 L100,10 C93,5 87,14 80,8 C73,2 67,13 60,6 C53,1 47,12 40,5 C33,0 27,11 20,4 C13,1 7,13 0,6 Z"),
  torn_bottom: svgMask("M0,0 L100,0 L100,90 C93,95 87,86 80,92 C73,98 67,87 60,94 C53,99 47,88 40,95 C33,100 27,89 20,96 C13,99 7,87 0,94 Z"),
  torn_left: svgMask("M100,0 L100,100 L10,100 C5,93 14,87 8,80 C2,73 13,67 6,60 C1,53 12,47 5,40 C0,33 11,27 4,20 C1,13 13,7 6,0 Z"),
  torn_right: svgMask("M0,0 L0,100 L90,100 C95,93 86,87 92,80 C98,73 87,67 94,60 C99,53 88,47 95,40 C100,33 89,27 96,20 C99,13 87,7 94,0 Z"),
  oval: svgMask("M50,4 C76,4 96,25 96,50 C96,75 76,96 50,96 C24,96 4,75 4,50 C4,25 24,4 50,4 Z"),
  arch: svgMask("M4,100 L4,44 C4,18 20,4 50,4 C80,4 96,18 96,44 L96,100 Z"),
  diamond: svgMask("M50,3 L97,50 L50,97 L3,50 Z"),
};

// NOTE: There is no intra-spread breathing pause. The spread is one unified scene.
// Breathing pauses happen BETWEEN scenes (via scene duration padding + assembly xfade),
// not between the left and right pages of the same spread.

/**
 * Left-page image pre-roll (seconds): the left image starts its sketch reveal
 * this many seconds BEFORE the left-page text begins, so the illustration is
 * already "drawing in" when the narrator switches to the left page.
 */
const LEFT_IMAGE_PREROLL_SEC = 0.3;

/**
 * Left-page visual fade-in duration (frames).
 * When the left page activates, its image/video fades in over this many frames
 * instead of appearing abruptly. At 30fps, 10 frames ≈ 0.33s.
 * Applied only to the left page (imageRevealDelayFrac > 0); the right page
 * activates immediately at full opacity.
 */
const LEFT_FADE_IN_FRAMES = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveAlbumFontSize(
  textSize?: string | null,
  fontSizePx?: number | null
): number {
  if (fontSizePx != null && fontSizePx > 0) return fontSizePx;
  switch (textSize) {
    case "sm": return 12;
    case "lg": return 18;
    case "xl": return 22;
    case "md":
    default:   return 15;
  }
}

/** Scale album font size (designed for ~400px preview) to video resolution. */
function videoFontPx(textSize?: string | null, fontSizePx?: number | null): number {
  return Math.round(resolveAlbumFontSize(textSize, fontSizePx) * FONT_SCALE);
}

// ── Per-page timing context (spread coordination) ───────────────────────

/**
 * Timing overrides for a single page within a spread scene.
 *
 * Provided via React context so AnimatedP and ImageFill can read them
 * without prop threading through intermediate overlay components.
 * When null (single-page scenes), each component uses its own default timing.
 */
interface PageTimingOverride {
  /** Frame at which text reveal begins. */
  textStartFrame: number;
  /** Frame at which text should be fully visible. */
  textEndFrame: number;
  /** Fraction of scene duration to delay the start of image reveal. 0 = no delay. */
  imageRevealDelayFrac: number;
  /**
   * How text reveals within this page.
   * "line"  = line-by-line RTL sweep (used for spread content pages).
   * "word"  = word-by-word fade-in (legacy, single-page default).
   */
  revealMode: "word" | "line";
}

const PageTimingCtx = React.createContext<PageTimingOverride | null>(null);

/**
 * Per-page Kling video URL context.
 *
 * Set by the spread coordinator (or single-page root) to the signed HTTPS URL
 * of the Kling-generated MP4 for this page. ImageFill reads it and, when non-null,
 * renders the video instead of the static illustration + CSS motion effects.
 * Null (default) → existing Remotion CSS-motion fallback.
 */
const PageKlingCtx = React.createContext<string | null>(null);

/**
 * Unified spread mode context.
 *
 * When true, the spread is rendered with a single continuous video that spans
 * both pages. ImageFill returns null in this mode — the spread video is rendered
 * as a separate full-width layer behind both page containers, letting the text
 * overlays (gradient + AnimatedP) render on top of the transparent page containers.
 *
 * False (default) → normal per-page image/video rendering.
 */
const SpreadVideoCtx = React.createContext<boolean>(false);

/** Count real words (non-whitespace tokens) in a text string. */
function countWords(text: string | null): number {
  if (!text) return 0;
  return text.split(/\s+/).filter((t) => t.length > 0).length;
}

// ── AnimatedP — word-by-word text reveal ─────────────────────────────────────

/**
 * A `<p>` element whose text reveals progressively, either word-by-word (legacy)
 * or line-by-line with an RTL sweep (spread content pages).
 *
 * revealMode "word" (default):
 *   Words fade in one by one. Whitespace tokens are always visible so the layout
 *   never shifts. Words overlap slightly (0.8 word-units) for smooth flow.
 *
 * revealMode "line":
 *   Each line sweeps in from right to left (Hebrew reading direction) as a block.
 *   The mask gradient reveals from the physical right edge, expanding leftward —
 *   so the first (rightmost) Hebrew characters appear first. Empty lines are
 *   preserved as spacers (stanza breaks). Lines stagger evenly across the
 *   text reveal window set by the spread timing coordinator.
 *
 * Narration sync: when narrationDurationMs is provided (and no spread context
 * override), text spans the full narration window starting at a fixed 0.15s offset.
 *
 * The revealMode is read from PageTimingCtx (set per-page in spread mode).
 * Single-page scenes have no context → revealMode defaults to "word".
 */
function AnimatedP({
  children,
  style,
  narrationDurationMs,
}: {
  children: string;
  style?: React.CSSProperties;
  narrationDurationMs?: number | null;
}) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  // Check for per-page timing override (set by spread coordinator via context).
  const timingOverride = React.useContext(PageTimingCtx);

  // Determine text reveal window.
  // Priority: spread timing override > narration sync > visual-only fallback.
  let textStart: number;
  let textEnd: number;

  if (timingOverride) {
    // Spread mode: the coordinator has pre-computed per-page windows
    // with hard boundaries and word-proportional splits.
    textStart = timingOverride.textStartFrame;
    textEnd = timingOverride.textEndFrame;
  } else if (narrationDurationMs != null && narrationDurationMs > 0) {
    // Single-page narration-synced: text spans the full narration duration.
    const narrationStartFrame = Math.round(NARRATION_START_OFFSET_SEC * fps);
    const narrationFrames = Math.round((narrationDurationMs / 1000) * fps);
    textStart = narrationStartFrame;
    textEnd = Math.min(
      narrationStartFrame + narrationFrames,
      durationInFrames - FADE_FRAMES
    );
  } else {
    // Visual-only fallback.
    textStart = Math.round(durationInFrames * TEXT_REVEAL_START_FRAC);
    textEnd = Math.round(durationInFrames * TEXT_REVEAL_END_FRAC);
  }

  // Read revealMode from context. Spread pages set "line"; single-page defaults to "word".
  const revealMode = timingOverride?.revealMode ?? "word";

  // ── Line-by-line RTL reveal ──────────────────────────────────────────────────
  if (revealMode === "line") {
    const rawLines = children.split("\n");
    const nonEmptyLines = rawLines.filter((l) => l.trim().length > 0);
    const lineCount = nonEmptyLines.length;

    if (lineCount === 0) return <p style={style} />;

    const totalWindow = Math.max(1, textEnd - textStart);

    // ── Proportional line timing ─────────────────────────────────────────────
    // Weight each line by its character count so short lines don't linger and
    // long lines don't rush past. This is a deterministic, zero-dependency
    // approximation of per-line speech duration.
    const lineWeights = nonEmptyLines.map((l) => Math.max(1, l.trim().length));
    const totalWeight = lineWeights.reduce((a, b) => a + b, 0);
    // Frames allocated to each line (proportional to weight, minimum 2 frames).
    const lineAllocations = lineWeights.map((w) =>
      Math.max(2, Math.round((w / totalWeight) * totalWindow))
    );
    // Cumulative start frame for each non-empty line.
    const lineStarts: number[] = [];
    let accumFrame = textStart;
    for (const alloc of lineAllocations) {
      lineStarts.push(accumFrame);
      accumFrame += alloc;
    }

    // Debug: log once at the start of this page's reveal window.
    if (frame === textStart) {
      console.log(
        `[AnimatedP] line-reveal: ${lineCount} lines window=[${textStart}–${textEnd}]` +
        ` | ${nonEmptyLines
          .map((_, i) => `L${i + 1}:${lineWeights[i]}ch→${lineAllocations[i]}fr`)
          .join(" ")}`
      );
    }

    // Gradient soft-edge width (% of line width).
    const SOFT_EDGE = 10;

    let nonEmptyIdx = 0;
    return (
      <p style={style}>
        {rawLines.map((line, i) => {
          if (line.trim().length === 0) {
            // Preserve empty lines as spacers (stanza breaks, paragraph gaps).
            return <span key={i} style={{ display: "block", height: "0.5em" }} />;
          }
          const idx = nonEmptyIdx++;
          const lineRevealStart = lineStarts[idx];
          // Sweep occupies 85% of the line's allocation; the rest is "hold" before
          // the next line begins. This matches natural speech where the speaker
          // finishes articulating the line slightly before moving on.
          const sweepFrames = Math.max(2, Math.round(lineAllocations[idx] * 0.85));
          const lineRevealEnd = lineRevealStart + sweepFrames;
          const lineProgress = interpolate(
            frame,
            [lineRevealStart, lineRevealEnd],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          // RTL sweep: linear-gradient(to left) has position 0% on the physical right.
          // At progress=0: mask is entirely transparent (nothing visible).
          // As progress increases, the visible region expands from right toward left.
          const revealPct = lineProgress * (100 + SOFT_EDGE * 2);
          const mask = `linear-gradient(to left, black ${revealPct - SOFT_EDGE}%, transparent ${revealPct}%)`;
          return (
            <span
              key={i}
              style={{
                display: "block",
                maskImage: mask,
                WebkitMaskImage: mask,
              }}
            >
              {line}
            </span>
          );
        })}
      </p>
    );
  }

  // ── Word-by-word fade-in (legacy default) ────────────────────────────────────
  // Split into alternating [word, whitespace, word, …] tokens.
  const tokens = children.split(/(\s+)/);

  // Count real words (non-whitespace tokens) for timing calculation.
  let wordCount = 0;
  for (const t of tokens) {
    if (t.trim().length > 0) wordCount++;
  }

  // How many words should be fully visible right now (fractional).
  const wordsRevealed = interpolate(
    frame,
    [textStart, textEnd],
    [0, wordCount],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  let wordIdx = 0;

  return (
    <p style={style}>
      {tokens.map((token, i) => {
        if (!token) return null;

        // Whitespace (spaces / newlines) — always visible, preserves layout.
        if (token.trim().length === 0) {
          return <React.Fragment key={i}>{token}</React.Fragment>;
        }

        // Word token — fade in based on its position in the sequence.
        const idx = wordIdx++;
        const wordOpacity = interpolate(
          wordsRevealed,
          [idx, idx + 0.8],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

        return (
          <span key={i} style={{ opacity: wordOpacity }}>
            {token}
          </span>
        );
      })}
    </p>
  );
}

// ── ImageFill — visual source selector ───────────────────────────────────────

/**
 * Visual source for a page slot — exact mirror of AlbumPageView.tsx ImageFill.
 *
 * Crop model (matches preview/editor source of truth):
 *   crop_x / crop_y = image CENTER as a fraction of the container (0.5 = centered)
 *   scale           = image size relative to container (1 = fills container)
 *
 * Formula (same as preview):
 *   width  = scale × 100%
 *   height = scale × 100%
 *   left   = (crop_x − scale/2) × 100%
 *   top    = (crop_y − scale/2) × 100%
 *
 * At default (scale=1, crop=0.5,0.5): width=100%, left=0 → fills container.
 *
 * Priority:
 *   1. Kling-generated page video (PageKlingCtx) — same crop/scale applied
 *   2. Static resolved page image (slot)
 *   3. No image — placeholder gradient
 */
function ImageFill({
  slot,
}: {
  slot: SlotImageData | null;
  kbScale?: number; // kept in signature for call-site compatibility; unused
}) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const timingOverride = React.useContext(PageTimingCtx);
  const klingVideoUrl = React.useContext(PageKlingCtx);
  const isUnifiedSpread = React.useContext(SpreadVideoCtx);

  // ── Unified spread: the visual background is handled by the spread video layer ─
  // Return null so the page container is transparent, letting the full-width spread
  // video show through from behind. Text overlays still render above.
  if (isUnifiedSpread) return null;

  // ── Sequential activation delay ──────────────────────────────────────────
  const delayFrame = Math.round(durationInFrames * (timingOverride?.imageRevealDelayFrac ?? 0));

  // ── Left-page fade-in opacity ─────────────────────────────────────────────
  const fadeOpacity =
    delayFrame > 0
      ? interpolate(frame, [delayFrame, delayFrame + LEFT_FADE_IN_FRAMES], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  if (frame < delayFrame) {
    return <AbsoluteFill style={{ background: BG_CARD }} />;
  }

  // ── Preview-matching crop formula ─────────────────────────────────────────
  // crop_x/crop_y are IMAGE CENTER coords (0.5 = centered), matching the
  // preview's unified crop model. Legacy (0,0) values are treated as (0.5,0.5).
  const rawCropX = slot?.crop_x ?? 0.5;
  const rawCropY = slot?.crop_y ?? 0.5;
  const isLegacyZero = rawCropX === 0 && rawCropY === 0;
  const cropX = isLegacyZero ? 0.5 : rawCropX;
  const cropY = isLegacyZero ? 0.5 : rawCropY;
  const s = Math.max(0.1, slot?.scale ?? 1);

  // Image wrapper position — mirrors (crop_x − s/2) formula from AlbumPageView.tsx
  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    width:  `${s * 100}%`,
    height: `${s * 100}%`,
    left:   `${(cropX - s / 2) * 100}%`,
    top:    `${(cropY - s / 2) * 100}%`,
  };

  // Inset crop — applied as clipPath on the image wrapper (same as preview)
  const it = slot?.cropInsetTop    ?? 0;
  const ir = slot?.cropInsetRight  ?? 0;
  const ib = slot?.cropInsetBottom ?? 0;
  const il = slot?.cropInsetLeft   ?? 0;
  const hasInset = it > 0 || ir > 0 || ib > 0 || il > 0;
  if (hasInset) {
    wrapperStyle.clipPath = `inset(${it * 100}% ${ir * 100}% ${ib * 100}% ${il * 100}%)`;
  }

  // Frame mask — SVG mask applied on the overflow:hidden container (same as preview)
  const maskUrl = slot?.frameStyle ? (FRAME_MASKS[slot.frameStyle] ?? undefined) : undefined;
  const maskStyle: React.CSSProperties | undefined = maskUrl
    ? { maskImage: maskUrl, maskSize: "100% 100%" }
    : undefined;

  // objectFit for STATIC images:
  //   "contain" when no frame mask → full illustration visible, no AR crop.
  //   "cover"   with a frame mask → fills decorative shape completely.
  const imageObjectFit: React.CSSProperties["objectFit"] =
    slot?.frameStyle ? "cover" : "contain";

  // ── Kling video ───────────────────────────────────────────────────────────
  // The Kling video is pre-cropped by prepareCroppedImageForKling() before
  // generation — its content already represents the preview-visible region.
  // Do NOT re-apply wrapperStyle scale/offset here (that would double-crop).
  // The video fills the page frame at 100%×100%; inset crop + mask still apply.
  if (klingVideoUrl) {
    const klingLogFrame = delayFrame > 0 ? delayFrame : 0;
    if (frame === klingLogFrame) {
      console.log(
        `[ImageFill] type=kling-video (pre-cropped)` +
        ` | crop=(${cropX.toFixed(3)},${cropY.toFixed(3)}) scale=${s.toFixed(3)}` +
        ` | frameStyle=${slot?.frameStyle ?? "none"} mask-applied=${maskUrl ? "true" : "false"}` +
        ` | hasInset=${hasInset} delayFrame=${delayFrame}`
      );
    }
    // Fade the original still image back in over the last 15 frames of the Kling clip
    const KLING_END_FADE_FRAMES = 15;
    const klingClipFrames = Math.round(10 * fps);
    const endFadeOpacity = interpolate(
      frame,
      [delayFrame + klingClipFrames - KLING_END_FADE_FRAMES, delayFrame + klingClipFrames],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

    return (
      <>
        <AbsoluteFill style={{ background: BG_CARD }} />
        <AbsoluteFill style={{ overflow: "hidden", opacity: fadeOpacity, ...(maskStyle ?? {}) }}>
          <Sequence from={delayFrame}>
            {/*
             * Kling video: inset is already baked into the pre-cropped input image
             * by prepareCroppedImageForKling(). Do NOT re-apply the inset clip here —
             * that would double-clip and cut into correct content.
             * End-fade static image uses wrapperStyle which already includes the
             * clipPath inset (set above), so it renders correctly without extra wrapping.
             */}
            <AbsoluteFill style={{ overflow: "hidden" }}>
              <OffthreadVideo
                src={klingVideoUrl}
                style={{ width: "100%", height: "100%", objectFit: imageObjectFit }}
              />
              {slot && (
                <div style={{ ...wrapperStyle, overflow: "hidden", opacity: endFadeOpacity }}>
                  <Img
                    src={slot.url}
                    style={{ width: "100%", height: "100%", objectFit: imageObjectFit }}
                  />
                </div>
              )}
            </AbsoluteFill>
          </Sequence>
        </AbsoluteFill>
      </>
    );
  }

  // ── Static image fallback ─────────────────────────────────────────────────
  if (!slot) {
    return (
      <AbsoluteFill
        style={{
          background: "linear-gradient(135deg, #E8E0D0 0%, #C8BCA8 100%)",
          opacity: fadeOpacity,
        }}
      />
    );
  }

  // Debug: log once per render pass.
  const staticLogFrame = delayFrame > 0 ? delayFrame : 0;
  if (frame === staticLogFrame) {
    const previewLeft = `${((cropX - s / 2) * 100).toFixed(1)}%`;
    const previewTop  = `${((cropY - s / 2) * 100).toFixed(1)}%`;
    console.log(
      `[ImageFill] type=image` +
      ` | crop=(${cropX.toFixed(3)},${cropY.toFixed(3)}) scale=${s.toFixed(3)}` +
      ` | preview-anchor: left=${previewLeft} top=${previewTop} size=${(s*100).toFixed(0)}%×${(s*100).toFixed(0)}%` +
      ` | objectFit=${imageObjectFit}` +
      ` | frameStyle=${slot.frameStyle ?? "none"} mask-applied=${maskUrl ? "true" : "false"}` +
      ` | hasInset=${hasInset} delayFrame=${delayFrame}`
    );
  }

  return (
    <>
      <AbsoluteFill style={{ background: BG_CARD }} />
      <AbsoluteFill style={{ overflow: "hidden", opacity: fadeOpacity, ...(maskStyle ?? {}) }}>
        <div style={{ ...wrapperStyle, overflow: "hidden" }}>
          <Img
            src={slot.url}
            style={{ width: "100%", height: "100%", objectFit: imageObjectFit }}
          />
        </div>
      </AbsoluteFill>
    </>
  );
}

// ── Cinematic vignette layer ──────────────────────────────────────────────────

/**
 * Subtle cinematic vignette — darkens edges to draw focus to the illustration.
 * Applied above the image, below text overlays (zIndex 5).
 * Static, no animation. Think of it as a soft "natural lens falloff".
 */
function VignetteLayer() {
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        zIndex: 5,
        background:
          "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 50%, rgba(0,0,0,0.18) 100%)",
      }}
    />
  );
}

// ── Text overlay variants ─────────────────────────────────────────────────────

interface OverlayTextProps {
  text: string;
  textSize: string | null;
  fontSizePx: number | null;
  textAlign: string;
  textX: number | null;
  textY: number | null;
  narrationDurationMs: number | null;
  /**
   * Parallax pixel offset — counter-drift vs Ken Burns zoom.
   * Positive = shift down, negative = shift up.
   * Applied to text overlay containers to create subtle image/text depth separation.
   */
  parallaxPx: number;
}

/** When admin has free-positioned the text, render it at those coordinates. */
function PositionedOverlay({
  text,
  fontSize,
  textAlign,
  textX,
  textY,
  narrationDurationMs,
  parallaxPx = 0,
}: {
  text: string;
  fontSize: number;
  textAlign: string;
  textX: number;
  textY: number;
  narrationDurationMs?: number | null;
  parallaxPx?: number;
}) {
  return (
    <AbsoluteFill
      style={{
        zIndex: 10,
        pointerEvents: "none",
        transform: parallaxPx !== 0 ? `translateY(${parallaxPx}px)` : undefined,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${textX * 100}%`,
          top: `${textY * 100}%`,
          transform: "translate(-50%, -50%)",
          width: "84%",
          textAlign: textAlign as React.CSSProperties["textAlign"],
        }}
      >
        <AnimatedP
          style={{
            fontFamily: ALBUM_FONT,
            fontSize,
            textAlign: textAlign as React.CSSProperties["textAlign"],
            direction: "rtl",
            lineHeight: 1.6,
            whiteSpace: "pre-line",
            textShadow: "0 2px 8px rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,0.8)",
            color: "white",
            margin: 0,
          }}
          narrationDurationMs={narrationDurationMs}
        >
          {text}
        </AnimatedP>
      </div>
    </AbsoluteFill>
  );
}

/** Bottom gradient overlay — default for FULL_IMAGE. */
function TextOverlayBottom({ text, textSize, fontSizePx, textAlign, textX, textY, narrationDurationMs, parallaxPx }: OverlayTextProps) {
  const fontSize = videoFontPx(textSize, fontSizePx);
  const align = textAlign ?? "start";

  if (textX != null && textY != null) {
    return (
      <PositionedOverlay
        text={text}
        fontSize={fontSize}
        textAlign={align}
        textX={textX}
        textY={textY}
        narrationDurationMs={narrationDurationMs}
        parallaxPx={parallaxPx}
      />
    );
  }

  // Bottom overlay: text drifts upward as KB zooms in (negative = up).
  return (
    <AbsoluteFill
      style={{
        zIndex: 10,
        pointerEvents: "none",
        transform: parallaxPx !== 0 ? `translateY(${parallaxPx}px)` : undefined,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.40) 45%, transparent 72%)",
          padding: "120px 80px 56px",
        }}
      >
        <AnimatedP
          style={{
            fontFamily: ALBUM_FONT,
            fontSize,
            textAlign: align as React.CSSProperties["textAlign"],
            direction: "rtl",
            lineHeight: 1.6,
            whiteSpace: "pre-line",
            textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            color: "white",
            margin: 0,
          }}
          narrationDurationMs={narrationDurationMs}
        >
          {text}
        </AnimatedP>
      </div>
    </AbsoluteFill>
  );
}

/** Top gradient overlay — for FULL_IMAGE_TEXT_TOP. */
function TextOverlayTop({ text, textSize, fontSizePx, textAlign, textX, textY, narrationDurationMs, parallaxPx }: OverlayTextProps) {
  const fontSize = videoFontPx(textSize, fontSizePx);
  const align = textAlign ?? "start";

  if (textX != null && textY != null) {
    return (
      <PositionedOverlay
        text={text}
        fontSize={fontSize}
        textAlign={align}
        textX={textX}
        textY={textY}
        narrationDurationMs={narrationDurationMs}
        parallaxPx={parallaxPx}
      />
    );
  }

  // Top overlay: text drifts downward as KB zooms in (positive = down).
  return (
    <AbsoluteFill
      style={{
        zIndex: 10,
        pointerEvents: "none",
        transform: parallaxPx !== 0 ? `translateY(${-parallaxPx}px)` : undefined,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.40) 45%, transparent 72%)",
          padding: "56px 80px 120px",
        }}
      >
        <AnimatedP
          style={{
            fontFamily: ALBUM_FONT,
            fontSize,
            textAlign: align as React.CSSProperties["textAlign"],
            direction: "rtl",
            lineHeight: 1.6,
            whiteSpace: "pre-line",
            textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            color: "white",
            margin: 0,
          }}
          narrationDurationMs={narrationDurationMs}
        >
          {text}
        </AnimatedP>
      </div>
    </AbsoluteFill>
  );
}

/** Frosted-glass pill — for FULL_IMAGE_TEXT_CENTER. */
function TextOverlayCenter({ text, textSize, fontSizePx, textAlign, textX, textY, narrationDurationMs, parallaxPx }: OverlayTextProps) {
  const fontSize = videoFontPx(textSize, fontSizePx);
  const align = textAlign ?? "start";

  if (textX != null && textY != null) {
    return (
      <PositionedOverlay
        text={text}
        fontSize={fontSize}
        textAlign={align}
        textX={textX}
        textY={textY}
        narrationDurationMs={narrationDurationMs}
        parallaxPx={parallaxPx}
      />
    );
  }

  // Center overlay: subtle upward drift (same direction as bottom overlay).
  return (
    <AbsoluteFill
      style={{
        zIndex: 10,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px",
        transform: parallaxPx !== 0 ? `translateY(${parallaxPx}px)` : undefined,
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(6px)",
          borderRadius: "16px",
          padding: "48px 72px",
          maxWidth: "86%",
        }}
      >
        <AnimatedP
          style={{
            fontFamily: ALBUM_FONT,
            fontSize,
            textAlign: align as React.CSSProperties["textAlign"],
            direction: "rtl",
            lineHeight: 1.6,
            whiteSpace: "pre-line",
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            color: "white",
            margin: 0,
          }}
          narrationDurationMs={narrationDurationMs}
        >
          {text}
        </AnimatedP>
      </div>
    </AbsoluteFill>
  );
}

/** Text block for split layouts (image+text). Light background, dark text. */
function SplitTextBlock({
  text,
  textSize,
  fontSizePx,
  textAlign,
  narrationDurationMs,
}: {
  text: string | null;
  textSize: string | null;
  fontSizePx: number | null;
  textAlign: string;
  narrationDurationMs?: number | null;
}) {
  if (!text) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        padding: "40px 60px",
        background: BG_CARD,
        boxSizing: "border-box",
      }}
    >
      <AnimatedP
        style={{
          fontFamily: ALBUM_FONT,
          fontSize: videoFontPx(textSize, fontSizePx),
          textAlign: (textAlign ?? "start") as React.CSSProperties["textAlign"],
          direction: "rtl",
          lineHeight: 1.7,
          whiteSpace: "pre-line",
          color: TEXT_DARK,
          margin: 0,
          maxWidth: "90%",
        }}
        narrationDurationMs={narrationDurationMs}
      >
        {text}
      </AnimatedP>
    </div>
  );
}

/** TEXT_ONLY layout — centred text on parchment background. */
function TextOnlyLayout({
  text,
  textSize,
  fontSizePx,
  textAlign,
  narrationDurationMs,
}: {
  text: string | null;
  textSize: string | null;
  fontSizePx: number | null;
  textAlign: string;
  narrationDurationMs?: number | null;
}) {
  const fontSize = fontSizePx
    ? Math.round(fontSizePx * FONT_SCALE)
    : videoFontPx(textSize ?? "lg", null);

  return (
    <AbsoluteFill
      style={{
        background: BG_CARD,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 120px",
      }}
    >
      {text ? (
        <AnimatedP
          style={{
            fontFamily: ALBUM_FONT,
            fontSize,
            textAlign: (textAlign ?? "center") as React.CSSProperties["textAlign"],
            direction: "rtl",
            lineHeight: 1.8,
            whiteSpace: "pre-line",
            color: TEXT_DARK,
            margin: 0,
            maxWidth: "90%",
          }}
          narrationDurationMs={narrationDurationMs}
        >
          {text}
        </AnimatedP>
      ) : null}
    </AbsoluteFill>
  );
}

// ── Special page layouts (cover, dedication, back_cover) ─────────────────────
//
// These mirror the AlbumPageView.tsx CoverPage / DedicationPage / BackCoverPage
// components but use inline styles instead of Tailwind (not available in the
// Remotion bundle context).
//
// Primary accent colour: #8F9F7A (olive green, matches design system)
// Ornament: ✦ unicode character (matches AlbumPageView.Ornament)

const PRIMARY = "#8F9F7A";

/** Cover layout — album title page. Matches AlbumPageView.CoverPage. */
function CoverLayout({
  slot1,
  textContent,
  personName,
  kbScale,
  narrationDurationMs,
  textParallaxPx,
}: {
  slot1: SlotImageData | null;
  textContent: string | null;
  personName: string | null;
  kbScale: number;
  narrationDurationMs: number | null;
  textParallaxPx: number;
}) {
  const hasImage = slot1 !== null;

  return (
    <>
      {/* Background image with Ken Burns + 3-phase reveal */}
      <ImageFill slot={slot1} kbScale={kbScale} />
      {/* Gradient overlay — diagonal, matches album preview */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(135deg, rgba(143,159,122,0.10) 0%, transparent 50%, rgba(143,159,122,0.18) 100%)",
          pointerEvents: "none",
        }}
      />
      {/* Content box — centred */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 10,
          transform: textParallaxPx !== 0 ? `translateY(${textParallaxPx}px)` : undefined,
        }}
      >
        <div
          style={{
            border: "2px solid rgba(143,159,122,0.22)",
            borderRadius: 24,
            padding: "64px 72px",
            width: "80%",
            background: hasImage ? "rgba(0,0,0,0.40)" : "transparent",
            backdropFilter: hasImage ? "blur(2px)" : undefined,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Top ornament */}
          <div
            style={{
              color: hasImage ? "rgba(255,255,255,0.55)" : "rgba(143,159,122,0.55)",
              fontSize: 54,
              marginBottom: 36,
              lineHeight: 1,
            }}
          >
            ✦
          </div>
          {/* "סיפור חיים בחרוזים" subtitle */}
          <p
            style={{
              color: hasImage ? "rgba(255,255,255,0.72)" : "rgba(143,159,122,0.72)",
              fontSize: 26,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              fontFamily: "sans-serif",
              margin: 0,
              marginBottom: 28,
            }}
          >
            סיפור חיים בחרוזים
          </p>
          {/* Person name (large heading) */}
          {personName && (
            <h1
              style={{
                color: hasImage ? "white" : TEXT_DARK,
                fontSize: 88,
                fontWeight: 600,
                lineHeight: 1.2,
                margin: 0,
                fontFamily: "sans-serif",
              }}
            >
              {personName}
            </h1>
          )}
          {/* Optional subtitle text (page.text_content) with word-by-word reveal */}
          {textContent && (
            <AnimatedP
              style={{
                fontFamily: ALBUM_FONT,
                fontSize: 44,
                color: hasImage ? "rgba(255,255,255,0.82)" : "#5A5240",
                fontStyle: "italic",
                lineHeight: 1.6,
                direction: "rtl",
                whiteSpace: "pre-line",
                marginTop: 36,
              }}
              narrationDurationMs={narrationDurationMs}
            >
              {textContent}
            </AnimatedP>
          )}
          {/* Bottom ornament */}
          <div
            style={{
              color: hasImage ? "rgba(255,255,255,0.55)" : "rgba(143,159,122,0.55)",
              fontSize: 40,
              marginTop: 36,
              lineHeight: 1,
            }}
          >
            ✦
          </div>
        </div>
      </AbsoluteFill>
    </>
  );
}

/** Dedication layout — centred poem with ornaments. Matches AlbumPageView.DedicationPage. */
function DedicationLayout({
  slot1,
  textContent,
  kbScale,
  narrationDurationMs,
  textParallaxPx,
}: {
  slot1: SlotImageData | null;
  textContent: string | null;
  kbScale: number;
  narrationDurationMs: number | null;
  textParallaxPx: number;
}) {
  const hasImage = slot1 !== null;

  return (
    <>
      <ImageFill slot={slot1} kbScale={kbScale} />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 10,
          padding: "80px",
          textAlign: "center",
          transform: textParallaxPx !== 0 ? `translateY(${textParallaxPx}px)` : undefined,
        }}
      >
        {/* Top ornament */}
        <div
          style={{
            color: hasImage ? "rgba(255,255,255,0.55)" : "rgba(143,159,122,0.55)",
            fontSize: 50,
            marginBottom: 48,
            lineHeight: 1,
          }}
        >
          ✦
        </div>
        {/* Dedication text */}
        {textContent ? (
          <AnimatedP
            style={{
              fontFamily: ALBUM_FONT,
              fontSize: 45,
              color: hasImage ? "rgba(255,255,255,0.92)" : "#5A5240",
              fontStyle: "italic",
              lineHeight: 1.75,
              direction: "rtl",
              whiteSpace: "pre-line",
              maxWidth: "80%",
              textShadow: hasImage ? "0 1px 3px rgba(0,0,0,0.7)" : undefined,
            }}
            narrationDurationMs={narrationDurationMs}
          >
            {textContent}
          </AnimatedP>
        ) : null}
        {/* Bottom ornament */}
        <div
          style={{
            color: hasImage ? "rgba(255,255,255,0.55)" : "rgba(143,159,122,0.55)",
            fontSize: 50,
            marginTop: 48,
            lineHeight: 1,
          }}
        >
          ✦
        </div>
      </AbsoluteFill>
    </>
  );
}

/** Back cover layout — Vitae Studio branding. Matches AlbumPageView.BackCoverPage. */
function BackCoverLayout({
  slot1,
  textContent,
  kbScale,
  narrationDurationMs,
  textParallaxPx,
}: {
  slot1: SlotImageData | null;
  textContent: string | null;
  kbScale: number;
  narrationDurationMs: number | null;
  textParallaxPx: number;
}) {
  const hasImage = slot1 !== null;

  return (
    <>
      {/* Background image */}
      <ImageFill slot={slot1} kbScale={kbScale} />
      {/* Gradient — reversed diagonal vs cover */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(225deg, rgba(143,159,122,0.10) 0%, transparent 50%, rgba(143,159,122,0.16) 100%)",
          pointerEvents: "none",
        }}
      />
      {/* Content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 10,
          padding: "80px",
          textAlign: "center",
          transform: textParallaxPx !== 0 ? `translateY(${textParallaxPx}px)` : undefined,
        }}
      >
        {/* Top ornament */}
        <div
          style={{
            color: hasImage ? "rgba(255,255,255,0.55)" : "rgba(143,159,122,0.55)",
            fontSize: 54,
            marginBottom: 44,
            lineHeight: 1,
          }}
        >
          ✦
        </div>
        {/* Optional back-cover poem / closing text */}
        {textContent && (
          <AnimatedP
            style={{
              fontFamily: ALBUM_FONT,
              fontSize: 45,
              color: hasImage ? "rgba(255,255,255,0.90)" : "#5A5240",
              fontStyle: "italic",
              lineHeight: 1.7,
              direction: "rtl",
              whiteSpace: "pre-line",
              maxWidth: "80%",
              textShadow: hasImage ? "0 1px 3px rgba(0,0,0,0.7)" : undefined,
            }}
            narrationDurationMs={narrationDurationMs}
          >
            {textContent}
          </AnimatedP>
        )}
        {/* Vitae Studio branding — matches AlbumPageView.BackCoverPage */}
        <div
          style={{
            marginTop: 56,
            paddingTop: 36,
            borderTop: "1px solid rgba(143,159,122,0.22)",
            width: 200,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              fontSize: 36,
              fontWeight: 600,
              letterSpacing: "0.05em",
              color: hasImage ? "white" : PRIMARY,
              fontFamily: "sans-serif",
            }}
          >
            Vitae Studio
          </span>
          <span
            style={{
              fontSize: 22,
              color: hasImage ? "rgba(255,255,255,0.70)" : "rgba(143,159,122,0.70)",
              fontFamily: "sans-serif",
            }}
          >
            סיפור חיים בחרוזים
          </span>
        </div>
      </AbsoluteFill>
    </>
  );
}

// ── PageContent — renders a single page's layout ─────────────────────────────

interface PageContentProps extends ScenePageData {
  kbScale: number;
  narrationDurationMs: number | null;
  textParallaxPx: number;
  /** Page type — "cover", "back_cover", "dedication", or null for content pages. */
  pageType?: string | null;
  /** Person name from the order — used only for cover pages. */
  personName?: string | null;
}

/**
 * Renders a single album page's content.
 *
 * For special page types (cover, back_cover, dedication) it uses dedicated
 * layout components that match AlbumPageView.tsx exactly.
 *
 * For content pages it dispatches on layoutType (9 layout variants).
 */
function PageContent({
  slot1, slot2, layoutType: lt, textContent, textSize, fontSizePx,
  textAlign: ta, textX, textY, kbScale, narrationDurationMs, textParallaxPx,
  pageType, personName,
}: PageContentProps) {
  // ── Special page types — dedicated layouts ─────────────────────────────
  if (pageType === "cover") {
    return (
      <CoverLayout
        slot1={slot1}
        textContent={textContent}
        personName={personName ?? null}
        kbScale={kbScale}
        narrationDurationMs={narrationDurationMs}
        textParallaxPx={textParallaxPx}
      />
    );
  }

  if (pageType === "dedication") {
    return (
      <DedicationLayout
        slot1={slot1}
        textContent={textContent}
        kbScale={kbScale}
        narrationDurationMs={narrationDurationMs}
        textParallaxPx={textParallaxPx}
      />
    );
  }

  if (pageType === "back_cover") {
    return (
      <BackCoverLayout
        slot1={slot1}
        textContent={textContent}
        kbScale={kbScale}
        narrationDurationMs={narrationDurationMs}
        textParallaxPx={textParallaxPx}
      />
    );
  }

  // ── Content pages — dispatch on layoutType ─────────────────────────────
  const hasText = Boolean(textContent);
  const align = ta ?? "start";
  const overlayProps: OverlayTextProps = {
    text: textContent ?? "",
    textSize,
    fontSizePx,
    textAlign: align,
    textX: textX ?? null,
    textY: textY ?? null,
    narrationDurationMs,
    parallaxPx: textParallaxPx,
  };

  const layout = lt ?? "FULL_IMAGE";

  switch (layout) {
    case "TEXT_ONLY":
      return (
        <TextOnlyLayout
          text={textContent}
          textSize={textSize}
          fontSizePx={fontSizePx}
          textAlign={align}
          narrationDurationMs={narrationDurationMs}
        />
      );

    case "IMAGE_TOP_TEXT_BOTTOM":
      return (
        <AbsoluteFill style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ position: "relative", height: "60%", overflow: "hidden" }}>
            <ImageFill slot={slot1} kbScale={kbScale} />
          </div>
          <div style={{ height: "40%", overflow: "hidden" }}>
            <SplitTextBlock
              text={textContent}
              textSize={textSize}
              fontSizePx={fontSizePx}
              textAlign={align}
              narrationDurationMs={narrationDurationMs}
            />
          </div>
        </AbsoluteFill>
      );

    case "TEXT_TOP_IMAGE_BOTTOM":
      return (
        <AbsoluteFill style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ height: "40%", overflow: "hidden" }}>
            <SplitTextBlock
              text={textContent}
              textSize={textSize}
              fontSizePx={fontSizePx}
              textAlign={align}
              narrationDurationMs={narrationDurationMs}
            />
          </div>
          <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
            <ImageFill slot={slot1} kbScale={kbScale} />
          </div>
        </AbsoluteFill>
      );

    case "IMAGE_LEFT_TEXT_RIGHT":
      return (
        <AbsoluteFill style={{ display: "flex", flexDirection: "row" }}>
          <div style={{ position: "relative", width: "55%", overflow: "hidden" }}>
            <ImageFill slot={slot1} kbScale={kbScale} />
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <SplitTextBlock
              text={textContent}
              textSize={textSize}
              fontSizePx={fontSizePx}
              textAlign={align}
              narrationDurationMs={narrationDurationMs}
            />
          </div>
        </AbsoluteFill>
      );

    case "IMAGE_RIGHT_TEXT_LEFT":
      return (
        <AbsoluteFill style={{ display: "flex", flexDirection: "row" }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <SplitTextBlock
              text={textContent}
              textSize={textSize}
              fontSizePx={fontSizePx}
              textAlign={align}
              narrationDurationMs={narrationDurationMs}
            />
          </div>
          <div style={{ position: "relative", width: "55%", overflow: "hidden" }}>
            <ImageFill slot={slot1} kbScale={kbScale} />
          </div>
        </AbsoluteFill>
      );

    case "TWO_IMAGES":
      return (
        <AbsoluteFill style={{ display: "flex", flexDirection: "row" }}>
          <div style={{ position: "relative", width: "50%", overflow: "hidden" }}>
            <ImageFill slot={slot1} kbScale={kbScale} />
          </div>
          <div style={{ position: "relative", width: "50%", overflow: "hidden" }}>
            <ImageFill slot={slot2} kbScale={kbScale} />
          </div>
          {hasText && textContent && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.55)",
                padding: "20px 60px",
                textAlign: align as React.CSSProperties["textAlign"],
                zIndex: 10,
              }}
            >
              <AnimatedP
                style={{
                  fontFamily: ALBUM_FONT,
                  fontSize: videoFontPx(textSize, fontSizePx),
                  direction: "rtl",
                  color: "white",
                  textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                  margin: 0,
                  whiteSpace: "pre-line",
                }}
                narrationDurationMs={narrationDurationMs}
              >
                {textContent}
              </AnimatedP>
            </div>
          )}
        </AbsoluteFill>
      );

    case "FULL_IMAGE_TEXT_TOP":
      return (
        <>
          <ImageFill slot={slot1} kbScale={kbScale} />
          <VignetteLayer />
          {hasText && <TextOverlayTop {...overlayProps} />}
        </>
      );

    case "FULL_IMAGE_TEXT_CENTER":
      return (
        <>
          <ImageFill slot={slot1} kbScale={kbScale} />
          <VignetteLayer />
          {hasText && <TextOverlayCenter {...overlayProps} />}
        </>
      );

    case "FULL_IMAGE":
    default:
      return (
        <>
          <ImageFill slot={slot1} kbScale={kbScale} />
          <VignetteLayer />
          {hasText && <TextOverlayBottom {...overlayProps} />}
        </>
      );
  }
}

// ── Main composition ──────────────────────────────────────────────────────────

/**
 * Remotion composition for a single film scene.
 *
 * Renders either a single page (cover/dedication/back_cover) or a 2-page
 * open-book spread (normal content scenes). Spread scenes show both pages
 * side by side, matching the album preview's open-book layout.
 *
 * Layout system (9 types) mirrors AlbumPageView.tsx exactly:
 *   - Same split ratios, ImageFill crop model, text overlay variants
 *
 * Animation effects (applied to both single-page and spread scenes):
 *   - Image reveal: 3-phase (outline sketch → color fill → stable original)
 *   - Text reveal: word-by-word fade-in synced to narration duration when available
 *   - Ken Burns: subtle 5% zoom over full scene duration
 *   - Fade in/out via opacity interpolation
 */
export function SceneComposition({
  slot1,
  slot2,
  layoutType,
  textContent,
  textSize,
  fontSizePx,
  textAlign,
  textX,
  textY,
  secondPage,
  motionPreset,
  transitionIn,
  transitionOut,
  narrationDurationMs,
  pageType,
  personName,
  klingVideoUrl,
  narrationUrl,
  spreadVideoUrl,
}: SceneCompositionProps) {
  useAlbumFont();

  const frame = useCurrentFrame();
  const { durationInFrames, fps, width, height } = useVideoConfig();

  // ── Fade envelope ───────────────────────────────────────────────────────────
  const fadeInOpacity =
    transitionIn === "fade"
      ? interpolate(frame, [0, FADE_FRAMES], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const fadeOutStart = Math.max(0, durationInFrames - FADE_FRAMES);
  const fadeOutOpacity =
    transitionOut === "fade"
      ? interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const opacity = Math.min(fadeInOpacity, fadeOutOpacity);

  // ── Storybook slide-in ───────────────────────────────────────────────────────
  const slideInTranslateY =
    transitionIn === "fade"
      ? interpolate(frame, [0, SLIDE_IN_FRAMES], [SLIDE_IN_PX, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;

  // ── Ken Burns ───────────────────────────────────────────────────────────────
  const kbProgress = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;
  const kbScale =
    motionPreset === "ken_burns"
      ? interpolate(kbProgress, [0, 1], [1.0, KB_ZOOM_END])
      : 1;

  // ── Text parallax ────────────────────────────────────────────────────────────
  const textParallaxPx =
    motionPreset === "ken_burns"
      ? interpolate(kbProgress, [0, 1], [0, -TEXT_PARALLAX_PX])
      : 0;

  // ── Content ─────────────────────────────────────────────────────────────────

  const slideTransform =
    slideInTranslateY !== 0
      ? `translateY(${slideInTranslateY}px)`
      : undefined;

  // Spread mode: two pages side by side (open-book view)
  if (secondPage) {
    // Each page is a square. Two squares side by side = 2:1 aspect ratio.
    // Fit within the video frame (typically 1920×1080 = 16:9).
    const pageSize = Math.min(height, Math.floor(width / 2));
    const topMargin = Math.floor((height - pageSize) / 2);
    const leftMargin = Math.floor((width - pageSize * 2) / 2);

    // ── Spread timing coordination ────────────────────────────────────────
    //
    // The spread is ONE unified scene. Both pages share a single narration
    // audio track (right page text spoken first, then left page text).
    //
    // TIMING MODEL:
    //
    //   ┌── narration window ─────────────────────────────┐
    //   │  right page segment  │  left page segment       │
    //   │  (words ∝ word count)│  (words ∝ word count)    │
    //   ├──────────────────────┼──────────────────────────┤
    //   0.15s                                   narrationEnd
    //   offset                                              │
    //                                                       ▼
    //   ┌── scene timeline ───────────────────────────────────────────┐
    //   │ narration │ breathing pause │ xfade │
    //   │ (audio)   │ (still image)   │ (page turn)│
    //   └─────────────────────────────────────────────────────────────┘
    //
    // Right page: text reveals during the first segment, image starts immediately
    // Left page:  text reveals during the second segment, image starts with delay
    //
    // After narration ends, the scene continues with a visible still pause
    // (BREATHING_PAUSE_MS from compute-scene-duration). The assembly's xfade
    // transition starts near the end, creating the "page turn" feel.
    //
    // No intra-spread pause: left page text begins immediately after right page
    // text finishes. Breathing pauses are BETWEEN scenes, not inside spreads.

    const rightWords = countWords(textContent);
    const leftWords = countWords(secondPage.textContent);
    const totalWords = rightWords + leftWords;

    // Determine the overall text reveal window for this scene.
    // This window spans the full narration duration, split between pages
    // proportional to word count (uniform speech rate assumption).
    let windowStart: number;
    let windowEnd: number;

    if (narrationDurationMs != null && narrationDurationMs > 0) {
      // Narration-synced: text reveal spans the full narration audio.
      // Fixed 0.15s offset keeps text ~0.15s behind audio start.
      windowStart = Math.round(NARRATION_START_OFFSET_SEC * fps);
      const narrationFrames = Math.round((narrationDurationMs / 1000) * fps);
      windowEnd = Math.min(
        windowStart + narrationFrames,
        durationInFrames - FADE_FRAMES
      );
    } else {
      // Visual-only fallback (no narration audio available).
      windowStart = Math.round(durationInFrames * TEXT_REVEAL_START_FRAC);
      windowEnd = Math.round(durationInFrames * TEXT_REVEAL_END_FRAC);
    }

    // Split narration window between right page and left page.
    // Each page gets time proportional to its word count.
    // No gap between segments — the spread flows as one continuous narration.
    const availableFrames = windowEnd - windowStart;
    const rightFrac = totalWords > 0 ? rightWords / totalWords : 0.5;
    const rightFrames = Math.max(1, Math.round(availableFrames * rightFrac));

    // Right page segment: [windowStart, windowStart + rightFrames]
    const rightTextStart = windowStart;
    const rightTextEnd = rightTextStart + rightFrames;
    // Left page segment: [rightTextEnd, windowEnd]
    const leftTextStart = rightTextEnd;
    const leftTextEnd = windowEnd;

    // ── Debug log (frame 0 = once per scene render pass) ────────────────────
    if (frame === 0) {
      const rightMs = Math.round(((rightTextEnd - rightTextStart) / fps) * 1000);
      const leftMs  = Math.round(((leftTextEnd  - leftTextStart)  / fps) * 1000);
      const rightLineCount = (textContent ?? "").split("\n").filter((l) => l.trim().length > 0).length;
      const leftLineCount  = (secondPage.textContent ?? "").split("\n").filter((l) => l.trim().length > 0).length;
      console.log(
        `[SceneComposition] spread-timing` +
        ` | narration=${narrationDurationMs != null ? narrationDurationMs + "ms" : "none"}` +
        ` | right: ${rightWords}w ${rightLineCount}L → [${rightTextStart}–${rightTextEnd}] (${rightMs}ms)` +
        ` | left: ${leftWords}w ${leftLineCount}L → [${leftTextStart}–${leftTextEnd}] (${leftMs}ms)`
      );
    }

    // Left-image delay: start the sketch reveal LEFT_IMAGE_PREROLL_SEC before
    // the left text begins — so the illustration is already "drawing" when the
    // narrator switches pages. This creates a hard right-then-left boundary:
    // left page image never starts while right page narration is still running.
    //
    // Minimum: leftImagePrerollFrames (= LEFT_IMAGE_PREROLL_SEC) ensures the left
    // page never activates at frame 0 even when the right page has no text
    // (rightWords = 0 → leftTextStart is tiny → raw offset goes negative, old
    // Math.max(0,...) clamped to 0 causing both pages to activate simultaneously).
    const leftImagePrerollFrames = Math.round(fps * LEFT_IMAGE_PREROLL_SEC);
    const leftImageStartFrame    = Math.max(leftImagePrerollFrames, leftTextStart - leftImagePrerollFrames);
    const leftImageDelayFrac     = leftImageStartFrame / durationInFrames;

    // ── Geometry + fade-in debug log (frame 0 only) ─────────────────────────
    if (frame === 0) {
      const fmtSlot = (s: SlotImageData | null) =>
        s ? `crop(${s.crop_x.toFixed(2)},${s.crop_y.toFixed(2)}) scale=${s.scale.toFixed(2)}` : "none";
      console.log(
        `[SceneComposition] page-geometry` +
        ` | pageSize=${pageSize}px` +
        ` | right: layout=${layoutType} slot1=${fmtSlot(slot1)}` +
        ` | left: layout=${secondPage.layoutType} slot1=${fmtSlot(secondPage.slot1)}` +
        ` | left-fade: activatesAtFrame=${leftImageStartFrame} fadeInFrames=${LEFT_FADE_IN_FRAMES}`
      );
    }

    const rightTiming: PageTimingOverride = {
      textStartFrame:      rightTextStart,
      textEndFrame:        rightTextEnd,
      imageRevealDelayFrac: 0,
      revealMode:          "line",
    };

    const leftTiming: PageTimingOverride = {
      textStartFrame:      leftTextStart,
      textEndFrame:        leftTextEnd,
      imageRevealDelayFrac: leftImageDelayFrac,
      revealMode:          "line",
    };

    return (
      <AbsoluteFill style={{ backgroundColor: "#1a1a1a", opacity }}>
        {/* Narration audio — plays from frame 0, synced to text reveal timing */}
        {narrationUrl && <Audio src={narrationUrl} />}
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            transform: slideTransform,
          }}
        >
          {/*
           * ── Unified spread video layer ─────────────────────────────────────
           * When spreadVideoUrl is set, render ONE Kling video spanning both pages.
           * It sits at z-index 0, behind both page containers (which have no
           * explicit background), so text overlays inside the containers render on top.
           * Page containers are transparent — their ImageFill returns null when
           * SpreadVideoCtx is true, letting this layer show through.
           */}
          {spreadVideoUrl && (
            <div
              style={{
                position: "absolute",
                left: leftMargin,
                top: topMargin,
                width: pageSize * 2,
                height: pageSize,
                overflow: "hidden",
                zIndex: 0,
              }}
            >
              <OffthreadVideo
                src={spreadVideoUrl}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          )}

          {/* Left page (second page — higher page number in RTL spread) */}
          <div
            style={{
              position: "absolute",
              left: leftMargin,
              top: topMargin,
              width: pageSize,
              height: pageSize,
              overflow: "hidden",
            }}
          >
            {/*
             * SpreadVideoCtx.Provider: when the spread video is active, ImageFill
             * inside PageContent returns null so the page is transparent and the
             * spread video layer behind shows through. Text overlays render normally.
             */}
            <SpreadVideoCtx.Provider value={Boolean(spreadVideoUrl)}>
              <PageKlingCtx.Provider value={spreadVideoUrl ? null : (secondPage.klingVideoUrl ?? null)}>
                <PageTimingCtx.Provider value={leftTiming}>
                  <PageContent
                    {...secondPage}
                    kbScale={kbScale}
                    narrationDurationMs={narrationDurationMs}
                    textParallaxPx={textParallaxPx}
                  />
                </PageTimingCtx.Provider>
              </PageKlingCtx.Provider>
            </SpreadVideoCtx.Provider>
          </div>

          {/* Right page (primary page — lower page number, read first in Hebrew) */}
          <div
            style={{
              position: "absolute",
              left: leftMargin + pageSize,
              top: topMargin,
              width: pageSize,
              height: pageSize,
              overflow: "hidden",
            }}
          >
            <SpreadVideoCtx.Provider value={Boolean(spreadVideoUrl)}>
              <PageKlingCtx.Provider value={spreadVideoUrl ? null : (klingVideoUrl ?? null)}>
                <PageTimingCtx.Provider value={rightTiming}>
                  <PageContent
                    slot1={slot1}
                    slot2={slot2}
                    layoutType={layoutType}
                    textContent={textContent}
                    textSize={textSize}
                    fontSizePx={fontSizePx}
                    textAlign={textAlign}
                    textX={textX}
                    textY={textY}
                    kbScale={kbScale}
                    narrationDurationMs={narrationDurationMs}
                    textParallaxPx={textParallaxPx}
                  />
                </PageTimingCtx.Provider>
              </PageKlingCtx.Provider>
            </SpreadVideoCtx.Provider>
          </div>

          {/* Spine shadow between pages — mimics open-book binding */}
          <div
            style={{
              position: "absolute",
              left: leftMargin + pageSize - 1,
              top: topMargin,
              width: 3,
              height: pageSize,
              background:
                "linear-gradient(to right, rgba(0,0,0,0.15), rgba(0,0,0,0.06), rgba(0,0,0,0.15))",
              zIndex: 20,
              pointerEvents: "none",
            }}
          />
        </div>
      </AbsoluteFill>
    );
  }

  // Single-page mode (cover, dedication, back_cover, or odd trailing page).
  // Render as a centered square matching the album's square page aspect ratio,
  // not stretched to 16:9. This ensures cover/dedication scenes look faithful
  // to the actual album — a square page centered on a dark background.
  const singlePageSize = Math.min(height, width);
  const singleTopMargin = Math.floor((height - singlePageSize) / 2);
  const singleLeftMargin = Math.floor((width - singlePageSize) / 2);

  return (
    <AbsoluteFill style={{ backgroundColor: "#1a1a1a", opacity }}>
      {/* Narration audio — plays from frame 0, synced to text reveal timing */}
      {narrationUrl && <Audio src={narrationUrl} />}
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          transform: slideTransform,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: singleLeftMargin,
            top: singleTopMargin,
            width: singlePageSize,
            height: singlePageSize,
            overflow: "hidden",
          }}
        >
          <PageKlingCtx.Provider value={klingVideoUrl ?? null}>
            <PageContent
              slot1={slot1}
              slot2={slot2}
              layoutType={layoutType}
              textContent={textContent}
              textSize={textSize}
              fontSizePx={fontSizePx}
              textAlign={textAlign}
              textX={textX}
              textY={textY}
              kbScale={kbScale}
              narrationDurationMs={narrationDurationMs}
              textParallaxPx={textParallaxPx}
              pageType={pageType}
              personName={personName}
            />
          </PageKlingCtx.Provider>
        </div>
      </div>
    </AbsoluteFill>
  );
}
