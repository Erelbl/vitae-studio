/** Minimum scene duration in ms */
const MIN_DURATION_MS = 3000;

/**
 * Buffer after audio for codec frame alignment / rounding and safe tail (ms).
 * At 128 kbps the last MP3 frame is ~26 ms, but player buffering and variable
 * bitrate fluctuations can add up. 800 ms gives a safe margin without a
 * noticeable pause, ensuring the last word always fully decodes before the
 * scene sequence ends in Remotion.
 */
const AUDIO_TAIL_MS = 800;

/**
 * Visible still pause after narration ends and before the page-turn transition (ms).
 *
 * In the assembled film, the xfade transition starts TRANSITION_DURATION (0.8s)
 * before the scene video ends. The visible stillness the viewer sees is:
 *
 *   BREATHING_PAUSE_MS + AUDIO_TAIL_MS - TRANSITION_DURATION_MS
 *   = 2000 + 500 - 800 = 1700ms of visible still spread
 *
 * Flow: narration ends → ~1.7s still image → page turn begins → next spread
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
