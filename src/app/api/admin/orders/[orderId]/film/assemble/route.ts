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
 * - All scenes must be in "rendered" status
 * - Film project must exist
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
  const { data: scenes, error: scenesErr } = await adminClient
    .from("film_scenes")
    .select("id, scene_order, status, rendered_scene_path")
    .eq("film_project_id", filmProject.id as string)
    .order("scene_order");

  if (scenesErr) {
    return NextResponse.json(
      { error: `Failed to fetch scenes: ${scenesErr.message}` },
      { status: 500 }
    );
  }

  if (!scenes || scenes.length === 0) {
    return NextResponse.json(
      { error: "No scenes found. Build scenes first." },
      { status: 400 }
    );
  }

  // Validate all scenes are rendered
  const notRendered = scenes.filter((s) => s.status !== "rendered");
  if (notRendered.length > 0) {
    const details = notRendered
      .map((s) => `#${s.scene_order} (${s.status})`)
      .join(", ");
    return NextResponse.json(
      {
        error: `Cannot assemble: ${notRendered.length} scene(s) not rendered: ${details}`,
      },
      { status: 400 }
    );
  }

  const missingVideo = scenes.filter((s) => !s.rendered_scene_path);
  if (missingVideo.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot assemble: ${missingVideo.length} scene(s) missing rendered video.`,
      },
      { status: 400 }
    );
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
    message:
      "Film assembly queued. The render worker will assemble the final film.",
  });
}
