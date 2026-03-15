import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSceneAudio } from "@/services/film/narration/generate-scene-audio";

/**
 * POST /api/admin/orders/[orderId]/film/generate-audio
 *
 * Generates ElevenLabs narration audio for one or more film scenes.
 *
 * Body: { sceneIds?: string[] }
 *   - If sceneIds is provided, generates audio only for those scenes.
 *   - If omitted (or empty), generates audio for ALL scenes with narration_text.
 *
 * Requirements:
 *   - Film project must exist for the order.
 *   - selected_voice_id must be set (choose a voice first).
 *   - narration_mode must not be "none".
 *
 * Execution is sequential to respect ElevenLabs rate limits and allow
 * clean per-scene error reporting. Failures on individual scenes are
 * captured and returned without stopping the batch.
 *
 * Returns: { generated, skipped, failed, errors }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Admin auth
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
    // Empty body is fine — all scenes will be processed
  }

  const sceneIds = Array.isArray(body.sceneIds)
    ? (body.sceneIds as string[])
    : undefined;

  const adminClient = createAdminClient();

  // Resolve film project
  const { data: project, error: projectError } = await adminClient
    .from("film_projects")
    .select("id, selected_voice_id, narration_mode")
    .eq("order_id", orderId)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json(
      { error: `DB error: ${projectError.message}` },
      { status: 500 }
    );
  }
  if (!project) {
    return NextResponse.json(
      { error: "No film project found for this order" },
      { status: 404 }
    );
  }
  if (project.narration_mode === "none") {
    return NextResponse.json(
      { error: "Narration mode is set to none — audio generation is not applicable" },
      { status: 400 }
    );
  }
  if (!project.selected_voice_id) {
    return NextResponse.json(
      { error: "No voice selected — choose a voice before generating audio" },
      { status: 422 }
    );
  }

  const filmProjectId = project.id as string;

  // Fetch scenes to process
  let query = adminClient
    .from("film_scenes")
    .select("id, narration_text, status")
    .eq("film_project_id", filmProjectId)
    .order("scene_order");

  if (sceneIds && sceneIds.length > 0) {
    query = query.in("id", sceneIds);
  }

  const { data: scenes, error: scenesError } = await query;

  if (scenesError) {
    return NextResponse.json(
      { error: `Failed to fetch scenes: ${scenesError.message}` },
      { status: 500 }
    );
  }

  if (!scenes || scenes.length === 0) {
    return NextResponse.json({ generated: 0, skipped: 0, failed: 0, errors: [] });
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  // Sequential processing — respects ElevenLabs rate limits and makes
  // per-scene errors easy to diagnose.
  for (const scene of scenes) {
    const narrationText = (scene.narration_text as string | null)?.trim();

    if (!narrationText) {
      // No narration text (cover, back_cover, dedication without text).
      // Mark the scene as narration_ready so it can proceed to rendering.
      // The assembly will add a silent audio track when no audio_path is set.
      // Duration was already set during scene building (DEFAULT_DURATION_MS).
      await adminClient
        .from("film_scenes")
        .update({
          status: "narration_ready",
          audio_path: null,
          audio_duration_ms: null,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", scene.id);
      skipped++;
      continue;
    }

    try {
      await generateSceneAudio({
        sceneId: scene.id as string,
        orderId,
        filmProjectId,
      });
      generated++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`scene ${scene.id}: ${message}`);

      // Persist error on the scene without changing status (best-effort)
      await adminClient
        .from("film_scenes")
        .update({
          error_message: `[audio] ${message}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", scene.id)
        .then(() => {}, () => {});
    }
  }

  const total = scenes.length;
  const message =
    failed === 0
      ? `Audio generated for ${generated} scene(s).`
      : `Generated ${generated}/${total}, ${failed} failed — see errors array.`;

  return NextResponse.json({ generated, skipped, failed, errors, message });
}
