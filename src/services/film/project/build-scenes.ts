import type { FilmScene } from "@/types/film";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildNarrationText } from "@/services/film/utils/build-narration-text";
import { estimateSceneDurationFromText } from "@/services/film/utils/compute-scene-duration";

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
 * grouping pages into 2-page spreads for the film timeline.
 *
 * Idempotent: deletes existing scenes for this film project before inserting.
 */
export async function buildScenes(
  input: BuildScenesInput
): Promise<BuildScenesResult> {
  const { filmProjectId, orderId } = input;
  const adminClient = createAdminClient();

  // ── Verify film project belongs to this order ─────────────────────────────
  const { data: filmProject, error: fpError } = await adminClient
    .from("film_projects")
    .select("id, order_id")
    .eq("id", filmProjectId)
    .single();

  if (fpError || !filmProject) {
    throw new Error(`Film project not found: ${filmProjectId}`);
  }
  if ((filmProject.order_id as string) !== orderId) {
    throw new Error(
      `Film project ${filmProjectId} does not belong to order ${orderId}`
    );
  }

  // ── Load album pages ──────────────────────────────────────────────────────
  const { data: pages, error: pagesError } = await adminClient
    .from("pages")
    .select("id, page_number, page_type, text_content")
    .eq("order_id", orderId)
    .order("page_number");

  if (pagesError) {
    throw new Error(`Failed to load pages for order ${orderId}: ${pagesError.message}`);
  }
  if (!pages || pages.length === 0) {
    throw new Error("No album pages exist yet. Generate the story first.");
  }

  // ── Group pages into spreads ──────────────────────────────────────────────
  // Matches the AlbumPreview spread logic: consecutive pairs of pages.
  // cover and back_cover are excluded from the film pipeline entirely.
  const spreads = buildSpreads(
    pages as Array<{
      id: string;
      page_number: number;
      page_type: string;
      text_content: string | null;
    }>
  );

  // ── Delete existing scenes (idempotent regeneration) ──────────────────────
  const { error: deleteError } = await adminClient
    .from("film_scenes")
    .delete()
    .eq("film_project_id", filmProjectId);

  if (deleteError) {
    throw new Error(`Failed to clear old scenes: ${deleteError.message}`);
  }

  // ── Build scene rows ──────────────────────────────────────────────────────
  const sceneRows = spreads.map((spread, index) => {
    const sourceText = spread.pages
      .map((p) => p.text_content ?? "")
      .filter((t) => t.length > 0)
      .join("\n\n");

    const narrationText = buildNarrationText(sourceText);
    const durationMs = estimateSceneDurationFromText(narrationText);

    return {
      film_project_id: filmProjectId,
      page_spread_key: spread.key,
      page_ids_json: spread.pages.map((p) => p.id),
      scene_order: index + 1,
      title: spread.title,
      status: "pending" as const,
      source_text: sourceText || null,
      narration_text: narrationText || null,
      motion_preset: "ken_burns",
      transition_in: "fade",
      transition_out: "fade",
      duration_ms: durationMs,
      version: 1,
    };
  });

  // ── Insert scenes ─────────────────────────────────────────────────────────
  const { data: inserted, error: insertError } = await adminClient
    .from("film_scenes")
    .insert(sceneRows)
    .select("*");

  if (insertError || !inserted) {
    throw new Error(`Failed to insert scenes: ${insertError?.message}`);
  }

  // ── Update film project status → scenes_built ─────────────────────────────
  await adminClient
    .from("film_projects")
    .update({
      status: "scenes_built",
      updated_at: new Date().toISOString(),
    })
    .eq("id", filmProjectId);

  const scenes = inserted as unknown as FilmScene[];
  return { scenes, sceneCount: scenes.length };
}

// ── Internal spread builder ───────────────────────────────────────────────────

interface PageRow {
  id: string;
  page_number: number;
  page_type: string;
  text_content: string | null;
}

interface Spread {
  key: string;
  title: string | null;
  pages: PageRow[];
}

// Album page types excluded from the film pipeline entirely.
// cover and back_cover are album-only assets — they are not narrated, not rendered
// as film scenes, and not included in the final film assembly.
// Future intro/outro assets will be separate film concepts, not album page-derived.
// Any legacy page with page_type="dedication" is treated as a content page and paired
// into a spread, matching the album preview rendering behaviour.
const FILM_EXCLUDED_PAGE_TYPES = new Set(["cover", "back_cover"]);

/**
 * Groups album pages into spreads for the film timeline.
 * Pages of excluded types (cover, back_cover) are skipped entirely.
 * All other pages (illustration_and_text, text_only, and legacy dedication) are
 * paired into 2-page spreads, matching the album preview.
 */
function buildSpreads(pages: PageRow[]): Spread[] {
  const spreads: Spread[] = [];
  const contentPages: PageRow[] = [];

  for (const page of pages) {
    if (FILM_EXCLUDED_PAGE_TYPES.has(page.page_type)) {
      // Excluded from the film pipeline — not narrated, rendered, or assembled
      continue;
    }
    contentPages.push(page);
  }

  // Pair content pages into 2-page spreads
  let spreadIndex = 1;
  for (let i = 0; i < contentPages.length; i += 2) {
    const pair = [contentPages[i]];
    if (i + 1 < contentPages.length) {
      pair.push(contentPages[i + 1]);
    }
    spreads.push({
      key: `spread_${String(spreadIndex).padStart(2, "0")}`,
      title: null,
      pages: pair,
    });
    spreadIndex++;
  }

  return spreads;
}
