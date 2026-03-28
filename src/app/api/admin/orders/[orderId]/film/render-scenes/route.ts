import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildRenderHash } from "@/services/film/utils/build-render-hash";

/**
 * POST /api/admin/orders/[orderId]/film/render-scenes
 * Body: { sceneIds?: string[] }
 *
 * Queues selected scenes (or all scenes whose inputs have changed) for rendering.
 * Scenes already rendered with matching render_hash are skipped.
 * Actual rendering is performed by the render worker (scripts/render-worker.ts).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;

  // Parse body
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — means "queue all scenes"
  }

  const sceneIds =
    Array.isArray(body?.sceneIds) &&
    (body.sceneIds as unknown[]).every((id) => typeof id === "string")
      ? (body.sceneIds as string[])
      : undefined;

  // Resolve film project for this order
  const adminClient = createAdminClient();
  const { data: filmProject, error: fpError } = await adminClient
    .from("film_projects")
    .select("id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (fpError) {
    return NextResponse.json(
      { error: `Failed to look up film project: ${fpError.message}` },
      { status: 500 }
    );
  }
  if (!filmProject) {
    return NextResponse.json(
      { error: "No film project found for this order." },
      { status: 404 }
    );
  }

  const filmProjectId = filmProject.id as string;

  // Fetch target scenes
  let query = adminClient
    .from("film_scenes")
    .select(
      "id, status, render_hash, narration_text, voice_id, motion_preset, transition_in, transition_out, page_ids_json"
    )
    .eq("film_project_id", filmProjectId);

  if (sceneIds && sceneIds.length > 0) {
    query = query.in("id", sceneIds);
  }

  const { data: scenes, error: scenesError } = await query.order(
    "scene_order"
  );

  if (scenesError || !scenes) {
    return NextResponse.json(
      { error: `Failed to fetch scenes: ${scenesError?.message}` },
      { status: 500 }
    );
  }

  let queued = 0;
  let skipped = 0;

  for (const scene of scenes) {
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

    // Mark as queued. Clear stale progress fields so the UI doesn't show a
    // previous run's progress after re-queuing.
    await adminClient
      .from("film_scenes")
      .update({
        status: "queued",
        error_message: null,
        render_stage: null,
        render_progress_pct: 0,
        render_stage_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scene.id as string);

    queued++;
  }

  return NextResponse.json({
    queued,
    skipped,
    message:
      queued > 0
        ? `${queued} scene(s) queued for rendering. Run the render worker to process them.`
        : "No scenes needed queuing (all up to date).",
  });
}
