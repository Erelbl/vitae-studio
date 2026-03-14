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

// ── ImageFill with crop model ─────────────────────────────────────────────────

/**
 * Full-bleed image with the same crop/zoom model as AlbumPageView.ImageFill.
 *
 *   scale ≥ 1  → image rendered at scale × 100% of container
 *   crop_x 0-1 → horizontal pan (0 = left-edge visible, 1 = right-edge visible)
 *   crop_y 0-1 → vertical pan   (0 = top-edge visible,  1 = bottom-edge visible)
 *
 * kbScale applies Ken Burns on top of the existing crop scale by wrapping the
 * crop-positioned image in a center-origin CSS transform.
 */
function ImageFill({
  slot,
  kbScale = 1,
}: {
  slot: SlotImageData | null;
  kbScale?: number;
}) {
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

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* Ken Burns outer wrapper — scales from centre without shifting crop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: kbScale !== 1 ? `scale(${kbScale})` : undefined,
          transformOrigin: "center center",
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
        <p
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
        </p>
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
        <p
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
        </p>
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
        <p
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
        </p>
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
        <p
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
        </p>
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
      <p
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
      </p>
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
        <p
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
        </p>
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
 *   - Ken Burns applied as an extra scale on top of the existing crop
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
      ? interpolate(kbProgress, [0, 1], [1.0, 1.08])
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
            {hasText && (
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
                <p
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
                </p>
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
