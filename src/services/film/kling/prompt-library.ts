/**
 * Kling 2.6 prompt library for page-level image-to-video generation.
 *
 * Each scene type maps to a Kling-optimised prompt that:
 *   - preserves the watercolor illustration style exactly
 *   - requests only subtle, natural motion
 *   - explicitly forbids face/character distortion
 *
 * Prompts are tuned for 5-second clips at standard mode.
 */

export type SceneType =
  | "single_character"
  | "multiple_characters"
  | "landscape"
  | "character_action"
  | "fallback";

/**
 * Base quality/safety preamble shared by all prompts.
 * Added first so it can never be overridden by per-type additions.
 */
const BASE =
  "Preserve the exact watercolor illustration style. " +
  "Do not alter, morph, or redesign any character. " +
  "Preserve all facial features and identities exactly as shown. " +
  "No face distortion. No character redesign. No added or removed characters. " +
  "Subtle, realistic, natural motion only. No exaggerated animation. Cinematic quality.";

export const PROMPT_LIBRARY: Record<SceneType, string> = {
  single_character:
    BASE +
    " Focus on the single character. " +
    "Add gentle eye blinking, slight natural head movement, and soft breathing. " +
    "Allow minimal hand or finger movement if hands are visible. " +
    "Camera stays still or drifts very slightly.",

  multiple_characters:
    BASE +
    " Preserve all characters exactly as illustrated. " +
    "Add only very small natural gestures — occasional blinking, a slight head tilt, " +
    "a subtle shoulder shift. No large movement. No invented interaction between characters. " +
    "Camera stays still.",

  landscape:
    BASE +
    " No characters to animate. Environmental motion only. " +
    "Allow gentle leaf movement, soft breeze in foliage, subtle light shifts, " +
    "slow water ripple if water is present. " +
    "Very slow cinematic camera drift — barely perceptible. No invented elements.",

  character_action:
    BASE +
    " Allow one small, natural action that clearly matches the illustrated pose. " +
    "A subtle turn of the head, a short slow step, or a small hand motion — choose only one. " +
    "Preserve character identity throughout. Camera follows the action slightly.",

  fallback:
    BASE +
    " Preserve the entire scene exactly as illustrated. " +
    "Add only the most minimal believable ambient motion. Camera stays still.",
};

/** Returns the Kling prompt for a given scene type. Always returns a safe string. */
export function getKlingPrompt(sceneType: SceneType): string {
  return PROMPT_LIBRARY[sceneType] ?? PROMPT_LIBRARY.fallback;
}
