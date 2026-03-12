import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/orders/[orderId]/illustrations/[photoId]/download
//
// Admin-only. Redirects to a short-lived signed URL for the generated
// illustration so the browser downloads it directly from Supabase Storage.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string; photoId: string }> }
) {
  // ── Verify admin ──
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderId, photoId } = await params;
  const adminClient = createAdminClient();

  // ── Fetch photo, verify ownership + completion ──
  const { data: photo } = await adminClient
    .from("photos")
    .select("illustration_storage_path, illustration_status, original_filename")
    .eq("id", photoId)
    .eq("order_id", orderId)
    .single();

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  if (photo.illustration_status !== "completed" || !photo.illustration_storage_path) {
    return NextResponse.json(
      { error: "Illustration not yet generated for this photo" },
      { status: 409 }
    );
  }

  // ── Generate a short-lived signed URL and redirect ──
  const { data, error } = await adminClient.storage
    .from("illustrations")
    .createSignedUrl(photo.illustration_storage_path as string, 300); // 5-minute URL

  if (error || !data?.signedUrl) {
    console.error("[illustrations/download] Failed to create signed URL:", error);
    return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
  }

  console.log(`[illustrations/download] photoId=${photoId} → ${photo.illustration_storage_path}`);

  // Redirect browser to the signed URL — Supabase adds Content-Disposition automatically
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
