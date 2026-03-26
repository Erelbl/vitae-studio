/**
 * Kling 2.6 prompt library for page-level image-to-video generation.
 *
 * Each scene type maps to a Kling-optimised prompt that:
 *   - preserves the watercolor illustration style exactly
 *   - requests only subtle, natural motion
 *   - explicitly forbids face/character distortion
 *
 * Prompts are tuned for 10-second clips at standard mode.
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
    " Preserve every character exactly as illustrated — faces, clothing, proportions, positions. " +
    "Bring the scene alive with clearly visible but minimal natural motion: " +
    "each character should blink at least once, with small individual head movements and " +
    "gentle body shifts. Where hands are visible, allow a slow natural hand gesture or finger movement. " +
    "Characters may exchange soft eye contact or a subtle lean toward each other — " +
    "not all characters should move at the same moment. " +
    "Motion must be staggered and natural, never synchronised or puppet-like. " +
    "No invented new actions, no large movement, no face warping. Camera stays still.",

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

/**
 * Safe-retry prompt used when Kie rejects a page with NSFW moderation.
 * Explicitly emphasises family-friendly, fully-clothed, G-rated content
 * while still requesting the minimal natural motion needed for the film.
 */
export const NSFW_RETRY_PROMPT =
  "Children's book watercolor illustration. Fully clothed characters only. " +
  "Family-friendly, G-rated scene. No adult, sensual, or suggestive content of any kind. " +
  BASE +
  " Preserve all characters exactly as illustrated — faces, clothing, proportions. " +
  "Add only the most minimal believable ambient motion: gentle eye blinking, soft breathing. " +
  "No large movement. No invented elements. Camera stays still.";
