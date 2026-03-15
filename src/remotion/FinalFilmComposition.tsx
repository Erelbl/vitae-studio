/**
 * FinalFilmComposition — Remotion composition that sequences pre-rendered
 * scene clip MP4s into a single final film with page-turn transitions.
 *
 * This replaces the fragile ffmpeg xfade assembly. Remotion handles timeline
 * sequencing natively — no duration-sensitive offset math, no filter chains.
 *
 * Each scene clip already contains the full Remotion animation (image reveal,
 * text reveal, Ken Burns, etc.) with audio muxed in. This composition simply
 * plays them in order with wipeleft transitions between scenes.
 *
 * Props are passed by the assembly function in assemble-film.ts — clips are
 * local file:// URLs pointing to temp-directory muxed MP4 files.
 */

import {
  AbsoluteFill,
  Sequence,
  OffthreadVideo,
  useCurrentFrame,
  interpolate,
} from "remotion";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClipEntry {
  /** Video source — file:// URL or http URL accessible to the renderer. */
  src: string;
  /** Duration of this clip in frames. */
  durationInFrames: number;
}

export interface FinalFilmCompositionProps {
  clips: ClipEntry[];
  /** Duration of the page-turn transition overlap in frames (e.g. 24 = 0.8s @30fps). */
  transitionDurationInFrames: number;
}

// ── Transition overlay ───────────────────────────────────────────────────────

/**
 * Wipeleft transition: outgoing clip wipes off to the left while the incoming
 * clip is revealed from the right. Simulates physically turning a page
 * right-to-left (Hebrew reading direction).
 *
 * During the overlap window, both clips are rendered. The outgoing clip's
 * visible region shrinks from right, and the incoming clip's visible region
 * grows from right — creating a clean wipe edge that sweeps left.
 */
function WipeleftTransition({
  progress,
  children,
  direction,
}: {
  progress: number;
  children: React.ReactNode;
  direction: "outgoing" | "incoming";
}) {
  if (direction === "outgoing") {
    // Outgoing: clip away from the right side as progress increases
    // At progress=0: fully visible. At progress=1: fully clipped away.
    const clipRight = `${progress * 100}%`;
    return (
      <AbsoluteFill style={{ clipPath: `inset(0 ${clipRight} 0 0)` }}>
        {children}
      </AbsoluteFill>
    );
  }

  // Incoming: reveal from the right side as progress increases
  // At progress=0: fully clipped. At progress=1: fully visible.
  const clipLeft = `${(1 - progress) * 100}%`;
  return (
    <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${clipLeft})` }}>
      {children}
    </AbsoluteFill>
  );
}

// ── Clip with transition ─────────────────────────────────────────────────────

function ClipWithTransition({
  clip,
  clipIndex,
  totalClips,
  transitionDurationInFrames,
  startFrame,
}: {
  clip: ClipEntry;
  clipIndex: number;
  totalClips: number;
  transitionDurationInFrames: number;
  startFrame: number;
}) {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;
  const td = transitionDurationInFrames;
  const isFirst = clipIndex === 0;
  const isLast = clipIndex === totalClips - 1;

  // Entry transition (not for the first clip)
  let entryProgress = 1; // fully visible by default
  if (!isFirst && td > 0) {
    entryProgress = interpolate(localFrame, [0, td], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  // Exit transition (not for the last clip)
  let exitProgress = 0; // no exit by default
  if (!isLast && td > 0) {
    const exitStart = clip.durationInFrames - td;
    exitProgress = interpolate(localFrame, [exitStart, clip.durationInFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  // Determine which transition state we're in
  const isInEntryTransition = !isFirst && entryProgress < 1;
  const isInExitTransition = !isLast && exitProgress > 0;

  // During entry: this clip is the "incoming" one being revealed
  if (isInEntryTransition) {
    return (
      <WipeleftTransition progress={entryProgress} direction="incoming">
        <OffthreadVideo src={clip.src} />
      </WipeleftTransition>
    );
  }

  // During exit: this clip is the "outgoing" one being wiped away
  if (isInExitTransition) {
    return (
      <WipeleftTransition progress={exitProgress} direction="outgoing">
        <OffthreadVideo src={clip.src} />
      </WipeleftTransition>
    );
  }

  // Normal playback — no transition active
  return (
    <AbsoluteFill>
      <OffthreadVideo src={clip.src} />
    </AbsoluteFill>
  );
}

// ── Main composition ─────────────────────────────────────────────────────────

/**
 * Computes the starting frame for each clip, accounting for transition overlaps.
 *
 * Layout: clips overlap by `transitionDurationInFrames`. Each clip after the
 * first starts `td` frames before the previous clip ends.
 *
 *   clip[0]:  [0 .......................... dur0)
 *   clip[1]:        [dur0-td .................... dur0-td+dur1)
 *   clip[2]:              [dur0+dur1-2*td ................. dur0+dur1-2*td+dur2)
 *
 * Start of clip[i] = sum(dur[0..i-1]) - i * td
 */
function computeClipStarts(
  clips: ClipEntry[],
  td: number
): number[] {
  const starts: number[] = [];
  let cumulative = 0;
  for (let i = 0; i < clips.length; i++) {
    starts.push(cumulative);
    cumulative += clips[i].durationInFrames - td;
  }
  return starts;
}

/**
 * Total composition duration = sum(all clip durations) - (N-1) * td
 */
export function computeTotalDuration(
  clips: ClipEntry[],
  transitionDurationInFrames: number
): number {
  if (clips.length === 0) return 1;
  const totalClipFrames = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
  const overlapFrames = Math.max(0, clips.length - 1) * transitionDurationInFrames;
  return Math.max(1, totalClipFrames - overlapFrames);
}

export function FinalFilmComposition({
  clips,
  transitionDurationInFrames,
}: FinalFilmCompositionProps) {
  if (clips.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: "#111" }} />;
  }

  const td = clips.length === 1 ? 0 : transitionDurationInFrames;
  const starts = computeClipStarts(clips, td);

  return (
    <AbsoluteFill style={{ backgroundColor: "#111" }}>
      {clips.map((clip, i) => (
        <Sequence
          key={i}
          from={starts[i]}
          durationInFrames={clip.durationInFrames}
          layout="none"
        >
          <ClipWithTransition
            clip={clip}
            clipIndex={i}
            totalClips={clips.length}
            transitionDurationInFrames={td}
            startFrame={starts[i]}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
