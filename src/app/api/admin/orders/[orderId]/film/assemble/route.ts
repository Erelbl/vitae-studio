import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/orders/[orderId]/film/assemble
 *
 * Queues the final film for assembly by setting the project status to "rendering".
 * The render worker picks up projects in "rendering" status, validates all scenes
 * are rendered, and runs the assembly (ffmpeg-based concatenation with transitions).
 *
 * Prerequisites:
 * - Film project must exist
 * - All content scenes (excluding cover/back_cover) must be either "rendered" (have an MP4)
 *   OR "narration_ready" with duration_ms set (have audio).
 *   narration_ready scenes are automatically queued for rendering; the render
 *   worker renders them first, then auto-assembles once all are done.
 *
 * This does NOT run assembly inline — it only queues it. The render worker
 * (scripts/render-worker.ts) performs the actual assembly outside Vercel.
 */
export async function POST(
  _req: NextRequest,
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
  const adminClient = createAdminClient();

  // Fetch film project
  const { data: filmProject, error: fpError } = await adminClient
    .from("film_projects")
    .select("id, status")
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

  // Fetch all scenes for validation
  // Include duration_ms so we can verify narration_ready scenes have a duration set.
  const { data: rawScenes, error: scenesErr } = await adminClient
    .from("film_scenes")
    .select("id, scene_order, status, rendered_scene_path, duration_ms, page_spread_key")
    .eq("film_project_id", filmProject.id as string)
    .order("scene_order");

  if (scenesErr) {
    return NextResponse.json(
      { error: `Failed to fetch scenes: ${scenesErr.message}` },
      { status: 500 }
    );
  }

  // Exclude album-only page types — safety net for projects built before this exclusion
  const FILM_EXCLUDED_SPREAD_KEYS = new Set(["cover", "back_cover"]);
  const scenes = (rawScenes ?? []).filter(
    (s) => !FILM_EXCLUDED_SPREAD_KEYS.has((s.page_spread_key as string | null) ?? "")
  );

  if (scenes.length === 0) {
    return NextResponse.json(
      { error: "No scenes found. Build scenes first." },
      { status: 400 }
    );
  }

  // A scene is assembly-ready if:
  //   - status === "rendered"         → already has an MP4; can be assembled directly
  //   - status === "narration_ready"  → has audio and a confirmed duration.
  //     We queue it for rendering now; the render worker will render it first,
  //     then auto-assemble once all are done.
  //
  // Any other status (pending, queued, rendering, error) means the scene is not yet
  // ready and assembly must be blocked.
  const notReady = scenes.filter(
    (s) =>
      s.status !== "rendered" &&
      !(s.status === "narration_ready" && s.duration_ms != null)
  );
  if (notReady.length > 0) {
    const details = notReady
      .map((s) => `#${s.scene_order} (${s.status})`)
      .join(", ");
    return NextResponse.json(
      {
        error: `Cannot assemble: ${notReady.length} scene(s) not ready: ${details}`,
      },
      { status: 400 }
    );
  }

  // Sanity-check: already-rendered scenes must have a video path.
  const missingVideo = scenes.filter(
    (s) => s.status === "rendered" && !s.rendered_scene_path
  );
  if (missingVideo.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot assemble: ${missingVideo.length} rendered scene(s) missing video path.`,
      },
      { status: 400 }
    );
  }

  // Queue narration_ready scenes for rendering.
  // The render worker will render them first; once all scenes are "rendered" it
  // will detect this project (status = "rendering") and run the assembly automatically.
  const toQueue = scenes.filter(
    (s) => s.status === "narration_ready" && s.duration_ms != null
  );
  if (toQueue.length > 0) {
    const { error: queueErr } = await adminClient
      .from("film_scenes")
      .update({
        status: "queued",
        render_job_type: "full_render",
        render_video_target: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .in(
        "id",
        toQueue.map((s) => s.id as string)
      );
    if (queueErr) {
      return NextResponse.json(
        { error: `Failed to queue scenes for rendering: ${queueErr.message}` },
        { status: 500 }
      );
    }
  }

  // Queue assembly by setting project status to "rendering"
  const { error: updateError } = await adminClient
    .from("film_projects")
    .update({
      status: "rendering",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", filmProject.id as string);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to queue assembly: ${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    queued: true,
    filmProjectId: filmProject.id,
    sceneCount: scenes.length,
    queuedForRender: toQueue.length,
    message:
      toQueue.length > 0
        ? `Film assembly queued. ${toQueue.length} scene(s) queued for rendering; the render worker will render them then assemble the final film.`
        : "Film assembly queued. The render worker will assemble the final film.",
  });
}
