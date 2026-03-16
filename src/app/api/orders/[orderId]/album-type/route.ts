import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrderRequest } from "@/lib/order-auth";

const VALID_ALBUM_TYPES = ["single", "couple", "memorial"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = request.nextUrl.searchParams.get("token");
  const body = await request.json();
  const { album_type } = body;

  if (!album_type || !VALID_ALBUM_TYPES.includes(album_type)) {
    return NextResponse.json(
      { error: "Invalid album_type" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const auth = await authorizeOrderRequest(supabase, orderId, token);
  if (!auth.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  }

  const { error } = await supabase
    .from("orders")
    .update({ album_type })
    .eq("id", orderId);

  if (error) {
    console.error("Error updating album_type:", error);
    return NextResponse.json(
      { error: "Failed to update album type" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
