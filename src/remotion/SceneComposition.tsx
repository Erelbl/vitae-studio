import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useAlbumFont } from "./album-font";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SlotImageData {
  url: string;
  crop_x: number;
  crop_y: number;
  scale: number;
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

// ── Reveal animation timing ──────────────────────────────────────────────────

/**
 * 3-phase image reveal: outline sketch → color fill → stable.
 *
 * Phase A (0 – PHASE_A_END): "Outline sketch"
 *   High contrast + grayscale produce an edge/pencil look.
 *   A directional mask sweeps in to suggest brush strokes.
 *
 * Phase B (PHASE_A_END – PHASE_B_END): "Color fill"
 *   Contrast eases back to normal, grayscale fades to 0.
 *   Mask continues expanding until full coverage.
 *
 * Phase C (PHASE_B_END – 1.0): "Stable"
 *   All filters removed. Image is pixel-identical to original.
 */
const IMAGE_REVEAL_END_FRAC = 0.55;
/** End of outline sketch phase (fraction of reveal progress 0–1). */
const PHASE_A_END = 0.3;
/** End of color fill phase (fraction of reveal progress 0–1). */
const PHASE_B_END = 0.92;

/** Phase A: high contrast + full grayscale for sketch look. */
const SKETCH_CONTRAST = 2.8;
const SKETCH_BRIGHTNESS = 1.25;
const SKETCH_GRAYSCALE = 1.0;
/** Phase B start: moderate desaturation, easing toward normal. */
const FILL_GRAYSCALE_START = 0.55;

/** Directional mask sweep: right-to-left (Hebrew reading direction). */
const MASK_SWEEP_START_PCT = 105; // starts off-screen right
const MASK_SWEEP_END_PCT = -10;   // ends past left edge
/** Soft radial mask (combined with sweep for organic feel). */
const RADIAL_START_PCT = 30;
const RADIAL_END_PCT = 160;
/** Ken Burns zoom — subtle, premium feel. */
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
 * Ambient luminance breath: very slow ±1.5% brightness oscillation.
 * Applied after the image reveal completes (Phase C only).
 * Creates a gentle sense of life — like candlelight or soft sunlight.
 */
const BREATH_AMPLITUDE = 0.015;

/**
 * Text parallax: counter-drift of text overlays vs Ken Burns image zoom.
 * As the image subtly zooms in, text drifts slightly outward (up for bottom
 * overlays, down for top overlays). Creates a sense of depth between the
 * illustration plane and the text plane. Very subtle (6px max on 1080p).
 */
const TEXT_PARALLAX_PX = 6;

/**
 * Spread timing coordination: left page image reveal starts this fraction
 * of scene duration later than right page. Creates a clear "right page first,
 * left page follows" sequencing — the right page (read first in Hebrew) is
 * well into its reveal before the left page begins.
 *
 * At 0.18, for a 7.5s scene the left page image starts ~1.35s after the right,
 * giving a distinctly staggered feel while both pages still finish within the
 * same scene duration.
 */
const SPREAD_IMAGE_DELAY_FRAC = 0.18;

// NOTE: There is no intra-spread breathing pause. The spread is one unified scene.
// Breathing pauses happen BETWEEN scenes (via scene duration padding + assembly xfade),
// not between the left and right pages of the same spread.

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
  /** Frame at which word-by-word text reveal begins. */
  textStartFrame: number;
  /** Frame at which all words should be fully visible. */
  textEndFrame: number;
  /** Fraction of scene duration to delay the start of image reveal. 0 = no delay. */
  imageRevealDelayFrac: number;
}

const PageTimingCtx = React.createContext<PageTimingOverride | null>(null);

/** Count real words (non-whitespace tokens) in a text string. */
function countWords(text: string | null): number {
  if (!text) return 0;
  return text.split(/\s+/).filter((t) => t.length > 0).length;
}

// ── AnimatedP — word-by-word text reveal ─────────────────────────────────────

/**
 * A `<p>` element whose words fade in one by one, simulating a writing effect.
 *
 * How it works:
 *   1. Split text into tokens (words + whitespace) preserving newlines.
 *   2. Whitespace tokens are always visible so the layout never shifts.
 *   3. Each word gets an opacity driven by Remotion's frame counter.
 *   4. Words overlap slightly (each fades over ~0.8 "word-units") for
 *      a smooth, flowing reveal rather than staccato pops.
 *
 * Narration sync:
 *   When `narrationDurationMs` is provided, text reveal is timed to match
 *   narration pacing — words are distributed across the full narration window
 *   (starting at NARRATION_START_OFFSET_SEC after scene start). This creates
 *   a "words appear as narrator speaks" effect.
 *
 *   When no narration duration is available, falls back to the visual-only
 *   timing (TEXT_REVEAL_START_FRAC to TEXT_REVEAL_END_FRAC).
 *
 * RTL-safe: the `<p>` carries `direction: rtl` from the caller's style,
 * and inline `<span>`s flow naturally in reading order.
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
    // with breathing pauses and word-proportional splits.
    textStart = timingOverride.textStartFrame;
    textEnd = timingOverride.textEndFrame;
  } else if (narrationDurationMs != null && narrationDurationMs > 0) {
    // Single-page narration-synced: words appear across the full narration duration.
    // The fixed offset (NARRATION_START_OFFSET_SEC) keeps text ~0.15s behind audio,
    // matching the perceptual "words appear as narrator speaks" feel.
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

// ── ImageFill with crop model + 3-phase reveal animation ─────────────────────

/**
 * Full-bleed image with the same crop/zoom model as AlbumPageView.ImageFill,
 * plus a 3-phase reveal that simulates the image being illustrated live.
 *
 * Phase A — "Outline sketch" (0 – PHASE_A_END of reveal):
 *   High contrast + full grayscale creates an edge/pencil-art look.
 *   A directional mask sweeps in from the right (Hebrew reading direction)
 *   combined with a tight radial vignette, suggesting brush strokes.
 *
 * Phase B — "Color fill" (PHASE_A_END – PHASE_B_END of reveal):
 *   Contrast eases back to 1.0, grayscale fades to 0 (full color).
 *   Radial mask expands to full coverage. The image "fills in" with color.
 *
 * Phase C — "Stable" (PHASE_B_END – 1.0 of reveal):
 *   All CSS filters removed. The final rendered image is pixel-identical
 *   to the original album illustration. No visual modification remains.
 *
 * Crop model (identical to album preview):
 *   scale ≥ 1  → image rendered at scale × 100% of container
 *   crop_x 0-1 → horizontal pan (0 = left-edge visible, 1 = right-edge visible)
 *   crop_y 0-1 → vertical pan   (0 = top-edge visible,  1 = bottom-edge visible)
 */
function ImageFill({
  slot,
  kbScale = 1,
}: {
  slot: SlotImageData | null;
  kbScale?: number;
}) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Check for per-page timing override (spread coordination).
  const timingOverride = React.useContext(PageTimingCtx);
  const delayFrac = timingOverride?.imageRevealDelayFrac ?? 0;

  if (!slot) {
    return (
      <AbsoluteFill
        style={{
          background: "linear-gradient(135deg, #E8E0D0 0%, #C8BCA8 100%)",
        }}
      />
    );
  }

  const { url, crop_x, crop_y, scale } = slot;
  const s = Math.max(1, scale);

  // Ken Burns progress (0→1 over full scene) — needed for breath timing.
  const kbProgress = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;

  // Overall reveal progress: 0 → 1 over IMAGE_REVEAL_END_FRAC of scene.
  // In spread mode, the left page's reveal starts later (delayFrac > 0),
  // creating a staggered "book opening" feel.
  const revealStart = Math.round(durationInFrames * delayFrac);
  const revealEnd = revealStart + Math.round(durationInFrames * IMAGE_REVEAL_END_FRAC);
  const revealProgress = interpolate(frame, [revealStart, revealEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isRevealed = revealProgress >= 1;

  // ── Phase A: Outline sketch ──────────────────────────────────────────────
  // High contrast + grayscale for a pencil-edge look, fading to moderate.
  const phaseAProgress = interpolate(
    revealProgress, [0, PHASE_A_END], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // ── Phase B: Color fill ──────────────────────────────────────────────────
  // Filters ease from sketch values back to identity (no filter).
  const phaseBProgress = interpolate(
    revealProgress, [PHASE_A_END, PHASE_B_END], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Compute CSS filter values across the 3 phases.
  let filterContrast: number;
  let filterBrightness: number;
  let filterGrayscale: number;

  if (isRevealed) {
    // Phase C: no filters at all — pixel-identical to original.
    filterContrast = 1;
    filterBrightness = 1;
    filterGrayscale = 0;
  } else if (revealProgress <= PHASE_A_END) {
    // Phase A: sketch look easing in, then holding.
    // Ramp up contrast quickly in first 40% of phase A, hold for rest.
    const rampIn = interpolate(phaseAProgress, [0, 0.4], [0, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    });
    filterContrast = interpolate(rampIn, [0, 1], [1.2, SKETCH_CONTRAST]);
    filterBrightness = interpolate(rampIn, [0, 1], [1.0, SKETCH_BRIGHTNESS]);
    filterGrayscale = SKETCH_GRAYSCALE;
  } else {
    // Phase B: ease from sketch → normal.
    filterContrast = interpolate(phaseBProgress, [0, 1], [SKETCH_CONTRAST, 1]);
    filterBrightness = interpolate(phaseBProgress, [0, 1], [SKETCH_BRIGHTNESS, 1]);
    filterGrayscale = interpolate(phaseBProgress, [0, 1], [FILL_GRAYSCALE_START, 0]);
  }

  // ── Mask: directional sweep + radial softness ────────────────────────────
  // Directional: a soft vertical edge sweeping right-to-left.
  const sweepX = isRevealed
    ? MASK_SWEEP_END_PCT
    : interpolate(revealProgress, [0, 0.85], [MASK_SWEEP_START_PCT, MASK_SWEEP_END_PCT], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });

  // Radial: expanding soft ellipse from center.
  const radialSize = isRevealed
    ? RADIAL_END_PCT
    : interpolate(revealProgress, [0, 1], [RADIAL_START_PCT, RADIAL_END_PCT], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });

  // Combine both masks: the visible area is the intersection.
  // Sweep mask: gradient from opaque to transparent at the sweep edge.
  // Radial mask: soft-edged ellipse from center.
  const sweepMask = `linear-gradient(to left, black 0%, black ${Math.max(0, sweepX - 20)}%, transparent ${sweepX}%)`;
  const radialMask = `radial-gradient(ellipse ${radialSize}% ${radialSize}% at 50% 50%, black 50%, transparent 100%)`;

  const combinedMask = isRevealed ? undefined : `${sweepMask}, ${radialMask}`;
  // For intersecting masks, we need maskComposite. But for a painting feel,
  // using the radial as primary mask and the sweep as a secondary layer works
  // well. With default mask-composite (add), the union of both masks is shown,
  // creating an organic, irregular reveal edge.

  // Ambient breath: ±1.5% brightness oscillation — one full cycle per scene.
  // Only active in Phase C (stable) so it doesn't fight the reveal filters.
  // sin-wave gives a smooth, natural feel (like soft sunlight shifting).
  const breathDelta = isRevealed
    ? Math.sin(2 * Math.PI * kbProgress) * BREATH_AMPLITUDE
    : 0;
  const breathBrightness = 1.0 + breathDelta;

  // Build filter string.
  const filterStr = isRevealed
    ? (Math.abs(breathDelta) > 0.001
        ? `brightness(${breathBrightness.toFixed(3)})`
        : undefined)
    : [
        filterContrast !== 1 ? `contrast(${filterContrast.toFixed(2)})` : "",
        filterBrightness !== 1 ? `brightness(${filterBrightness.toFixed(2)})` : "",
        filterGrayscale > 0.01 ? `grayscale(${filterGrayscale.toFixed(2)})` : "",
      ]
        .filter(Boolean)
        .join(" ") || undefined;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* Ken Burns outer wrapper — scales from centre without shifting crop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: kbScale !== 1 ? `scale(${kbScale})` : undefined,
          transformOrigin: "center center",
          filter: filterStr,
          maskImage: combinedMask,
          WebkitMaskImage: combinedMask,
        }}
      >
        <Img
          src={url}
          style={{
            position: "absolute",
            width: `${s * 100}%`,
            height: `${s * 100}%`,
            left: `${-crop_x * (s - 1) * 100}%`,
            top: `${-crop_y * (s - 1) * 100}%`,
            objectFit: "cover",
          }}
        />
      </div>
    </AbsoluteFill>
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

    const rightTiming: PageTimingOverride = {
      textStartFrame: rightTextStart,
      textEndFrame: rightTextEnd,
      imageRevealDelayFrac: 0,
    };

    const leftTiming: PageTimingOverride = {
      textStartFrame: leftTextStart,
      textEndFrame: leftTextEnd,
      imageRevealDelayFrac: SPREAD_IMAGE_DELAY_FRAC,
    };

    return (
      <AbsoluteFill style={{ backgroundColor: "#1a1a1a", opacity }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            transform: slideTransform,
          }}
        >
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
            <PageTimingCtx.Provider value={leftTiming}>
              <PageContent
                {...secondPage}
                kbScale={kbScale}
                narrationDurationMs={narrationDurationMs}
                textParallaxPx={textParallaxPx}
              />
            </PageTimingCtx.Provider>
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
        </div>
      </div>
    </AbsoluteFill>
  );
}
