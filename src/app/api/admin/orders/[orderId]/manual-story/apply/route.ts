import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ManualSpread, OrderStatus } from "@/types/order";

type RouteParams = { params: Promise<{ orderId: string }> };

// POST /api/admin/orders/[orderId]/manual-story/apply
// Takes the active manual spreads and writes them into the pages table,
// creating the same page structure that the questionnaire pipeline produces.
// Uses target_page_count as the canonical album length.
// This makes manual story content visible in album preview, film, PDF, etc.
export async function POST(request: NextRequest, { params }: RouteParams) {
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

  // Fetch order with manual spreads and target page count
  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select(
      "id, status, story_source, manual_spreads_json, target_page_count, total_pages"
    )
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if ((order.story_source as string) !== "manual") {
    return NextResponse.json(
      { error: "Order story_source is not 'manual'" },
      { status: 400 }
    );
  }

  const spreads = order.manual_spreads_json as ManualSpread[] | null;
  if (!spreads || spreads.length === 0) {
    return NextResponse.json(
      { error: "No manual spreads to apply" },
      { status: 400 }
    );
  }

  // Use target_page_count as the canonical album length
  const targetPageCount: number =
    (order.target_page_count as number | null) ?? 40;

  // Album structure:
  //   page 1 = cover
  //   pages 2 to (targetPageCount - 1) = content (includes dedication as page 2)
  //   page targetPageCount = back_cover
  // Content pages = targetPageCount - 2, and content spreads = (targetPageCount - 2) / 2
  const maxContentSpreads = (targetPageCount - 2) / 2;

  const activeSpreads = spreads
    .filter((s) => s.isActive)
    .sort((a, b) => a.spreadIndex - b.spreadIndex)
    .slice(0, maxContentSpreads); // take only as many as fit

  if (activeSpreads.length === 0) {
    return NextResponse.json(
      { error: "No active spreads to apply" },
      { status: 400 }
    );
  }

  // Snapshot existing pages for UPDATE vs INSERT logic
  const { data: existingPagesRaw } = await adminClient
    .from("pages")
    .select("id, page_number, text_version")
    .eq("order_id", orderId);

  const existingByNum = new Map(
    (existingPagesRaw ?? []).map((p) => [
      p.page_number as number,
      { id: p.id as string, textVersion: (p.text_version as number) ?? 0 },
    ])
  );

  // Build page list
  interface PageData {
    page_number: number;
    page_type: string;
    text_content: string | null;
  }

  const allPages: PageData[] = [];

  // Page 1: cover
  allPages.push({ page_number: 1, page_type: "cover", text_content: null });

  // Content pages from active spreads (page 2 onward).
  // All content pages are illustration_and_text; dedication pages are no longer used.
  let pageNum = 2;
  for (const spread of activeSpreads) {
    // Right page (lower number)
    allPages.push({
      page_number: pageNum,
      page_type: "illustration_and_text",
      text_content: spread.rightPageText.trim() || null,
    });
    pageNum++;

    // Left page (higher number)
    allPages.push({
      page_number: pageNum,
      page_type: "illustration_and_text",
      text_content: spread.leftPageText.trim() || null,
    });
    pageNum++;
  }

  // If we have fewer active spreads than maxContentSpreads,
  // fill remaining content pages as empty illustration_and_text
  while (pageNum < targetPageCount) {
    allPages.push({
      page_number: pageNum,
      page_type: "illustration_and_text",
      text_content: null,
    });
    pageNum++;
  }

  // Back cover = last page
  allPages.push({
    page_number: targetPageCount,
    page_type: "back_cover",
    text_content: null,
  });

  // Delete pages that exceed the target (from previous longer generations)
  const pageNumbersToKeep = new Set(allPages.map((p) => p.page_number));
  const pagesToDelete = (existingPagesRaw ?? [])
    .filter((p) => !pageNumbersToKeep.has(p.page_number as number))
    .map((p) => p.id as string);

  if (pagesToDelete.length > 0) {
    await adminClient.from("pages").delete().in("id", pagesToDelete);
  }

  // INSERT or UPDATE pages
  const toInsert: Array<{
    order_id: string;
    page_number: number;
    page_type: string;
    text_content: string | null;
    text_status: string;
    text_version: number;
  }> = [];

  const savedPages: Array<{
    id: string;
    page_number: number;
    text_content: string | null;
    new_version: number;
  }> = [];

  for (const p of allPages) {
    const existing = existingByNum.get(p.page_number);
    if (existing) {
      const newVersion = existing.textVersion + 1;
      const { error: updateError } = await adminClient
        .from("pages")
        .update({
          page_type: p.page_type,
          text_content: p.text_content,
          text_status: "ready",
          text_version: newVersion,
          admin_text_override: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (!updateError) {
        savedPages.push({
          id: existing.id,
          page_number: p.page_number,
          text_content: p.text_content,
          new_version: newVersion,
        });
      }
    } else {
      toInsert.push({
        order_id: orderId,
        page_number: p.page_number,
        page_type: p.page_type,
        text_content: p.text_content,
        text_status: "ready",
        text_version: 1,
      });
    }
  }

  if (toInsert.length > 0) {
    const { data: inserted, error: insertError } = await adminClient
      .from("pages")
      .insert(toInsert)
      .select("id, page_number, text_content");

    if (insertError) {
      console.error("Failed to insert pages:", insertError);
      return NextResponse.json(
        { error: `Failed to insert pages: ${insertError.message}` },
        { status: 500 }
      );
    }

    for (const p of inserted ?? []) {
      savedPages.push({
        id: p.id as string,
        page_number: p.page_number as number,
        text_content: p.text_content as string | null,
        new_version: 1,
      });
    }
  }

  // Insert page_versions for text pages
  const versionRows = savedPages
    .filter((p) => p.text_content != null)
    .map((p) => ({
      page_id: p.id,
      version_type: "text" as const,
      version_number: p.new_version,
      content: p.text_content as string,
      created_by: "admin_edit" as const,
    }));

  if (versionRows.length > 0) {
    await adminClient.from("page_versions").insert(versionRows);
  }

  // Sync total_pages to match target
  await adminClient
    .from("orders")
    .update({ total_pages: targetPageCount })
    .eq("id", orderId);

  // Transition order status to preview_ready if in a state that allows it
  const currentStatus = order.status as OrderStatus;
  const canTransitionStatuses: OrderStatus[] = [
    "created",
    "questionnaire_complete",
    "enrichment_complete",
    "photos_uploaded",
    "generating_text",
    "text_ready",
    "generating_illustrations",
    "preview_ready",
    "admin_review",
    "revision_requested",
    "error_generation",
  ];

  if (canTransitionStatuses.includes(currentStatus)) {
    await adminClient
      .from("orders")
      .update({ status: "preview_ready" })
      .eq("id", orderId);
  }

  return NextResponse.json({
    ok: true,
    totalPages: targetPageCount,
    activeSpreads: activeSpreads.length,
    maxContentSpreads,
    pagesCreated: toInsert.length,
    pagesUpdated: savedPages.length - toInsert.length,
    pagesDeleted: pagesToDelete.length,
  });
}
