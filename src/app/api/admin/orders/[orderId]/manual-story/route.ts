import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ManualSpread, StorySource } from "@/types/order";

type RouteParams = { params: Promise<{ orderId: string }> };

// PUT /api/admin/orders/[orderId]/manual-story
// Saves story_source and manual_spreads_json on the order.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { orderId } = await params;

  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();

  // Verify order exists
  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const body = await request.json();
  const { story_source, manual_spreads_json } = body as {
    story_source: StorySource;
    manual_spreads_json: ManualSpread[] | null;
  };

  // Validate story_source
  if (!["questionnaire", "manual"].includes(story_source)) {
    return NextResponse.json(
      { error: "Invalid story_source. Must be 'questionnaire' or 'manual'" },
      { status: 400 }
    );
  }

  // Validate spreads structure if provided
  if (manual_spreads_json != null) {
    if (!Array.isArray(manual_spreads_json)) {
      return NextResponse.json(
        { error: "manual_spreads_json must be an array" },
        { status: 400 }
      );
    }
    for (const spread of manual_spreads_json) {
      if (
        typeof spread.id !== "string" ||
        typeof spread.spreadIndex !== "number" ||
        typeof spread.rightPageText !== "string" ||
        typeof spread.leftPageText !== "string" ||
        typeof spread.isActive !== "boolean"
      ) {
        return NextResponse.json(
          { error: "Invalid spread structure" },
          { status: 400 }
        );
      }
    }
  }

  const { error: updateError } = await adminClient
    .from("orders")
    .update({
      story_source,
      manual_spreads_json,
    })
    .eq("id", orderId);

  if (updateError) {
    console.error("Error saving manual story:", updateError);
    return NextResponse.json(
      { error: "Failed to save manual story" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
