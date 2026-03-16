import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TtsOverride } from "@/types/film";

function validateOverrides(raw: unknown): TtsOverride[] | null {
  if (!Array.isArray(raw)) return null;
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    if (typeof item.original !== "string") return null;
    if (typeof item.spoken !== "string") return null;
  }
  if (raw.length > 50) return null; // per-scene cap
  return raw as TtsOverride[];
}

/**
 * PATCH /api/admin/orders/[orderId]/film/scenes/[sceneId]/overrides
 *
 * Saves per-scene pronunciation overrides.
 * These take precedence over project-level overrides (film_projects.tts_overrides_json)
 * for the same `original` key when generating scene audio.
 *
 * Applied at TTS time only — never modifies stored narration_text or album text.
 *
 * Body: { overrides: TtsOverride[] }
 * Returns: { overrides: TtsOverride[] }
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

  const overrides = validateOverrides(
    (body as Record<string, unknown>)?.overrides
  );
  if (overrides === null) {
    return NextResponse.json(
      {
        error:
          "overrides must be an array of { original: string, spoken: string } (max 50 entries)",
      },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // Verify the scene belongs to a film project for this order
  const { data: scene, error: sceneError } = await adminClient
    .from("film_scenes")
    .select("id, film_project_id")
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

  // Persist overrides. Store null when the list is empty to avoid storing [].
  const { data: updated, error } = await adminClient
    .from("film_scenes")
    .update({
      scene_overrides_json: overrides.length > 0 ? overrides : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sceneId)
    .select("id, scene_overrides_json")
    .single();

  if (error || !updated) {
    console.error(
      `[scene-overrides] PATCH error for scene ${sceneId}: ${error?.message}`
    );
    return NextResponse.json(
      { error: error?.message ?? "Failed to save scene overrides" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    overrides: (updated.scene_overrides_json as TtsOverride[] | null) ?? [],
  });
}
