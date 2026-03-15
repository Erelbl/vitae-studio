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

/** Image fully revealed (color + mask) at this fraction of scene duration. */
const IMAGE_REVEAL_END_FRAC = 0.55;
/** Starting grayscale amount (0 = full color, 1 = fully grey). */
const INITIAL_GRAYSCALE = 0.6;
/** Radial mask start size (% of container). Smaller = more hidden at start. */
const MASK_START_PCT = 55;
/** Radial mask end size (% of container). >100 ensures full coverage. */
const MASK_END_PCT = 160;
/** Ken Burns zoom — subtle, premium feel. */
const KB_ZOOM_END = 1.05;

/** Text writing/reveal starts at this fraction of scene duration. */
const TEXT_REVEAL_START_FRAC = 0.15;
/** Text fully visible at this fraction. */
const TEXT_REVEAL_END_FRAC = 0.65;

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
 * RTL-safe: the `<p>` carries `direction: rtl` from the caller's style,
 * and inline `<span>`s flow naturally in reading order.
 *
 * Uses Remotion's frame context internally — no prop-drilling needed.
 */
function AnimatedP({
  children,
  style,
}: {
  children: string;
  style?: React.CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const textStart = Math.round(durationInFrames * TEXT_REVEAL_START_FRAC);
  const textEnd = Math.round(durationInFrames * TEXT_REVEAL_END_FRAC);

  // Split into alternating [word, whitespace, word, …] tokens.
  // The capturing group keeps whitespace in the result array so newlines
  // are preserved by whiteSpace: pre-line on the <p>.
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

// ── ImageFill with crop model + reveal animation ─────────────────────────────

/**
 * Full-bleed image with the same crop/zoom model as AlbumPageView.ImageFill,
 * plus a reveal animation: grayscale-to-color + expanding radial mask.
 *
 *   scale ≥ 1  → image rendered at scale × 100% of container
 *   crop_x 0-1 → horizontal pan (0 = left-edge visible, 1 = right-edge visible)
 *   crop_y 0-1 → vertical pan   (0 = top-edge visible,  1 = bottom-edge visible)
 *
 * kbScale applies Ken Burns on top of the existing crop scale by wrapping the
 * crop-positioned image in a center-origin CSS transform.
 *
 * Reveal animation:
 *   - Grayscale fades from INITIAL_GRAYSCALE → 0 (full color)
 *   - Radial mask expands outward from center (paint-in / illustration feel)
 *   - Both complete at IMAGE_REVEAL_END_FRAC of scene duration
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

  // Reveal animation progress
  const revealEnd = Math.round(durationInFrames * IMAGE_REVEAL_END_FRAC);
  const revealProgress = interpolate(frame, [0, revealEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const grayscale = interpolate(revealProgress, [0, 1], [INITIAL_GRAYSCALE, 0]);
  const maskSize = interpolate(revealProgress, [0, 1], [MASK_START_PCT, MASK_END_PCT]);
  const isRevealed = revealProgress >= 1;

  const maskGradient = isRevealed
    ? undefined
    : `radial-gradient(ellipse ${maskSize}% ${maskSize}% at 50% 50%, black 55%, transparent 100%)`;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* Ken Burns outer wrapper — scales from centre without shifting crop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: kbScale !== 1 ? `scale(${kbScale})` : undefined,
          transformOrigin: "center center",
          filter: grayscale > 0.01 ? `grayscale(${grayscale})` : undefined,
          maskImage: maskGradient,
          WebkitMaskImage: maskGradient,
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

// ── Text overlay variants ─────────────────────────────────────────────────────

interface OverlayTextProps {
  text: string;
  textSize: string | null;
  fontSizePx: number | null;
  textAlign: string;
  textX: number | null;
  textY: number | null;
}

/** When admin has free-positioned the text, render it at those coordinates. */
function PositionedOverlay({
  text,
  fontSize,
  textAlign,
  textX,
  textY,
}: {
  text: string;
  fontSize: number;
  textAlign: string;
  textX: number;
  textY: number;
}) {
  return (
    <AbsoluteFill style={{ zIndex: 10, pointerEvents: "none" }}>
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
        >
          {text}
        </AnimatedP>
      </div>
    </AbsoluteFill>
  );
}

/** Bottom gradient overlay — default for FULL_IMAGE. */
function TextOverlayBottom({ text, textSize, fontSizePx, textAlign, textX, textY }: OverlayTextProps) {
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
      />
    );
  }

  return (
    <AbsoluteFill style={{ zIndex: 10, pointerEvents: "none" }}>
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
        >
          {text}
        </AnimatedP>
      </div>
    </AbsoluteFill>
  );
}

/** Top gradient overlay — for FULL_IMAGE_TEXT_TOP. */
function TextOverlayTop({ text, textSize, fontSizePx, textAlign, textX, textY }: OverlayTextProps) {
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
      />
    );
  }

  return (
    <AbsoluteFill style={{ zIndex: 10, pointerEvents: "none" }}>
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
        >
          {text}
        </AnimatedP>
      </div>
    </AbsoluteFill>
  );
}

/** Frosted-glass pill — for FULL_IMAGE_TEXT_CENTER. */
function TextOverlayCenter({ text, textSize, fontSizePx, textAlign, textX, textY }: OverlayTextProps) {
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
      />
    );
  }

  return (
    <AbsoluteFill
      style={{
        zIndex: 10,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px",
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
}: {
  text: string | null;
  textSize: string | null;
  fontSizePx: number | null;
  textAlign: string;
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
}: {
  text: string | null;
  textSize: string | null;
  fontSizePx: number | null;
  textAlign: string;
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
 *   - Image reveal: grayscale-to-color + expanding radial mask (paint-in feel)
 *   - Text reveal: word-by-word fade-in (writing/appearing effect)
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

  // ── Ken Burns ───────────────────────────────────────────────────────────────
  const kbProgress = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;
  const kbScale =
    motionPreset === "ken_burns"
      ? interpolate(kbProgress, [0, 1], [1.0, KB_ZOOM_END])
      : 1;

  const hasText = Boolean(textContent);
  const align = textAlign ?? "start";
  const overlayProps: OverlayTextProps = {
    text: textContent ?? "",
    textSize,
    fontSizePx,
    textAlign: align,
    textX: textX ?? null,
    textY: textY ?? null,
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
            {hasText && <TextOverlayTop {...overlayProps} />}
          </>
        );

      case "FULL_IMAGE_TEXT_CENTER":
        return (
          <>
            <ImageFill slot={slot1} kbScale={kbScale} />
            {hasText && <TextOverlayCenter {...overlayProps} />}
          </>
        );

      case "FULL_IMAGE":
      default:
        return (
          <>
            <ImageFill slot={slot1} kbScale={kbScale} />
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
      {renderContent()}
    </AbsoluteFill>
  );
}
