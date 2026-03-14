/** Minimum scene duration in ms */
const MIN_DURATION_MS = 3000;
/** Padding after audio ends, in ms */
const AUDIO_PADDING_MS = 1500;
/** Default duration when no audio is available */
const DEFAULT_DURATION_MS = 5000;

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
