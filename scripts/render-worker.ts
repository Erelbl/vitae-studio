/**
 * Film Render Worker
 *
 * Runs OUTSIDE Vercel — on a local machine, VPS, or EC2 instance with Chrome.
 * Picks up film scenes marked as "queued" in the database and renders them
 * using Remotion (headless Chrome).
 *
 * Usage:
 *   # Render all queued scenes
 *   npm run render-worker
 *
 *   # Render specific scene IDs
 *   npx tsx scripts/render-worker.ts <sceneId1> <sceneId2> ...
 *
 *   # Poll mode — check for queued scenes every N seconds
 *   npm run render-worker:poll
 *
 * Prerequisites:
 *   1. Chrome installed on the machine
 *   2. Remotion bundle built: npm run bundle:remotion
 *   3. Environment variables set (.env.local or exported):
 *      - NEXT_PUBLIC_SUPABASE_URL
 *      - SUPABASE_SERVICE_ROLE_KEY
 *      - REMOTION_BUNDLE_PATH (optional, defaults to .remotion-bundle/)
 */

import { config as loadEnv } from "dotenv";
// Next.js stores secrets in .env.local; dotenv/config only reads .env by default.
// Load .env.local first (overrides .env), then .env as a fallback for defaults.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });
import { createClient } from "@supabase/supabase-js";
import { renderScene } from "@/services/film/render/render-scene";

// ── Environment ──────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`[render-worker] Missing required env variable: ${name}`);
    process.exit(1);
  }
  return val;
}

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

// ── Core logic ───────────────────────────────────────────────────────────────

/**
 * Finds scenes stuck in "rendering" status (updated more than 30 minutes ago)
 * and resets them to "queued" so they can be picked up again.
 *
 * This handles the case where the render worker crashed mid-render, leaving
 * scenes in the "rendering" state indefinitely.
 */
async function resetStaleRenderingScenes(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: stale, error } = await adminClient
    .from("film_scenes")
    .select("id")
    .eq("status", "rendering")
    .lt("updated_at", cutoff);

  if (error) {
    console.warn("[render-worker] Could not check for stale scenes:", error.message);
    return;
  }

  if (!stale || stale.length === 0) return;

  console.log(
    `[render-worker] Resetting ${stale.length} stale rendering scene(s) back to queued.`
  );

  await adminClient
    .from("film_scenes")
    .update({
      status: "queued",
      error_message: "Reset from stale rendering state — worker restarted",
      updated_at: new Date().toISOString(),
    })
    .in("id", stale.map((s) => s.id as string));
}

async function fetchQueuedScenes(
  specificIds?: string[]
): Promise<
  Array<{ id: string; film_project_id: string; order_id: string }>
> {
  let query = adminClient
    .from("film_scenes")
    .select("id, film_project_id, film_projects!inner(order_id)")
    .eq("status", "queued")
    .order("scene_order");

  if (specificIds && specificIds.length > 0) {
    query = query.in("id", specificIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error(
      "[render-worker] Failed to fetch queued scenes:",
      error.message
    );
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    film_project_id: row.film_project_id as string,
    order_id: (row.film_projects as unknown as { order_id: string }).order_id,
  }));
}

async function processScene(scene: {
  id: string;
  film_project_id: string;
  order_id: string;
}): Promise<boolean> {
  const {
    id: sceneId,
    film_project_id: filmProjectId,
    order_id: orderId,
  } = scene;

  // Mark as rendering
  await adminClient
    .from("film_scenes")
    .update({
      status: "rendering",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sceneId);

  console.log(`[render-worker] Rendering scene ${sceneId}...`);

  try {
    const result = await renderScene({ sceneId, orderId, filmProjectId });
    console.log(
      `[render-worker] Scene ${sceneId} rendered → ${result.renderedPath}`
    );
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[render-worker] Scene ${sceneId} failed: ${message}`);
    // renderScene already sets status to "error" and saves error_message in DB
    return false;
  }
}

async function runOnce(specificIds?: string[]): Promise<{
  rendered: number;
  failed: number;
}> {
  const scenes = await fetchQueuedScenes(specificIds);

  if (scenes.length === 0) {
    console.log("[render-worker] No queued scenes found.");
    return { rendered: 0, failed: 0 };
  }

  console.log(`[render-worker] Found ${scenes.length} queued scene(s).`);

  let rendered = 0;
  let failed = 0;

  // Track which film projects had successful renders (for last_rendered_at update)
  const successfulProjectIds = new Set<string>();

  for (const scene of scenes) {
    const success = await processScene(scene);
    if (success) {
      rendered++;
      successfulProjectIds.add(scene.film_project_id);
    } else {
      failed++;
    }
  }

  // Update last_rendered_at for projects that had at least one successful render
  if (successfulProjectIds.size > 0) {
    await adminClient
      .from("film_projects")
      .update({ last_rendered_at: new Date().toISOString() })
      .in("id", [...successfulProjectIds]);
  }

  console.log(
    `[render-worker] Done. Rendered: ${rendered}, Failed: ${failed}`
  );
  return { rendered, failed };
}

// ── CLI entry point ──────────────────────────────────────────────────────────

async function main() {
  console.log("[render-worker] Starting film render worker...");

  // Reset any scenes stuck in "rendering" from a previous crashed run
  await resetStaleRenderingScenes();

  const args = process.argv.slice(2);

  // Parse --poll flag
  const pollIdx = args.indexOf("--poll");
  let pollIntervalSec: number | null = null;
  if (pollIdx !== -1) {
    pollIntervalSec = parseInt(args[pollIdx + 1] ?? "30", 10);
    args.splice(pollIdx, 2);
  }

  // Remaining args are scene IDs
  const specificIds = args.length > 0 ? args : undefined;

  if (pollIntervalSec != null) {
    console.log(
      `[render-worker] Poll mode: checking every ${pollIntervalSec}s. Ctrl+C to stop.`
    );
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await runOnce(specificIds);
      await new Promise((resolve) =>
        setTimeout(resolve, pollIntervalSec! * 1000)
      );
    }
  } else {
    const { rendered, failed } = await runOnce(specificIds);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch((err) => {
  console.error("[render-worker] Fatal error:", err);
  process.exit(1);
});
