import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createFilmProject } from "@/services/film/project/create-film-project";

/**
 * POST /api/admin/orders/[orderId]/film
 * Creates a new film project for the given order.
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

  try {
    const { filmProject } = await createFilmProject({ orderId });
    return NextResponse.json({ filmProject });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create film project";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
