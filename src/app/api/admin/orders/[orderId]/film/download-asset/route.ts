import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/orders/[orderId]/film/download-asset?sceneId=<id>&type=video|audio
 *
 * Admin-only. Generates a short-lived Supabase signed URL with
 * `Content-Disposition: attachment` (forces browser download, not playback)
 * and redirects the browser to it.
 *
 * Used for per-scene download buttons in the Film panel.
 */
export async function GET(
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
  const searchParams = req.nextUrl.searchParams;
  const sceneId = searchParams.get("sceneId");
  const type = searchParams.get("type") as "video" | "audio" | null;

  if (!sceneId) {
    return NextResponse.json({ error: "Missing sceneId" }, { status: 400 });
  }
  if (type !== "video" && type !== "audio") {
    return NextResponse.json(
      { error: "type must be 'video' or 'audio'" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();
  const filmBucket = process.env.FILM_STORAGE_BUCKET ?? "films";

  // Fetch scene — only what we need
  const { data: scene, error: sceneErr } = await adminClient
    .from("film_scenes")
    .select(
      "id, scene_order, page_spread_key, rendered_scene_path, audio_path, film_project_id"
    )
    .eq("id", sceneId)
    .single();

  if (sceneErr || !scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  // Verify this scene belongs to the requested order (security check)
  const { data: project, error: projErr } = await adminClient
    .from("film_projects")
    .select("order_id")
    .eq("id", scene.film_project_id as string)
    .single();

  if (
    projErr ||
    !project ||
    (project.order_id as string) !== orderId
  ) {
    return NextResponse.json(
      { error: "Scene does not belong to this order" },
      { status: 403 }
    );
  }

  const storagePath =
    type === "video"
      ? (scene.rendered_scene_path as string | null)
      : (scene.audio_path as string | null);

  if (!storagePath) {
    return NextResponse.json(
      { error: `No ${type} asset available for this scene` },
      { status: 404 }
    );
  }

  // Build a descriptive filename for the download
  const order = String(scene.scene_order as number).padStart(2, "0");
  const spreadKey =
    (scene.page_spread_key as string | null)?.replace(/[^a-z0-9_-]/gi, "-") ??
    `scene-${order}`;
  const ext = type === "video" ? "mp4" : "mp3";
  const filename = `scene-${order}-${spreadKey}.${ext}`;

  // Sign the URL with download=filename to force Content-Disposition: attachment
  const { data, error: signErr } = await adminClient.storage
    .from(filmBucket)
    .createSignedUrl(storagePath, 300, { download: filename }); // 5-min expiry for redirect

  if (signErr || !data?.signedUrl) {
    console.error(
      `[download-asset] Failed to sign ${type} URL for scene ${sceneId}:`,
      signErr?.message
    );
    return NextResponse.json(
      {
        error: `Failed to generate download URL: ${signErr?.message ?? "unknown error"}`,
      },
      { status: 500 }
    );
  }

  return NextResponse.redirect(data.signedUrl);
}
