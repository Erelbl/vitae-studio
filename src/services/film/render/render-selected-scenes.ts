import { createAdminClient } from "@/lib/supabase/admin";
import { buildRenderHash } from "@/services/film/utils/build-render-hash";
import { renderScene } from "./render-scene";
import type { RenderSceneResult } from "./render-scene";

export interface RenderSelectedScenesInput {
  filmProjectId: string;
  orderId: string;
  /** Scene IDs to render. If omitted, renders all non-rendered (or changed) scenes. */
  sceneIds?: string[];
}

export interface RenderSelectedScenesResult {
  rendered: RenderSceneResult[];
  skipped: number;
  errors: Array<{ sceneId: string; error: string }>;
}

/**
 * Renders a batch of film scenes, skipping any whose render_hash hasn't changed.
 *
 * Processes scenes sequentially to avoid overloading the render pipeline.
 * After all scenes are attempted, updates film_project.last_rendered_at.
 */
export async function renderSelectedScenes(
  input: RenderSelectedScenesInput
): Promise<RenderSelectedScenesResult> {
  const { filmProjectId, orderId, sceneIds } = input;
  const adminClient = createAdminClient();

  // Fetch the target scenes
  let query = adminClient
    .from("film_scenes")
    .select(
      "id, scene_order, status, render_hash, narration_text, voice_id, motion_preset, transition_in, transition_out, page_ids_json"
    )
    .eq("film_project_id", filmProjectId);

  if (sceneIds && sceneIds.length > 0) {
    query = query.in("id", sceneIds);
  }

  const { data: scenes, error: scenesError } = await query.order(
    "scene_order"
  );

  if (scenesError || !scenes) {
    throw new Error(
      `Failed to fetch scenes for project ${filmProjectId}: ${scenesError?.message}`
    );
  }

  const rendered: RenderSceneResult[] = [];
  const errors: Array<{ sceneId: string; error: string }> = [];
  let skipped = 0;

  for (const scene of scenes) {
    const sceneId = scene.id as string;

    // Compute current render hash to detect changes
    const currentHash = buildRenderHash({
      narrationText: (scene.narration_text as string | null) ?? null,
      voiceId: (scene.voice_id as string | null) ?? null,
      motionPreset: (scene.motion_preset as string | null) ?? null,
      transitionIn: (scene.transition_in as string | null) ?? null,
      transitionOut: (scene.transition_out as string | null) ?? null,
      pageIds: (scene.page_ids_json as string[] | null) ?? null,
    });

    // Skip if already rendered with the same inputs
    if (
      scene.status === "rendered" &&
      (scene.render_hash as string | null) === currentHash
    ) {
      skipped++;
      continue;
    }

    try {
      const result = await renderScene({ sceneId, orderId, filmProjectId });
      rendered.push(result);
    } catch (err) {
      errors.push({
        sceneId,
        error: err instanceof Error ? err.message : "Render failed",
      });
    }
  }

  // Update film project render timestamp
  if (rendered.length > 0) {
    await adminClient
      .from("film_projects")
      .update({ last_rendered_at: new Date().toISOString() })
      .eq("id", filmProjectId);
  }

  return { rendered, skipped, errors };
}
