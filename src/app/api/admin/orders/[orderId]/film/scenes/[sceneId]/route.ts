import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/admin/orders/[orderId]/film/scenes/[sceneId]
 *
 * Toggles per-scene flags. Currently supports:
 *   { is_unified_spread: boolean }
 *
 * Unified spread mode:
 *   - When enabled  (true):  spread_video_path is cleared so a new spread Kling
 *     video is generated on the next render. right/left page paths are kept in
 *     case the admin toggles back later (they are simply ignored during render).
 *   - When disabled (false): spread_video_path is cleared (no longer needed).
 *     The per-page right/left videos are reused on the next render (still cached).
 *
 * In both cases the scene status is reset to "pending" if it was previously
 * "rendered" or "error", so the admin is prompted to re-render.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string; sceneId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId, sceneId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch = body as Record<string, unknown>;

  // Only is_unified_spread is patchable via this route for now.
  if (typeof patch.is_unified_spread !== "boolean") {
    return NextResponse.json(
      { error: "is_unified_spread must be a boolean" },
      { status: 400 }
    );
  }

  const isUnifiedSpread = patch.is_unified_spread;

  const adminClient = createAdminClient();

  // Verify the scene belongs to a film project for this order.
  const { data: scene, error: sceneError } = await adminClient
    .from("film_scenes")
    .select("id, film_project_id, status")
    .eq("id", sceneId)
    .single();

  if (sceneError || !scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const { data: project, error: projectError } = await adminClient
    .from("film_projects")
    .select("id")
    .eq("id", scene.film_project_id as string)
    .eq("order_id", orderId)
    .single();

  if (projectError || !project) {
    return NextResponse.json(
      { error: "Scene does not belong to this order" },
      { status: 403 }
    );
  }

  // Determine whether the scene needs to be re-queued.
  // If the flag changes on a scene that was already rendered, it must be re-rendered.
  const currentStatus = scene.status as string;
  const needsRequeue = currentStatus === "rendered" || currentStatus === "error";

  const updatePayload: Record<string, unknown> = {
    is_unified_spread: isUnifiedSpread,
    // Always clear the spread video path — it will be regenerated on the next render
    // regardless of the toggle direction (avoids stale video from a previous setting).
    spread_video_path: null,
    updated_at: new Date().toISOString(),
  };

  if (needsRequeue) {
    updatePayload.status = "pending";
    updatePayload.error_message = null;
  }

  const { data: updated, error: updateError } = await adminClient
    .from("film_scenes")
    .update(updatePayload)
    .eq("id", sceneId)
    .select("*")
    .single();

  if (updateError || !updated) {
    console.error(
      `[scene-patch] PATCH error for scene ${sceneId}: ${updateError?.message}`
    );
    return NextResponse.json(
      { error: updateError?.message ?? "Failed to update scene" },
      { status: 500 }
    );
  }

  return NextResponse.json({ scene: updated });
}
