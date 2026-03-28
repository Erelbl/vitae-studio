/**
 * Kling 2.6 prompt library for page-level image-to-video generation.
 *
 * Each scene type maps to a Kling-optimised prompt that:
 *   - preserves the watercolor illustration style exactly
 *   - requests subtle, natural motion
 *   - explicitly forbids face/character distortion
 *
 * Prompts are tuned for 10-second clips at standard mode.
 */

export type SceneType =
  | "single_character"
  | "multiple_characters"
  | "landscape"
  | "character_action"
  | "primary_object_scene"
  | "fallback";

/**
 * Base quality/safety preamble shared by all prompts.
 * Added first so it can never be overridden by per-type additions.
 */
const BASE =
  "Preserve the exact watercolor illustration style and original composition. " +
  "Do not alter, redesign, add, or remove characters. " +
  "Preserve facial features and identity exactly. No face distortion. " +
  "Animate only the illustrated content. Do not alter the page border, layout, or framing. " +
  "Use subtle, natural, realistic motion only. No exaggerated animation. " +
  "Do not reframe, zoom out, change camera angle, or shift subjects unnaturally. " +
  "The image should feel gently brought to life, not fully re-animated. " +
  "No cinematic transitions, no reveal effects, and no stylized scene changes. " +
  "The scene must remain visually stable from start to end. " +
  "No fade in, no fade out, no dissolve, no added text, and no overlays.";

/**
 * FACIAL INTEGRITY RULES — applied to all prompts involving characters.
 * Facial identity preservation is the highest priority.
 * If the model cannot preserve faces perfectly, it must not animate them at all.
 */
const FACIAL_INTEGRITY_RULES =
  " FACIAL INTEGRITY RULES: Facial identity preservation is the highest priority. " +
  "Preserve exact facial structure, proportions, eyes, nose, mouth, and hairstyle. " +
  "No face distortion, no redesign, no identity drift. " +
  "Do not animate lips or strong expressions. " +
  "If facial accuracy is at risk, keep the face completely still. " +
  "Instead, use subtle motion in body, hands, hair, clothing, or background. " +
  "No jitter, no flicker, no cartoon-like behavior.";

/**
 * Motion safety rules — prevents hallucinated motion and effects in wrong places.
 */
const MOTION_CONSTRAINTS =
  " Motion must remain physically grounded and spatially correct. " +
  "Do not introduce any new elements, particles, or visual effects that were not present in the original image. " +
  "Do not generate motion that passes through or overlaps with characters' bodies unnaturally. " +
  "Environmental motion such as leaves, smoke, light, shadows, water, or mist must stay in its natural location and must not appear on or through clothing, skin, or faces. " +
  "All motion must respect the original structure and boundaries of objects in the image.";

export const PROMPT_LIBRARY: Record<SceneType, string> = {
  single_character:
    BASE +
    FACIAL_INTEGRITY_RULES +
    MOTION_CONSTRAINTS +
    " Focus on the single character. " +
    "Allow minimal natural motion: slight breathing and very small posture shifts. " +
    "Head movement must remain subtle and controlled. " +
    "No strong facial expression changes. " +
    "Allow minimal hand or finger movement if visible. " +
    "The character must remain visually consistent and anchored in the frame. " +
    "Camera is fixed.",

  multiple_characters:
    BASE +
    " Preserve all characters exactly as shown: faces, proportions, clothing, and relationships. " +
    FACIAL_INTEGRITY_RULES +
    MOTION_CONSTRAINTS +
    " Motion should feel alive but controlled: allow subtle group activity such as gentle walking, shifting weight, or small natural interactions if implied by the scene. " +
    "Movement must remain coordinated and natural. Avoid chaotic or exaggerated motion. " +
    "If facial accuracy is at risk, keep faces still and redirect motion to hands, shoulders, clothing, hair, or background. " +
    "Avoid large or fast motion and avoid synchronized unnatural movement. " +
    "Keep all faces stable and unchanged throughout the scene. " +
    "The scene must remain visually stable until the final frame.",

  landscape:
    BASE +
    MOTION_CONSTRAINTS +
    " No characters to animate. Environmental motion only. " +
    "Allow natural movement such as wind in foliage, slow water motion, drifting clouds, and soft lighting changes. " +
    "Do not introduce new elements or alter the composition. " +
    "Preserve depth, layout, and atmosphere exactly as shown. " +
    "Very slow camera drift is allowed only if it does not reframe the scene.",

  character_action:
    BASE +
    FACIAL_INTEGRITY_RULES +
    MOTION_CONSTRAINTS +
    " Allow natural, meaningful movement that fits the illustrated pose and scene. " +
    "Movement can include walking, turning, or interacting, but must remain smooth, controlled, and realistic. " +
    "Faces must remain stable and undistorted throughout all motion. " +
    "Do not introduce strange or exaggerated motion. " +
    "Preserve character identity throughout. " +
    "Camera remains fixed.",

  primary_object_scene:
    BASE +
    MOTION_CONSTRAINTS +
    " Preserve the main object or structure exactly as shown, such as a ship, building, or large scene element. " +
    "Maintain structural integrity with no distortion or warping. " +
    "Allow natural environmental motion such as water movement, smoke, clouds, or ambient activity. " +
    "Human figures, if present, should remain secondary and may move subtly and naturally. " +
    "Do not alter faces or introduce new characters. " +
    "Motion should enhance the scene, not distract from the main subject. " +
    "The scene must remain visually stable until the final frame.",

  fallback:
    BASE +
    FACIAL_INTEGRITY_RULES +
    MOTION_CONSTRAINTS +
    " Preserve the entire scene exactly as illustrated. " +
    "Add only the most minimal believable ambient motion. " +
    "No invented elements. Camera is fixed.",
};

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
  FACIAL_INTEGRITY_RULES +
  MOTION_CONSTRAINTS +
  " Preserve all characters exactly as illustrated: faces, clothing, proportions, and relationships. " +
  "Add only the most minimal believable ambient motion: soft breathing and gentle clothing movement. " +
  "No large movement. No invented elements. Camera is fixed.";