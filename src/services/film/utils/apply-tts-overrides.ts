import type { TtsOverride } from "@/types/film";

/**
 * Merges project-level and scene-level TTS overrides.
 *
 * Scene-level overrides take precedence over project-level overrides for the
 * same `original` key. The result is a flat list ready to pass to
 * applyTtsOverrides().
 *
 * @param projectOverrides  film_projects.tts_overrides_json
 * @param sceneOverrides    film_scenes.scene_overrides_json
 */
export function mergeOverrides(
  projectOverrides: TtsOverride[] | null | undefined,
  sceneOverrides: TtsOverride[] | null | undefined
): TtsOverride[] {
  const project = projectOverrides ?? [];
  const scene = sceneOverrides ?? [];

  if (scene.length === 0) return project;
  if (project.length === 0) return scene;

  const sceneKeys = new Set(
    scene.map((o) => o.original?.trim()).filter(Boolean)
  );

  // Keep project entries not shadowed by scene entries, then append all scene entries
  const merged = project.filter((o) => !sceneKeys.has(o.original?.trim()));
  return [...merged, ...scene];
}

/**
 * Applies pronunciation overrides to text before it is sent to ElevenLabs TTS.
 *
 * IMPORTANT: This function must only be called on text destined for TTS.
 * It must NEVER be used to mutate stored source_text, narration_text, or
 * any album page content visible to the customer.
 *
 * Replacement is exact string matching (not regex) to avoid accidental
 * substitutions and injection risks from user-supplied patterns.
 *
 * @param text - The narration text to process
 * @param overrides - Per-project pronunciation overrides from film_projects.tts_overrides_json
 * @returns Text with all valid overrides applied
 */
export function applyTtsOverrides(
  text: string,
  overrides: TtsOverride[] | null | undefined
): string {
  if (!overrides || overrides.length === 0) return text;

  let result = text;

  for (const override of overrides) {
    const original = override.original?.trim();
    const spoken = override.spoken?.trim();

    // Skip rows where original is empty — replacing "" would corrupt the text
    if (!original) continue;
    // spoken is allowed to be "" (to silence a word), but must be defined
    if (spoken === undefined || spoken === null) continue;

    // Exact literal replacement — split/join avoids regex injection
    result = result.split(original).join(spoken);
  }

  return result;
}
