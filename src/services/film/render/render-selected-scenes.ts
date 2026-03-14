import type { RenderSceneResult } from "./render-scene";

export interface RenderSelectedScenesInput {
  filmProjectId: string;
  /** Scene IDs to render. If empty, renders all scenes needing re-render. */
  sceneIds?: string[];
}

export interface RenderSelectedScenesResult {
  rendered: RenderSceneResult[];
  skipped: number;
  errors: Array<{ sceneId: string; error: string }>;
}

/**
 * Renders multiple scenes, skipping any whose render_hash hasn't changed.
 *
 * TODO: Implement:
 * - Fetch scenes for the film project
 * - Filter to sceneIds (or all if not specified)
 * - Compute render_hash for each, skip if unchanged
 * - Call renderScene for each that needs rendering
 * - Update film_project.last_rendered_at
 */
export async function renderSelectedScenes(
  _input: RenderSelectedScenesInput
): Promise<RenderSelectedScenesResult> {
  // TODO: Implement
  throw new Error("renderSelectedScenes not yet implemented");
}
