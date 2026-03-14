import type { FilmScene } from "@/types/film";

export interface BuildScenesInput {
  filmProjectId: string;
  orderId: string;
}

export interface BuildScenesResult {
  scenes: FilmScene[];
  sceneCount: number;
}

/**
 * Reads the album pages for an order and creates film_scenes entries,
 * grouping pages into spreads for the film timeline.
 *
 * TODO: Implement page-to-scene mapping logic:
 * - Fetch pages for the order
 * - Group into 2-page spreads (matching album preview logic)
 * - Create film_scenes rows with source_text from page text_content
 * - Set scene_order sequentially
 */
export async function buildScenes(
  _input: BuildScenesInput
): Promise<BuildScenesResult> {
  // TODO: Implement
  throw new Error("buildScenes not yet implemented");
}
