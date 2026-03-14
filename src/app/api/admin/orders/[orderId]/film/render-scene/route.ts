import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderScene } from "@/services/film/render/render-scene";

/**
 * POST /api/admin/orders/[orderId]/film/render-scene
 * Body: { sceneId: string }
 *
 * Renders a single film scene to MP4 + thumbnail.
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sceneId =
    typeof (body as Record<string, unknown>)?.sceneId === "string"
      ? ((body as Record<string, unknown>).sceneId as string)
      : null;

  if (!sceneId) {
    return NextResponse.json(
      { error: "sceneId is required" },
      { status: 400 }
    );
  }

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
    const result = await renderScene({
      sceneId,
      orderId,
      filmProjectId: filmProject.id as string,
    });
    return NextResponse.json({ result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to render scene";
    console.error(`[render-scene] Error for scene ${sceneId}: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
