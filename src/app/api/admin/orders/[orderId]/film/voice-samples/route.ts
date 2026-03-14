import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateVoiceSamples } from "@/services/film/narration/generate-voice-samples";

/**
 * POST /api/admin/orders/[orderId]/film/voice-samples
 * Generates A/B voice samples for the film project of the given order.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const adminClient = createAdminClient();

  // Resolve film project for this order
  const { data: filmProject } = await adminClient
    .from("film_projects")
    .select("id, order_id, narration_mode")
    .eq("order_id", orderId)
    .single();

  if (!filmProject) {
    return NextResponse.json(
      { error: "No film project found for this order" },
      { status: 404 }
    );
  }

  if (filmProject.narration_mode === "none") {
    return NextResponse.json(
      { error: "Narration mode is set to none — voice samples are not applicable" },
      { status: 400 }
    );
  }

  try {
    const result = await generateVoiceSamples({
      filmProjectId: filmProject.id as string,
    });
    return NextResponse.json({ filmProject: result.filmProject });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate voice samples";
    console.error("[film/voice-samples] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
