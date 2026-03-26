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
  "Subtle, realistic, natural motion only. No exaggerated animation. Cinematic quality. " +
  "Animate only the illustrated content shown in the image. " +
  "Do not alter or animate any surrounding background, page border, or layout framing. " +
  "Preserve the exact composition and framing of the original image. " +
  "Do not reframe, zoom out, change camera angle, or shift the subject unnaturally within the frame. " +
  "Motion should feel like the illustration is gently coming to life, not like a full animation. " +
  "The scene should begin with a subtle illustration reveal effect: colors and details softly appear as if being painted in, in a smooth and cinematic way. " +
  "No visible hand, no drawing tools, no active sketching, and no artificial timelapse drawing effect. " +
  "The reveal must be soft, refined, and blend naturally into the scene's motion.";

export const PROMPT_LIBRARY: Record<SceneType, string> = {
  single_character:
    BASE +
    " Focus on the single character. " +
    "Add gentle eye blinking, slight natural head movement, and soft breathing. " +
    "Allow minimal hand or finger movement if hands are visible. " +
    "The character must remain visually consistent and naturally anchored in the frame. " +
    "Camera is fixed or drifts very slightly without reframing.",

  multiple_characters:
    BASE +
    " Preserve every character exactly as illustrated: faces, clothing, proportions, and relationships. " +
    "Maintain the exact spatial relationship between all characters. " +
    "Bring the scene alive with clearly visible but minimal natural motion: " +
    "each character may blink, make small individual head movements, and gentle body shifts. " +
    "Where hands are visible, allow a slow natural hand gesture or finger movement. " +
    "Characters may exchange soft eye contact or a subtle lean toward each other. " +
    "Not all characters should move at the same moment. " +
    "Motion must be staggered and natural, never synchronized or puppet-like. " +
    "No invented new actions, no large movement, no face warping. " +
    "Camera is fixed.",

  landscape:
    BASE +
    " No characters to animate. Environmental motion only. " +
    "Allow gentle leaf movement, soft breeze in foliage, subtle light shifts, and slow water ripple if water is present. " +
    "Do not introduce new elements or alter the composition. " +
    "Preserve depth, layout, and atmosphere exactly as shown. " +
    "Very slow cinematic camera drift is allowed only if it does not reframe the scene.",

  character_action:
    BASE +
    " Allow natural, meaningful movement that fits the illustrated pose and scene. " +
    "Movement can include walking, turning, or interacting, but must remain smooth, controlled, and realistic. " +
    "Keep the action visually coherent with the original composition and do not introduce strange or exaggerated motion. " +
    "Preserve character identity throughout. " +
    "Camera may follow very slightly only if needed, without breaking the original framing.",

  fallback:
    BASE +
    " Preserve the entire scene exactly as illustrated. " +
    "Add only the most minimal believable ambient motion. " +
    "No invented elements. Camera is fixed.",
};

/**
 * Safe-retry prompt used when Kie rejects a page with NSFW moderation.
 * Explicitly emphasises family-friendly, fully-clothed, G-rated content
 * while still requesting the minimal natural motion needed for the film.
 */
export const NSFW_RETRY_PROMPT =
  "Children's book watercolor illustration. Fully clothed characters only. " +
  "Family-friendly, G-rated scene. No adult, sensual, or suggestive content of any kind. " +
  BASE +
  " Preserve all characters exactly as illustrated: faces, clothing, proportions, and relationships. " +
  "Add only the most minimal believable ambient motion: gentle eye blinking and soft breathing. " +
  "No large movement. No invented elements. Camera is fixed.";
