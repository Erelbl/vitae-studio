/** Minimum scene duration in ms */
const MIN_DURATION_MS = 3000;

/**
 * Safety tail appended after the true audio duration (ms).
 *
 * Audio duration is now derived from actual MP3 frame parsing (getMp3DurationMs),
 * so this constant is no longer compensating for bitrate-estimation error.
 * It instead provides:
 *   • ~26 ms for the last MP3 frame to be fully decoded by any player
 *   • A small audible "breath" so the last word never sounds clipped
 *   • Headroom for any remaining decoder/buffer differences between players
 *
 * 1500 ms is deliberately generous: with BREATHING_PAUSE_MS = 2000 ms the
 * visible-still window before the page-turn transition is
 *   1500 + 2000 − 800 (transition) = 2700 ms — comfortable but not excessive.
 */
const AUDIO_TAIL_MS = 1500;

/**
 * Visible still pause after narration ends and before the page-turn transition (ms).
 *
 * In the assembled film, the xfade transition starts TRANSITION_DURATION (0.8s)
 * before the scene video ends. The visible stillness the viewer sees is:
 *
 *   AUDIO_TAIL_MS + BREATHING_PAUSE_MS − TRANSITION_DURATION_MS
 *   = 1500 + 2000 − 800 = 2700 ms of visible still spread
 *
 * Flow: narration ends → ~2.7 s still image → page turn begins → next spread
 *
 * This pause is critical for pacing — without it, the film rushes from one
 * spread to the next without letting the viewer absorb the illustration.
 */
const BREATHING_PAUSE_MS = 2000;

/** Default duration when no audio and no text is available */
const DEFAULT_DURATION_MS = 5000;
/** Estimated Hebrew speech rate: ~2.5 words/second */
const WORDS_PER_SECOND = 2.5;

/**
 * Computes the display duration for a scene based on its narration audio length.
 *
 * Scene duration = audio + tail buffer + breathing pause (minimum MIN_DURATION_MS).
 * The breathing pause provides visible stillness after narration ends,
 * before the assembly's page-turn transition begins.
 *
 * @param audioDurationMs - Duration of the narration audio in ms (null if no audio)
 * @returns Scene duration in ms
 */
export function computeSceneDuration(
  audioDurationMs: number | null
): number {
  if (audioDurationMs == null) return DEFAULT_DURATION_MS;
  return Math.max(
    MIN_DURATION_MS,
    audioDurationMs + AUDIO_TAIL_MS + BREATHING_PAUSE_MS
  );
}

/**
 * Estimates scene duration from narration text when no audio exists yet.
 * Uses a simple word-count heuristic (~2.5 words/second for Hebrew speech).
 *
 * @param narrationText - The narration text for this scene
 * @returns Estimated duration in ms
 */
export function estimateSceneDurationFromText(
  narrationText: string | null
): number {
  if (!narrationText || narrationText.trim().length === 0) {
    return DEFAULT_DURATION_MS;
  }
  const wordCount = narrationText.trim().split(/\s+/).length;
  const speechMs = Math.round((wordCount / WORDS_PER_SECOND) * 1000);
  return Math.max(
    MIN_DURATION_MS,
    speechMs + AUDIO_TAIL_MS + BREATHING_PAUSE_MS
  );
}
