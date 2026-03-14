/**
 * Transforms album page text into narration-friendly text.
 * The album text is written as Hebrew rhyming poetry —
 * narration may need adjustments for natural speech flow.
 *
 * @param sourceText - Original album page text
 * @returns Adjusted text suitable for TTS narration
 *
 * TODO: Implement text transformation:
 * - Remove/adjust line breaks for speech flow
 * - Optionally add pauses (SSML or punctuation)
 * - Handle special characters or formatting
 * - For MVP, may just return sourceText as-is
 */
export function buildNarrationText(sourceText: string): string {
  // MVP: return source text as-is — narration adjustments can come later
  return sourceText.trim();
}
