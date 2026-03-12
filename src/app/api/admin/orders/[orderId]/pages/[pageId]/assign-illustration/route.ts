import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string; pageId: string }> }
) {
  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId, pageId } = await params;

  let body: { photoId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const photoId: string | null = body.photoId ?? null;
  const adminClient = createAdminClient();

  // Verify page belongs to this order
  const { data: page } = await adminClient
    .from("pages")
    .select("id")
    .eq("id", pageId)
    .eq("order_id", orderId)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  if (photoId === null) {
    // Clear the assignment
    const { error } = await adminClient
      .from("pages")
      .update({ photo_id: null, illustration_storage_path: null })
      .eq("id", pageId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Fetch the photo — must belong to this order and be completed
  const { data: photo } = await adminClient
    .from("photos")
    .select("id, illustration_storage_path, illustration_status")
    .eq("id", photoId)
    .eq("order_id", orderId)
    .single();

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  if (photo.illustration_status !== "completed") {
    return NextResponse.json(
      { error: "Photo illustration is not completed" },
      { status: 400 }
    );
  }

  if (!photo.illustration_storage_path) {
    return NextResponse.json(
      { error: "Photo has no illustration storage path" },
      { status: 400 }
    );
  }

  const { error } = await adminClient
    .from("pages")
    .update({
      photo_id: photoId,
      illustration_storage_path: photo.illustration_storage_path as string,
    })
    .eq("id", pageId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
