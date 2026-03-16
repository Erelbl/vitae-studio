import type { TtsOverride } from "@/types/film";

/**
 * Status of a single pronunciation override after being evaluated against
 * a specific scene's narration text.
 */
export interface OverrideStatus {
  /** The exact string searched for in the narration text */
  original: string;
  /** The phonetic replacement sent to ElevenLabs */
  spoken: string;
  /**
   * 'scene' = defined on this specific scene (takes precedence).
   * 'project' = inherited from the film project's global overrides.
   */
  source: "project" | "scene";
  /** True if this override matched at least once in the narration text */
  applied: boolean;
  /** How many times the override was applied */
  count: number;
}

export interface NarrationPreview {
  /** Text after all merged overrides applied — what ElevenLabs actually receives */
  ttsText: string;
  /**
   * Merged list of overrides with per-entry status.
   * Scene overrides shadow project overrides for the same `original`.
   */
  overrideStatuses: OverrideStatus[];
  /** True when ttsText differs from the input narrationText */
  hasChanges: boolean;
}

/**
 * Builds a client-side preview of what text ElevenLabs will receive for a scene.
 *
 * Merge rules:
 * - Scene-level overrides take precedence over project-level overrides for the same `original`.
 * - Shadowed entries (same `original`, both levels defined) appear once — as the scene-level entry.
 *
 * Safe for client-side use (pure function, no I/O, no side effects).
 *
 * @param narrationText  The stored narration_text for the scene
 * @param projectOverrides  film_projects.tts_overrides_json
 * @param sceneOverrides    film_scenes.scene_overrides_json
 */
export function previewNarrationText(
  narrationText: string,
  projectOverrides: TtsOverride[] | null | undefined,
  sceneOverrides: TtsOverride[] | null | undefined
): NarrationPreview {
  const project = projectOverrides ?? [];
  const scene = sceneOverrides ?? [];

  // Build a merged map keyed by trimmed `original`.
  // Scene entries overwrite project entries for the same key.
  const mergedEntries: Array<{ original: string; spoken: string; source: "project" | "scene" }> = [];
  const seen = new Set<string>();

  // Process scene overrides first so they appear first in the list (higher priority)
  for (const o of scene) {
    const key = o.original?.trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    mergedEntries.push({ original: key, spoken: o.spoken ?? "", source: "scene" });
  }

  for (const o of project) {
    const key = o.original?.trim();
    if (!key) continue;
    if (seen.has(key)) continue; // already covered by scene override
    seen.add(key);
    mergedEntries.push({ original: key, spoken: o.spoken ?? "", source: "project" });
  }

  // Apply all merged overrides and track match counts
  const statuses: OverrideStatus[] = [];
  let result = narrationText;

  for (const entry of mergedEntries) {
    const { original, spoken, source } = entry;
    const parts = result.split(original);
    const count = parts.length - 1;
    if (count > 0) {
      result = parts.join(spoken);
    }
    statuses.push({ original, spoken, source, applied: count > 0, count });
  }

  return {
    ttsText: result,
    overrideStatuses: statuses,
    hasChanges: result !== narrationText,
  };
}
