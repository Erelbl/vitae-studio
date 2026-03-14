import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TtsOverride } from "@/types/film";

async function resolveFilmProject(orderId: string) {
  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from("film_projects")
    .select("id, order_id, tts_overrides_json")
    .eq("order_id", orderId)
    .single();
  return data;
}

function validateOverrides(raw: unknown): TtsOverride[] | null {
  if (!Array.isArray(raw)) return null;
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    if (typeof item.original !== "string") return null;
    if (typeof item.spoken !== "string") return null;
  }
  if (raw.length > 200) return null; // sanity cap
  return raw as TtsOverride[];
}

/**
 * GET /api/admin/orders/[orderId]/film/tts-overrides
 * Returns the current TTS pronunciation overrides for the film project.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const filmProject = await resolveFilmProject(orderId);

  if (!filmProject) {
    return NextResponse.json({ error: "No film project found for this order" }, { status: 404 });
  }

  return NextResponse.json({
    overrides: (filmProject.tts_overrides_json as TtsOverride[] | null) ?? [],
  });
}

/**
 * PATCH /api/admin/orders/[orderId]/film/tts-overrides
 * Body: { overrides: TtsOverride[] }
 * Saves pronunciation overrides. Applied at TTS time only — never changes album text.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const overrides = validateOverrides((body as Record<string, unknown>)?.overrides);
  if (overrides === null) {
    return NextResponse.json(
      { error: "overrides must be an array of { original: string, spoken: string } (max 200 entries)" },
      { status: 400 }
    );
  }

  const filmProject = await resolveFilmProject(orderId);
  if (!filmProject) {
    return NextResponse.json({ error: "No film project found for this order" }, { status: 404 });
  }

  const adminClient = createAdminClient();
  const { data: updated, error } = await adminClient
    .from("film_projects")
    .update({
      tts_overrides_json: overrides,
      updated_at: new Date().toISOString(),
    })
    .eq("id", filmProject.id as string)
    .select("id, tts_overrides_json")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to save overrides" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    overrides: (updated.tts_overrides_json as TtsOverride[] | null) ?? [],
  });
}
