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
  staticFile,
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
  /**
   * Whether this scene contains narration audio (baked into the scene MP4).
   * Used by the background music layer to duck volume under narration.
   */
  hasNarration: boolean;
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
  enableTransitionSound,
}: {
  clip: ClipEntry;
  clipIndex: number;
  totalClips: number;
  transitionDurationInFrames: number;
  enableTransitionSound: boolean;
}) {
  // useCurrentFrame() inside a <Sequence> already returns a sequence-local
  // 0-based frame (Remotion subtracts the Sequence's `from` offset internally).
  // Do NOT subtract startFrame here — that would double-subtract the offset and
  // break every clip after clip 0.
  const frame = useCurrentFrame();
  const td = transitionDurationInFrames;
  const isFirst = clipIndex === 0;
  const isLast = clipIndex === totalClips - 1;

  // Entry transition (not for the first clip)
  let entryProgress = 1; // fully visible by default
  if (!isFirst && td > 0) {
    entryProgress = interpolate(frame, [0, td], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  // Exit transition (not for the last clip)
  let exitProgress = 0; // no exit by default
  if (!isLast && td > 0) {
    const exitStart = clip.durationInFrames - td;
    exitProgress = interpolate(frame, [exitStart, clip.durationInFrames], [0, 1], {
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

// ── Background music ─────────────────────────────────────────────────────────

/**
 * Volume during quiet / non-narrated sections.
 * Noticeable enough to fill silence without distracting from imagery.
 */
const MUSIC_BASE_VOLUME = 0.15;

/**
 * Volume while narration is playing.
 * Low enough to be inaudible under speech but maintains the ambient bed.
 */
const MUSIC_DUCKED_VOLUME = 0.05;

/**
 * Crossfade duration for duck transitions, in frames (~0.6 s at 30 fps).
 * Prevents abrupt volume jumps at clip boundaries.
 */
const DUCK_FADE_FRAMES = 18;

/**
 * Builds a per-frame volume callback for the background music track.
 * For each narrated clip, volume ramps down to MUSIC_DUCKED_VOLUME over
 * DUCK_FADE_FRAMES at clip start, stays ducked, then ramps back up at clip end.
 * Non-narrated clips (no speech) leave music at MUSIC_BASE_VOLUME.
 */
function buildMusicVolumeFunc(
  clips: ClipEntry[],
  starts: number[]
): (frame: number) => number {
  return (frame: number) => {
    let vol = MUSIC_BASE_VOLUME;
    for (let i = 0; i < clips.length; i++) {
      if (!clips[i].hasNarration) continue;
      const s = starts[i];
      const e = s + clips[i].durationInFrames;
      const f = DUCK_FADE_FRAMES;
      if (frame < s - f || frame > e + f) continue;
      // rampIn:  0 outside → 1 fully inside (approaching from the left)
      // rampOut: 1 fully inside → 0 outside (departing to the right)
      const rampIn  = Math.min(1, Math.max(0, (frame - (s - f)) / f));
      const rampOut = Math.min(1, Math.max(0, ((e + f) - frame) / f));
      const t = Math.min(rampIn, rampOut); // 0 at edges, 1 fully inside clip
      const ducked = MUSIC_BASE_VOLUME + (MUSIC_DUCKED_VOLUME - MUSIC_BASE_VOLUME) * t;
      vol = Math.min(vol, ducked); // most-ducked value wins when clips overlap
    }
    return vol;
  };
}

// ── Composition ───────────────────────────────────────────────────────────────

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
  const musicVolume = buildMusicVolumeFunc(clips, starts);

  return (
    <AbsoluteFill style={{ backgroundColor: "#111" }}>
      {/* Background music — looped, low volume, ducked under narration */}
      <Audio
        src={staticFile("film-audio/background-music.mp3")}
        loop
        volume={musicVolume}
      />
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
            enableTransitionSound={enableTransitionSound}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
