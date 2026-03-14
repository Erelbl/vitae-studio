/** Minimum scene duration in ms */
const MIN_DURATION_MS = 3000;
/** Padding after audio ends, in ms */
const AUDIO_PADDING_MS = 1500;
/** Default duration when no audio and no text is available */
const DEFAULT_DURATION_MS = 5000;
/** Estimated Hebrew speech rate: ~2.5 words/second */
const WORDS_PER_SECOND = 2.5;

/**
 * Computes the display duration for a scene based on its narration audio length.
 * Scene must be at least MIN_DURATION_MS, and adds padding after audio ends.
 *
 * @param audioDurationMs - Duration of the narration audio in ms (null if no audio)
 * @returns Scene duration in ms
 */
export function computeSceneDuration(
  audioDurationMs: number | null
): number {
  if (audioDurationMs == null) return DEFAULT_DURATION_MS;
  return Math.max(MIN_DURATION_MS, audioDurationMs + AUDIO_PADDING_MS);
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
  return Math.max(MIN_DURATION_MS, speechMs + AUDIO_PADDING_MS);
}
