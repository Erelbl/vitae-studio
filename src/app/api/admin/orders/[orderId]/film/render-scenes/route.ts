import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderSelectedScenes } from "@/services/film/render/render-selected-scenes";

/**
 * POST /api/admin/orders/[orderId]/film/render-scenes
 * Body: { sceneIds?: string[] }
 *
 * Renders selected scenes (or all scenes if sceneIds is omitted).
 * Skips scenes whose inputs haven't changed since the last render.
 *
 * ⚠️  Requires a Node.js environment with Chrome installed (Remotion).
 *     Will NOT work on Vercel serverless functions.
 *     For production cloud rendering, use @remotion/lambda.
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
    // Empty body is fine — means "render all scenes"
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

  try {
    const result = await renderSelectedScenes({
      filmProjectId: filmProject.id as string,
      orderId,
      sceneIds,
    });

    return NextResponse.json({
      rendered: result.rendered.length,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to render scenes";
    console.error(
      `[render-scenes] Error for order ${orderId}: ${message}`
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
