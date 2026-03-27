/**
 * FinalFilmComposition — Remotion composition that sequences pre-rendered
 * scene clip MP4s into a single final film with page-turn transitions.
 *
 * This replaces the fragile ffmpeg xfade assembly. Remotion handles timeline
 * sequencing natively — no duration-sensitive offset math, no filter chains.
 *
 * Each scene clip is a pre-rendered silent MP4. Narration audio is placed
 * alongside the video via a separate <Audio> component within the same
 * <Sequence> — no ffmpeg muxing required.
 *
 * Sources: signed HTTPS URLs from Supabase Storage (NOT file:// paths).
 * Chrome (Remotion's renderer) can load HTTPS URLs natively.
 */

import {
  AbsoluteFill,
  Sequence,
  OffthreadVideo,
  Audio,
  useCurrentFrame,
  interpolate,
} from "remotion";
import { PageTurnTransition } from "./PageTurnTransition";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClipEntry {
  /**
   * Signed HTTPS URL for the pre-rendered scene MP4 (silent video).
   * Must be an HTTP/HTTPS URL — file:// paths are rejected by Chrome.
   */
  src: string;
  /**
   * Signed HTTPS URL for the narration MP3, or null if this scene has no audio.
   * Played via <Audio> alongside <OffthreadVideo> within the same Sequence.
   */
  audioSrc: string | null;
  /** Duration of this clip in frames (derived from film_scenes.duration_ms). */
  durationInFrames: number;
}

export interface FinalFilmCompositionProps {
  clips: ClipEntry[];
  /** Duration of the page-turn transition overlap in frames (e.g. 24 = 0.8s @30fps). */
  transitionDurationInFrames: number;
  /**
   * Play the page-turn sound effect on each transition.
   * Requires public/sounds/page-turn.mp3 to exist and be included in the
   * Remotion bundle (run `npm run bundle:remotion` after adding the file).
   * Default: false — set to true once the sound file is in place.
   */
  enableTransitionSound?: boolean;
}

// ── Clip with transition ─────────────────────────────────────────────────────

function ClipWithTransition({
  clip,
  clipIndex,
  totalClips,
  transitionDurationInFrames,
  startFrame,
  enableTransitionSound,
}: {
  clip: ClipEntry;
  clipIndex: number;
  totalClips: number;
  transitionDurationInFrames: number;
  startFrame: number;
  enableTransitionSound: boolean;
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

  // During entry: this clip is the INCOMING one revealed beneath the turning page.
  // Sits at zIndex 1 (below the outgoing page at zIndex 2).
  if (isInEntryTransition) {
    return (
      <PageTurnTransition progress={entryProgress} role="incoming">
        <OffthreadVideo src={clip.src} />
      </PageTurnTransition>
    );
  }

  // During exit: this clip is the OUTGOING page turning away.
  // Sits at zIndex 2 (above the incoming scene at zIndex 1).
  // Sound plays at the start of the turn (frame 0 of the exit window).
  if (isInExitTransition) {
    return (
      <PageTurnTransition
        progress={exitProgress}
        role="outgoing"
        enableSound={enableTransitionSound}
      >
        <OffthreadVideo src={clip.src} />
      </PageTurnTransition>
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
  enableTransitionSound = false,
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
          {/* Narration audio — plays at volume 1 within the scene's time window.
              Placed outside ClipWithTransition so transitions don't affect audio. */}
          {clip.audioSrc && (
            <Audio src={clip.audioSrc} volume={1} />
          )}
          <ClipWithTransition
            clip={clip}
            clipIndex={i}
            totalClips={clips.length}
            transitionDurationInFrames={td}
            startFrame={starts[i]}
            enableTransitionSound={enableTransitionSound}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
