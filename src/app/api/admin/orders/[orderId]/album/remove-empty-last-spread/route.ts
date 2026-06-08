import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/orders/[orderId]/album/remove-empty-last-spread
 *
 * Removes the final spread (2 content pages) from an already-generated album,
 * but ONLY when both pages are completely empty — no story text and no
 * illustration. This lets an admin trim a trailing blank spread discovered
 * while reviewing the preview, without touching story generation, prompts,
 * or any film/render pipeline.
 *
 * Every safety rule is enforced here, server-side, regardless of what the
 * UI shows or sends:
 *   - Only the spread immediately before back_cover may be targeted — never
 *     an arbitrary or middle spread (the route takes no page/spread id input).
 *   - Both of its pages must be regular content pages (illustration_and_text
 *     or text_only) — cover/dedication/back_cover are never eligible.
 *   - Both pages must be empty: no text_content, no legacy illustration
 *     (illustration_storage_path / photo_id), and no page_images row with a
 *     photo or manual image assigned.
 *   - The album must remain at or above the minimum size used by the
 *     album-length control (target_page_count >= 20).
 * If any check fails, nothing is deleted and a clear error is returned.
 */

const MIN_ALBUM_PAGES = 20; // mirrors the orders_target_page_count_range constraint
const CONTENT_PAGE_TYPES = new Set(["illustration_and_text", "text_only"]);

type PageRow = {
  id: string;
  page_number: number;
  page_type: string;
  text_content: string | null;
  illustration_storage_path: string | null;
  photo_id: string | null;
};

function isTextEmpty(text: string | null): boolean {
  return !text || text.trim().length === 0;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderId } = await params;
  const adminClient = createAdminClient();

  // Load all pages for this order, ascending by page_number
  const { data: pagesRaw, error: pagesError } = await adminClient
    .from("pages")
    .select(
      "id, page_number, page_type, text_content, illustration_storage_path, photo_id"
    )
    .eq("order_id", orderId)
    .order("page_number");

  if (pagesError || !pagesRaw || pagesRaw.length === 0) {
    return NextResponse.json({ error: "Order has no pages" }, { status: 404 });
  }

  const pages = pagesRaw as PageRow[];

  const backCover = pages.find((p) => p.page_type === "back_cover");
  if (!backCover) {
    return NextResponse.json(
      { error: "Album has no back_cover page" },
      { status: 400 }
    );
  }

  // The last spread is the pair of content pages immediately before back_cover —
  // matching how insert-spread positions new spreads and how AlbumPreview pairs
  // pages into spreads (sequential pairs, cover/back_cover always singleton).
  const p1 = pages.find((p) => p.page_number === backCover.page_number - 2);
  const p2 = pages.find((p) => p.page_number === backCover.page_number - 1);

  if (!p1 || !p2) {
    return NextResponse.json(
      { error: "לא ניתן לזהות את כפולת העמודים האחרונה" },
      { status: 400 }
    );
  }

  if (!CONTENT_PAGE_TYPES.has(p1.page_type) || !CONTENT_PAGE_TYPES.has(p2.page_type)) {
    return NextResponse.json(
      { error: "הכפולה האחרונה אינה כפולת תוכן רגילה ולא ניתן להסירה" },
      { status: 400 }
    );
  }

  // Any image assigned through the slot-based page_images system counts as content
  const { data: pageImagesRaw } = await adminClient
    .from("page_images")
    .select("page_id, photo_id, manual_image_path")
    .in("page_id", [p1.id, p2.id]);

  const pageImages = (pageImagesRaw ?? []) as {
    page_id: string;
    photo_id: string | null;
    manual_image_path: string | null;
  }[];

  const hasSlotImage = (pageId: string) =>
    pageImages.some(
      (pi) =>
        pi.page_id === pageId &&
        (pi.photo_id != null || pi.manual_image_path != null)
    );

  const isPageEmpty = (page: PageRow) =>
    isTextEmpty(page.text_content) &&
    !page.illustration_storage_path &&
    !page.photo_id &&
    !hasSlotImage(page.id);

  if (!isPageEmpty(p1) || !isPageEmpty(p2)) {
    return NextResponse.json(
      {
        error:
          "הכפולה האחרונה מכילה תוכן (טקסט או איור) — ניתן להסיר רק כפולה ריקה לחלוטין",
      },
      { status: 400 }
    );
  }

  // Guard against shrinking the album below the minimum valid size
  if (pages.length - 2 < MIN_ALBUM_PAGES) {
    return NextResponse.json(
      { error: `לא ניתן לקצר את האלבום מתחת ל-${MIN_ALBUM_PAGES} עמודים` },
      { status: 400 }
    );
  }

  // ── All checks passed — hard-delete the two empty pages ──
  // pages has no soft-delete flag; page_images / page_versions for these pages
  // cascade-delete via their FK ON DELETE CASCADE to pages(id).
  const { error: deleteError } = await adminClient
    .from("pages")
    .delete()
    .in("id", [p1.id, p2.id]);

  if (deleteError) {
    return NextResponse.json(
      { error: `Failed to remove pages: ${deleteError.message}` },
      { status: 500 }
    );
  }

  // Keep target_page_count / total_pages consistent with the new actual length
  const { data: orderRow } = await adminClient
    .from("orders")
    .select("target_page_count, total_pages")
    .eq("id", orderId)
    .single();

  const updates: Record<string, number> = {};
  if (typeof orderRow?.target_page_count === "number") {
    updates.target_page_count = orderRow.target_page_count - 2;
  }
  updates.total_pages =
    typeof orderRow?.total_pages === "number"
      ? orderRow.total_pages - 2
      : pages.length - 2;

  await adminClient.from("orders").update(updates).eq("id", orderId);

  return NextResponse.json({
    ok: true,
    removedPageNumbers: [p1.page_number, p2.page_number],
  });
}
