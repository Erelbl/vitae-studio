import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/orders/[orderId]/film/render-scene
 * Body: { sceneId: string }
 *
 * Queues a single film scene for rendering by marking it as "queued".
 * Actual rendering is performed by the render worker (scripts/render-worker.ts),
 * NOT inside this Vercel request handler.
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  const sceneId =
    typeof b?.sceneId === "string" ? (b.sceneId as string) : null;

  if (!sceneId) {
    return NextResponse.json(
      { error: "sceneId is required" },
      { status: 400 }
    );
  }

  // Optional job type — defaults to full_render if not provided
  const VALID_JOB_TYPES = ["full_render", "regenerate_video_only"] as const;
  const VALID_TARGETS   = ["right", "left", "both", "spread"] as const;

  const jobType: string =
    typeof b?.jobType === "string" &&
    VALID_JOB_TYPES.includes(b.jobType as (typeof VALID_JOB_TYPES)[number])
      ? (b.jobType as string)
      : "full_render";

  const videoTarget: string | null =
    jobType === "regenerate_video_only" &&
    typeof b?.videoTarget === "string" &&
    VALID_TARGETS.includes(b.videoTarget as (typeof VALID_TARGETS)[number])
      ? (b.videoTarget as string)
      : null;

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

  // Verify scene belongs to this film project
  const { data: scene, error: sceneError } = await adminClient
    .from("film_scenes")
    .select("id, film_project_id, status")
    .eq("id", sceneId)
    .single();

  if (sceneError || !scene) {
    return NextResponse.json(
      { error: `Scene not found: ${sceneId}` },
      { status: 404 }
    );
  }

  if ((scene.film_project_id as string) !== (filmProject.id as string)) {
    return NextResponse.json(
      { error: "Scene does not belong to this order's film project." },
      { status: 400 }
    );
  }

  // Mark scene as queued with the requested job type.
  // Clear stale progress fields so the UI doesn't show a previous run's progress.
  const { error: updateError } = await adminClient
    .from("film_scenes")
    .update({
      status: "queued",
      render_job_type: jobType,
      render_video_target: videoTarget,
      error_message: null,
      render_stage: null,
      render_progress_pct: 0,
      render_stage_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sceneId);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to queue scene: ${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    queued: 1,
    sceneId,
    message: "Scene queued for rendering. Run the render worker to process it.",
  });
}
