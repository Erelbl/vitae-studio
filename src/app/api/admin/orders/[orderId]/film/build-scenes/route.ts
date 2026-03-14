import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildScenes } from "@/services/film/project/build-scenes";

/**
 * POST /api/admin/orders/[orderId]/film/build-scenes
 * Generates film scenes from album pages. Idempotent — safe to call multiple times.
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

  // Resolve the film project for this order
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
      { error: "No film project found for this order. Create one first." },
      { status: 404 }
    );
  }

  try {
    const result = await buildScenes({
      filmProjectId: filmProject.id as string,
      orderId,
    });
    return NextResponse.json({
      sceneCount: result.sceneCount,
      scenes: result.scenes,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to build scenes";
    console.error(`[build-scenes] Error for order ${orderId}: ${message}`);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
