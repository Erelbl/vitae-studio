import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useAlbumFont } from "./album-font";

export interface SceneCompositionProps {
  /** Signed image URLs for the scene's pages (1 or 2). */
  imageUrls: string[];
  /** Narration text displayed as an overlay subtitle. */
  narrationText: string | null;
  /** Motion preset applied to the primary image. */
  motionPreset: "ken_burns" | "static";
  /** Fade in at the start. */
  transitionIn: "fade" | "none";
  /** Fade out at the end. */
  transitionOut: "fade" | "none";
}

/** Frames used for fade transitions at the start/end of a scene. */
const FADE_FRAMES = 15; // 0.5 s at 30 fps

/** Ken Burns: gentle zoom and pan over the full scene duration. */
function KenBurnsImage({ src }: { src: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;

  // Zoom 100 % → 108 % — subtle, not distracting
  const scale = interpolate(progress, [0, 1], [1.0, 1.08]);
  // Gentle pan: centre → 2 % left (physical pixels)
  const translateX = interpolate(progress, [0, 1], [0, -2]);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translateX(${translateX}%)`,
          transformOrigin: "center center",
        }}
      />
    </AbsoluteFill>
  );
}

/**
 * Remotion composition for a single film scene.
 *
 * Displays the primary page image with an optional Ken Burns motion effect
 * and an RTL text overlay. Fade-in / fade-out transitions are handled via
 * opacity interpolation (not CSS animations, which would be frozen during
 * frame-by-frame rendering).
 */
export function SceneComposition({
  imageUrls,
  narrationText,
  motionPreset,
  transitionIn,
  transitionOut,
}: SceneCompositionProps) {
  // Load the album font before any frame is rendered.
  // globals.css @font-face is not available in the Remotion bundle — the font
  // must be injected explicitly here. See src/remotion/album-font.ts.
  useAlbumFont();

  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // ── Fade envelope ──────────────────────────────────────────────────────────
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

  const primaryImage = imageUrls[0] ?? null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1a1a1a",
        opacity,
      }}
    >
      {/* ── Primary image with optional motion ─────────────────────────── */}
      {primaryImage &&
        (motionPreset === "ken_burns" ? (
          <KenBurnsImage src={primaryImage} />
        ) : (
          <AbsoluteFill style={{ overflow: "hidden" }}>
            <Img
              src={primaryImage}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </AbsoluteFill>
        ))}

      {/* ── Text overlay ───────────────────────────────────────────────── */}
      {narrationText && (
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 45%, transparent 70%)",
            display: "flex",
            alignItems: "flex-end",
            padding: "40px 80px",
          }}
        >
          <p
            style={{
              color: "white",
              fontSize: 38,
              // YardenAlbum is loaded via useAlbumFont() above (see src/remotion/album-font.ts).
              // Falls back to system Hebrew fonts if the font fails to load.
              fontFamily: '"YardenAlbum", "Arial Hebrew", "David", Arial, serif',
              direction: "rtl",
              lineHeight: 1.7,
              textShadow: "0 2px 8px rgba(0,0,0,0.85)",
              maxWidth: "85%",
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {narrationText}
          </p>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
