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
/** Narration typically starts after a brief visual intro. */
const NARRATION_START_OFFSET_FRAC = 0.08;

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
 *   narration pacing — words are distributed across the narration window
 *   (starting at NARRATION_START_OFFSET_FRAC into the scene). This creates
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

  // Determine text reveal window based on narration timing or fallback.
  let textStart: number;
  let textEnd: number;

  if (narrationDurationMs != null && narrationDurationMs > 0) {
    // Narration-synced: words appear across the narration duration.
    // Narration starts after a brief visual intro offset.
    const narrationStartFrame = Math.round(
      durationInFrames * NARRATION_START_OFFSET_FRAC
    );
    const narrationFrames = Math.round((narrationDurationMs / 1000) * fps);
    textStart = narrationStartFrame;
    // End text reveal slightly before narration ends (95%) so all words
    // are visible by the time narration finishes.
    textEnd = Math.min(
      narrationStartFrame + Math.round(narrationFrames * 0.95),
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
  const revealEnd = Math.round(durationInFrames * IMAGE_REVEAL_END_FRAC);
  const revealProgress = interpolate(frame, [0, revealEnd], [0, 1], {
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

// ── Main composition ──────────────────────────────────────────────────────────

/**
 * Remotion composition for a single film scene.
 *
 * Mirrors the album page layout system (AlbumPageView.tsx) exactly:
 *   - Same 9 layout types with identical split ratios
 *   - Same ImageFill crop model (scale / crop_x / crop_y)
 *   - Same text overlay variants (bottom/top/center gradient, frosted glass, split block)
 *
 * Animation effects:
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
  motionPreset,
  transitionIn,
  transitionOut,
  narrationDurationMs,
}: SceneCompositionProps) {
  useAlbumFont();

  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

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
  // The content translates up from slightly below while fading in.
  // Layered with the existing opacity fade, this creates a "page being turned"
  // feel — the scene eases into position rather than simply cross-dissolving.
  // Only active on transitionIn === "fade"; exit is a clean fade only.
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
  // Counter-drift: as the Ken Burns image subtly zooms in, the text overlays
  // drift slightly in the opposite direction (upward for bottom overlays,
  // downward for top overlays — handled per-overlay). This creates a convincing
  // sense that the text sits on a separate "glass plate" above the illustration.
  // Only computed for ken_burns; static preset gets no parallax.
  const textParallaxPx =
    motionPreset === "ken_burns"
      ? interpolate(kbProgress, [0, 1], [0, -TEXT_PARALLAX_PX])
      : 0;

  const hasText = Boolean(textContent);
  const align = textAlign ?? "start";
  const overlayProps: OverlayTextProps = {
    text: textContent ?? "",
    textSize,
    fontSizePx,
    textAlign: align,
    textX: textX ?? null,
    textY: textY ?? null,
    narrationDurationMs: narrationDurationMs ?? null,
    parallaxPx: textParallaxPx,
  };

  // ── Layout ──────────────────────────────────────────────────────────────────
  function renderContent() {
    const layout = layoutType ?? "FULL_IMAGE";

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

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1a1a1a",
        opacity,
      }}
    >
      {/* Inner content wrapper — carries the storybook slide-in translate.
          Clipped so the translateY never reveals the dark canvas background. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          transform:
            slideInTranslateY !== 0
              ? `translateY(${slideInTranslateY}px)`
              : undefined,
        }}
      >
        {renderContent()}
      </div>
    </AbsoluteFill>
  );
}
