/**
 * Film Render Worker
 *
 * Runs OUTSIDE Vercel — on a local machine, VPS, or EC2 instance with Chrome.
 * Picks up film scenes marked as "queued" in the database and renders them
 * using Remotion (headless Chrome).
 *
 * Usage:
 *   # Run once (process all currently queued scenes, then exit)
 *   npm run render-worker
 *
 *   # Watch mode — poll continuously, process scenes as they are queued
 *   npm run render-worker:watch
 *
 *   # Custom poll interval (seconds)
 *   npx tsx scripts/render-worker.ts --poll 60
 *
 *   # Render specific scene IDs once, then exit
 *   npx tsx scripts/render-worker.ts <sceneId1> <sceneId2> ...
 *
 * Additional modes:
 *   # Assemble final film for a specific order (by orderId)
 *   npx tsx scripts/render-worker.ts --assemble <orderId>
 *
 *   In watch mode, the worker also picks up film projects queued for assembly
 *   (status = "rendering" with all scenes rendered) automatically.
 *
 * Prerequisites:
 *   1. Chrome installed on the machine
 *   2. Remotion bundle built:  npm run bundle:remotion  (outputs to .remotion-bundle/)
 *   3. ffmpeg + ffprobe installed (for final film assembly)
 *   4. Environment variables set in .env.local (loaded automatically):
 *      - NEXT_PUBLIC_SUPABASE_URL
 *      - SUPABASE_SERVICE_ROLE_KEY
 *      - REMOTION_BUNDLE_PATH (optional — overrides default .remotion-bundle/ lookup)
 */

import { config as loadEnv } from "dotenv";
// Next.js stores secrets in .env.local; dotenv/config only reads .env by default.
// Load .env.local first (overrides .env), then .env as a fallback for defaults.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { createClient } from "@supabase/supabase-js";
import { renderScene } from "@/services/film/render/render-scene";
import { assembleFilm } from "@/services/film/render/assemble-film";
import { buildRenderHash } from "@/services/film/utils/build-render-hash";

// ── Logging ───────────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function log(msg: string) {
  console.log(`[${ts()}] [render-worker] ${msg}`);
}

function warn(msg: string) {
  console.warn(`[${ts()}] [render-worker] WARN ${msg}`);
}

function err(msg: string) {
  console.error(`[${ts()}] [render-worker] ERROR ${msg}`);
}

// ── Environment ───────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    err(`Missing required env variable: ${name}`);
    process.exit(1);
  }
  return val;
}

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Finds scenes stuck in "rendering" status (updated more than 30 minutes ago)
 * and resets them to "queued" so they can be picked up again.
 *
 * Called once at startup and then every STALE_CHECK_INTERVAL_MS in watch mode.
 */
async function resetStaleRenderingScenes(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: stale, error } = await adminClient
    .from("film_scenes")
    .select("id")
    .eq("status", "rendering")
    .lt("updated_at", cutoff);

  if (error) {
    warn(`Could not check for stale scenes: ${error.message}`);
    return;
  }

  if (!stale || stale.length === 0) return;

  log(`Resetting ${stale.length} stale rendering scene(s) back to queued.`);

  await adminClient
    .from("film_scenes")
    .update({
      status: "queued",
      error_message: "Reset from stale rendering state — worker restarted",
      updated_at: new Date().toISOString(),
    })
    .in("id", stale.map((s) => s.id as string));
}

/**
 * Finds rendered scenes whose stored render_hash was computed WITHOUT Kling page
 * video paths, but which now have right_page_video_path or left_page_video_path set.
 *
 * When Kling videos are added after a scene was rendered, the expected hash (which
 * now includes the Kling paths) differs from the stored hash → the scene needs
 * re-rendering so the site picks up the Kling videos automatically.
 *
 * Called once at startup (and after each render batch in watch mode).
 */
async function requeueKlingStaleScenesOnce(): Promise<void> {
  const { data: scenes, error } = await adminClient
    .from("film_scenes")
    .select(
      "id, narration_text, voice_id, motion_preset, transition_in, transition_out, " +
      "page_ids_json, render_hash, right_page_video_path, left_page_video_path"
    )
    .eq("status", "rendered")
    .or("right_page_video_path.not.is.null,left_page_video_path.not.is.null");

  if (error) {
    warn(`Could not check for stale Kling scenes: ${error.message}`);
    return;
  }
  if (!scenes || scenes.length === 0) return;

  type KlingSceneRow = {
    id: string;
    narration_text: string | null;
    voice_id: string | null;
    motion_preset: string | null;
    transition_in: string | null;
    transition_out: string | null;
    page_ids_json: string[] | null;
    render_hash: string | null;
    right_page_video_path: string | null;
    left_page_video_path: string | null;
  };

  const toRequeue: string[] = [];

  for (const scene of scenes as unknown as KlingSceneRow[]) {
    const expectedHash = buildRenderHash({
      narrationText:  scene.narration_text,
      voiceId:        scene.voice_id,
      motionPreset:   scene.motion_preset,
      transitionIn:   scene.transition_in,
      transitionOut:  scene.transition_out,
      pageIds:        scene.page_ids_json,
      klingRightPath: scene.right_page_video_path,
      klingLeftPath:  scene.left_page_video_path,
    });

    if (expectedHash !== scene.render_hash) {
      toRequeue.push(scene.id);
    }
  }

  if (toRequeue.length === 0) return;

  log(
    `Re-queueing ${toRequeue.length} scene(s) rendered without Kling page videos ` +
    `(hash changed) — they will be re-rendered with Kling automatically.`
  );

  // Reset render_job_type to "full_render" so a stale "regenerate_video_only"
  // job type from a previous targeted regeneration never re-applies to these
  // automatically re-queued scenes.
  await adminClient
    .from("film_scenes")
    .update({
      status: "queued",
      render_job_type: "full_render",
      render_video_target: null,
      error_message: "Re-queued: Kling page videos were added/changed since last render",
      updated_at: new Date().toISOString(),
    })
    .in("id", toRequeue);
}

async function fetchQueuedScenes(
  specificIds?: string[]
): Promise<Array<{
  id: string;
  film_project_id: string;
  order_id: string;
  render_job_type: string;
  render_video_target: string | null;
}>> {
  let query = adminClient
    .from("film_scenes")
    .select(
      "id, film_project_id, render_job_type, render_video_target, film_projects!inner(order_id)"
    )
    .eq("status", "queued")
    .order("scene_order");

  if (specificIds && specificIds.length > 0) {
    query = query.in("id", specificIds);
  }

  const { data, error } = await query;

  if (error) {
    err(`Failed to fetch queued scenes: ${error.message}`);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    film_project_id: row.film_project_id as string,
    order_id: (row.film_projects as unknown as { order_id: string }).order_id,
    render_job_type: (row.render_job_type as string | null) ?? "full_render",
    render_video_target: (row.render_video_target as string | null) ?? null,
  }));
}

async function processScene(scene: {
  id: string;
  film_project_id: string;
  order_id: string;
  render_job_type: string;
  render_video_target: string | null;
}): Promise<boolean> {
  const { id: sceneId, film_project_id: filmProjectId, order_id: orderId } = scene;

  await adminClient
    .from("film_scenes")
    .update({
      status: "rendering",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sceneId);

  // For regenerate_video_only: clear only the requested Kling source asset(s) so
  // renderScene treats them as not-yet-generated and re-runs Kling for those targets.
  // renderScene reuses cached paths when present — clearing is the only signal to
  // regenerate. Non-targeted paths are left intact and will be included in the
  // full final scene render that always follows this step.
  if (scene.render_job_type === "regenerate_video_only" && scene.render_video_target) {
    const clearFields: Record<string, null> = {};
    const t = scene.render_video_target;
    if (t === "right" || t === "both") clearFields.right_page_video_path = null;
    if (t === "left"  || t === "both") clearFields.left_page_video_path  = null;
    if (t === "spread")                clearFields.spread_video_path      = null;
    if (Object.keys(clearFields).length > 0) {
      log(`Clearing Kling path(s) for scene ${sceneId} (target: ${t}) — full scene render follows`);
      const { error: clearError } = await adminClient
        .from("film_scenes")
        .update({ ...clearFields, updated_at: new Date().toISOString() })
        .eq("id", sceneId);
      if (clearError) {
        err(`Failed to clear Kling path(s) for scene ${sceneId}: ${clearError.message} — aborting render to avoid stale-cache reuse`);
        await adminClient.from("film_scenes").update({
          status: "error",
          error_message: `regenerate_video_only clear failed: ${clearError.message}`,
          updated_at: new Date().toISOString(),
        }).eq("id", sceneId);
        return false;
      }
    }
  }

  const jobLabel =
    scene.render_job_type === "regenerate_video_only"
      ? ` [regen-video:${scene.render_video_target ?? "?"}]`
      : "";
  log(`Rendering scene ${sceneId}${jobLabel}...`);

  try {
    const result = await renderScene({ sceneId, orderId, filmProjectId });
    log(`Scene ${sceneId} rendered → ${result.renderedPath}`);

    // After any regenerate_video_only job, reset the job-type fields to "full_render"
    // so that if this scene is automatically re-queued later (e.g. by
    // requeueKlingStaleScenesOnce), the stale targeted job type cannot propagate and
    // incorrectly clear the wrong Kling path(s) on the next render.
    if (scene.render_job_type === "regenerate_video_only") {
      await adminClient
        .from("film_scenes")
        .update({
          render_job_type: "full_render",
          render_video_target: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
    }

    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    err(`Scene ${sceneId} failed: ${message}`);
    // renderScene already sets status="error" and saves error_message in DB
    return false;
  }
}

async function runOnce(
  specificIds?: string[],
  silent = false
): Promise<{ rendered: number; failed: number }> {
  const scenes = await fetchQueuedScenes(specificIds);

  if (scenes.length === 0) {
    if (!silent) log("No queued scenes found.");
    return { rendered: 0, failed: 0 };
  }

  log(`Found ${scenes.length} queued scene(s).`);

  let rendered = 0;
  let failed = 0;
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

  // Update last_rendered_at for projects that had at least one success
  if (successfulProjectIds.size > 0) {
    await adminClient
      .from("film_projects")
      .update({ last_rendered_at: new Date().toISOString() })
      .in("id", [...successfulProjectIds]);
  }

  log(`Done. Rendered: ${rendered}, Failed: ${failed}`);
  return { rendered, failed };
}

// ── Film assembly ────────────────────────────────────────────────────────

/**
 * Fetch film projects that are queued for assembly.
 * A project is ready for assembly when status = "rendering" and all its scenes
 * are in "rendered" status.
 */
async function fetchAssemblyReadyProjects(): Promise<
  Array<{ id: string; order_id: string }>
> {
  // Find projects with status "rendering" (set by the assemble API route)
  const { data: projects, error } = await adminClient
    .from("film_projects")
    .select("id, order_id")
    .eq("status", "rendering");

  if (error || !projects || projects.length === 0) return [];

  // For each candidate, verify all scenes are rendered
  const ready: Array<{ id: string; order_id: string }> = [];

  // cover and back_cover are excluded from the film pipeline and from assembly.
  const FILM_EXCLUDED_SPREAD_KEYS = new Set(["cover", "back_cover"]);

  for (const proj of projects) {
    const { data: scenes } = await adminClient
      .from("film_scenes")
      .select("status, page_spread_key")
      .eq("film_project_id", proj.id as string);

    if (!scenes || scenes.length === 0) continue;

    const assemblyScenes = scenes.filter(
      (s) => !FILM_EXCLUDED_SPREAD_KEYS.has((s.page_spread_key as string | null) ?? "")
    );
    if (assemblyScenes.length === 0) continue;

    const allRendered = assemblyScenes.every((s) => s.status === "rendered");
    if (allRendered) {
      ready.push({
        id: proj.id as string,
        order_id: proj.order_id as string,
      });
    }
  }

  return ready;
}

/**
 * Run assembly for all projects that are ready.
 * Returns count of assembled and failed.
 */
async function runAssembly(
  silent = false
): Promise<{ assembled: number; failed: number }> {
  const projects = await fetchAssemblyReadyProjects();

  if (projects.length === 0) {
    if (!silent) log("No projects ready for assembly.");
    return { assembled: 0, failed: 0 };
  }

  log(`Found ${projects.length} project(s) ready for assembly.`);

  let assembled = 0;
  let failed = 0;

  for (const proj of projects) {
    log(`Assembling film for project ${proj.id} (order ${proj.order_id})...`);

    try {
      const result = await assembleFilm({
        orderId: proj.order_id,
        filmProjectId: proj.id,
      });
      log(
        `Film assembled → ${result.finalVideoPath} (${Math.round(result.finalDurationSeconds)}s)`
      );
      assembled++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      err(`Assembly failed for project ${proj.id}: ${message}`);
      // assembleFilm already sets status="error" and saves error_message in DB
      failed++;
    }
  }

  log(`Assembly done. Assembled: ${assembled}, Failed: ${failed}`);
  return { assembled, failed };
}

/**
 * Assemble a specific order's film project directly (CLI mode).
 */
async function assembleOrder(orderId: string): Promise<void> {
  log(`Looking up film project for order ${orderId}...`);

  const { data: project, error: projErr } = await adminClient
    .from("film_projects")
    .select("id, status")
    .eq("order_id", orderId)
    .maybeSingle();

  if (projErr || !project) {
    err(`No film project found for order ${orderId}`);
    process.exit(1);
  }

  log(`Found project ${project.id as string} (status: ${project.status as string})`);

  // Set status to rendering so assembleFilm can proceed
  await adminClient
    .from("film_projects")
    .update({
      status: "rendering",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", project.id as string);

  try {
    const result = await assembleFilm({
      orderId,
      filmProjectId: project.id as string,
    });
    log(
      `Film assembled successfully → ${result.finalVideoPath} (${Math.round(result.finalDurationSeconds)}s)`
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    err(`Assembly failed: ${message}`);
    process.exit(1);
  }
}

// ── Watch mode ────────────────────────────────────────────────────────────────

// Run stale-scene recovery every 10 minutes in watch mode
const STALE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

async function runWatch(intervalSec: number): Promise<never> {
  log(`Watch mode: polling every ${intervalSec}s. Ctrl+C to stop.`);

  let lastStaleCheck = Date.now();
  let idleSince: number | null = null;

  // Graceful shutdown on SIGTERM (e.g. from process manager)
  process.on("SIGTERM", () => {
    log("Received SIGTERM — shutting down.");
    process.exit(0);
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // Periodic stale-scene recovery (not just at startup)
      if (Date.now() - lastStaleCheck >= STALE_CHECK_INTERVAL_MS) {
        await resetStaleRenderingScenes();
        lastStaleCheck = Date.now();
      }

      const { rendered } = await runOnce(
        undefined,
        /* silent = */ true // suppress "no scenes" on every idle poll
      );

      // Also check for film projects ready for assembly
      const { assembled } = await runAssembly(/* silent = */ true);

      if (rendered > 0 || assembled > 0) {
        // Something was processed — check whether new Kling paths need re-renders
        await requeueKlingStaleScenesOnce();
        idleSince = null;
      } else {
        // Log an "idle" heartbeat once per minute so logs confirm the worker
        // is alive even when there's nothing to render.
        if (idleSince === null) {
          idleSince = Date.now();
        } else if (Date.now() - idleSince >= 60_000) {
          log("Idle — waiting for queued scenes or assembly jobs.");
          idleSince = Date.now(); // reset so it logs again in another minute
        }
      }
    } catch (e) {
      // Catch unexpected errors so a transient failure doesn't kill the loop
      err(`Unexpected error in poll loop: ${e instanceof Error ? e.message : String(e)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));
  }
}

// ── CLI entry point ───────────────────────────────────────────────────────────

async function main() {
  log("Starting film render worker.");
  log(`App base URL: ${(process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")} (proxy for assembly clip URLs)`);

  // Reset any scenes stuck in "rendering" from a previous crashed run
  await resetStaleRenderingScenes();

  // Re-queue any rendered scenes whose Kling page videos were added after the last render
  await requeueKlingStaleScenesOnce();

  const args = process.argv.slice(2);

  // Parse --poll flag
  const pollIdx = args.indexOf("--poll");
  let pollIntervalSec: number | null = null;
  if (pollIdx !== -1) {
    pollIntervalSec = parseInt(args[pollIdx + 1] ?? "30", 10);
    args.splice(pollIdx, 2);
  }

  // Parse --assemble flag (takes an orderId)
  const assembleIdx = args.indexOf("--assemble");
  let assembleOrderId: string | null = null;
  if (assembleIdx !== -1) {
    assembleOrderId = args[assembleIdx + 1] ?? null;
    if (!assembleOrderId) {
      err("--assemble requires an orderId argument.");
      process.exit(1);
    }
    args.splice(assembleIdx, 2);
  }

  // --assemble mode: assemble a specific order's film, then exit
  if (assembleOrderId) {
    await assembleOrder(assembleOrderId);
    process.exit(0);
  }

  // Remaining args are scene IDs (only valid in single-run mode)
  const specificIds = args.length > 0 ? args : undefined;

  if (pollIntervalSec != null) {
    if (specificIds) {
      err("--poll cannot be combined with specific scene IDs.");
      process.exit(1);
    }
    await runWatch(pollIntervalSec);
  } else {
    const { failed } = await runOnce(specificIds);
    // In general scan mode (no specific scene IDs), also process any assembly jobs.
    // This means `npm run render-worker` handles both scene rendering and film assembly.
    let assemblyFailed = 0;
    if (!specificIds) {
      const { failed: af } = await runAssembly();
      assemblyFailed = af;
    }
    process.exit(failed > 0 || assemblyFailed > 0 ? 1 : 0);
  }
}

// ── Process-level crash guards ────────────────────────────────────────────────
// Remotion's renderer (Chrome + ffmpeg) can emit unhandled write-EOF errors when
// network fetch failures break the internal pipe between Chrome and the Node.js
// OffthreadVideoServer. Without these guards, the worker process dies and the
// assembly job is lost with no DB update. With them, the error is logged and the
// crash is surfaced via assembleFilm's own catch block (which writes status=error).

process.on("uncaughtException", (e) => {
  err(`Uncaught exception (worker kept alive): ${e instanceof Error ? e.message : String(e)}`);
  if (e instanceof Error && e.stack) err(e.stack);
});

process.on("unhandledRejection", (reason) => {
  err(`Unhandled rejection (worker kept alive): ${reason instanceof Error ? reason.message : String(reason)}`);
});

main().catch((e) => {
  err(`Fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
