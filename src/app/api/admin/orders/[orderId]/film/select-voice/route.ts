import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/orders/[orderId]/film/select-voice
 * Body: { voiceId: string }
 * Persists the selected voice ID for the film project.
 */
export async function POST(
  req: NextRequest,
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

  // Parse and validate body
  let voiceId: string;
  try {
    const body = await req.json();
    if (!body.voiceId || typeof body.voiceId !== "string") {
      return NextResponse.json(
        { error: "voiceId is required and must be a string" },
        { status: 400 }
      );
    }
    voiceId = body.voiceId;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Resolve film project for this order
  const { data: filmProject } = await adminClient
    .from("film_projects")
    .select("id, order_id, voice_sample_a_voice_id, voice_sample_b_voice_id, voice_choice_status")
    .eq("order_id", orderId)
    .single();

  if (!filmProject) {
    return NextResponse.json(
      { error: "No film project found for this order" },
      { status: 404 }
    );
  }

  // Verify the voiceId is one of the generated samples
  const validVoiceIds = [
    filmProject.voice_sample_a_voice_id,
    filmProject.voice_sample_b_voice_id,
  ].filter(Boolean);

  if (validVoiceIds.length > 0 && !validVoiceIds.includes(voiceId)) {
    return NextResponse.json(
      { error: "voiceId must match one of the generated voice samples" },
      { status: 400 }
    );
  }

  // Persist selection
  const { data: updated, error } = await adminClient
    .from("film_projects")
    .update({
      selected_voice_id: voiceId,
      voice_choice_status: "chosen",
      updated_at: new Date().toISOString(),
    })
    .eq("id", filmProject.id as string)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to update voice selection" },
      { status: 500 }
    );
  }

  return NextResponse.json({ filmProject: updated });
}
