/**
 * Transforms album page text into narration-friendly text for TTS.
 * Only performs safe whitespace normalization — no AI rewriting.
 * Does NOT mutate the stored album text.
 *
 * @param sourceText - Original album page text (may contain newlines, extra spaces)
 * @returns Cleaned text suitable for TTS narration
 */
export function buildNarrationText(sourceText: string): string {
  if (!sourceText) return "";
  return sourceText
    .replace(/\r\n/g, "\n")        // normalize line endings
    .replace(/\n{3,}/g, "\n\n")    // collapse 3+ consecutive newlines to 2
    .replace(/[ \t]+/g, " ")       // collapse horizontal whitespace
    .trim();
}
