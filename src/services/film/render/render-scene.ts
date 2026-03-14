export interface RenderSceneInput {
  sceneId: string;
  /** Film dimensions and FPS from filmEnv or overrides */
  width?: number;
  height?: number;
  fps?: number;
}

export interface RenderSceneResult {
  renderedPath: string;
  thumbnailPath: string;
  durationMs: number;
  renderHash: string;
}

/**
 * Renders a single film scene to video.
 * Combines the scene's image(s) with Ken Burns motion and narration audio.
 *
 * TODO: Implement scene rendering pipeline:
 * - Fetch scene data + associated page images
 * - Apply motion preset (Ken Burns, etc.)
 * - Overlay narration audio
 * - Apply transition_in / transition_out
 * - Encode to video segment
 * - Upload to film storage
 * - Update film_scenes row with rendered_scene_path + render_hash
 */
export async function renderScene(
  _input: RenderSceneInput
): Promise<RenderSceneResult> {
  // TODO: Implement
  throw new Error("renderScene not yet implemented");
}
