import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  _req: Request,
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

  // Verify the order exists
  const { data: order } = await adminClient
    .from("orders")
    .select("id, person_name")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // ── Collect storage paths before deleting DB records ──
  // Photos: original_storage_path (originals bucket)
  // Photos: illustration_storage_path (illustrations bucket)
  const { data: photos } = await adminClient
    .from("photos")
    .select("original_storage_path, illustration_storage_path")
    .eq("order_id", orderId);

  const originalPaths: string[] = [];
  const illustrationPaths: string[] = [];

  for (const photo of photos ?? []) {
    if (photo.original_storage_path) {
      originalPaths.push(photo.original_storage_path as string);
    }
    if (photo.illustration_storage_path) {
      illustrationPaths.push(photo.illustration_storage_path as string);
    }
  }

  // Also collect illustration paths from page_versions (some may differ)
  const { data: pages } = await adminClient
    .from("pages")
    .select("id, illustration_storage_path")
    .eq("order_id", orderId);

  for (const page of pages ?? []) {
    if (
      page.illustration_storage_path &&
      !illustrationPaths.includes(page.illustration_storage_path as string)
    ) {
      illustrationPaths.push(page.illustration_storage_path as string);
    }
  }

  const pageIds = (pages ?? []).map((p) => p.id as string);

  // Illustration paths from page_versions (version_type = 'illustration')
  if (pageIds.length > 0) {
    const { data: pvIllustrations } = await adminClient
      .from("page_versions")
      .select("content")
      .eq("version_type", "illustration")
      .in("page_id", pageIds);

    for (const pv of pvIllustrations ?? []) {
      if (pv.content && !illustrationPaths.includes(pv.content as string)) {
        illustrationPaths.push(pv.content as string);
      }
    }
  }

  // ── Attempt storage cleanup ──
  const storageErrors: string[] = [];

  if (originalPaths.length > 0) {
    const { error } = await adminClient.storage
      .from("originals")
      .remove(originalPaths);
    if (error) {
      storageErrors.push(`originals: ${error.message}`);
    }
  }

  if (illustrationPaths.length > 0) {
    const { error } = await adminClient.storage
      .from("illustrations")
      .remove(illustrationPaths);
    if (error) {
      storageErrors.push(`illustrations: ${error.message}`);
    }
  }

  // ── Delete the order (all related DB records cascade) ──
  // Tables with ON DELETE CASCADE on order_id:
  //   pages → page_images, page_versions (both cascade from page_id)
  //   photos, processing_jobs, generation_settings,
  //   questionnaire_responses, admin_actions
  const { error: deleteError } = await adminClient
    .from("orders")
    .delete()
    .eq("id", orderId);

  if (deleteError) {
    return NextResponse.json(
      { error: `Failed to delete order: ${deleteError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    deleted: {
      orderId,
      personName: order.person_name,
      storageFilesDeleted: {
        originals: originalPaths.length,
        illustrations: illustrationPaths.length,
      },
    },
    storageErrors: storageErrors.length > 0 ? storageErrors : undefined,
  });
}
