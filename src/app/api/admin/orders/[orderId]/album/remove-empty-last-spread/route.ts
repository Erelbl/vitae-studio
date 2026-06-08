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

// TODO: no shared album-length constant exists yet — album-length/route.ts
// and AlbumLengthControl.tsx also hardcode 20/40 independently. Centralize
// if/when those are refactored; until then this mirrors the
// orders_target_page_count_range DB constraint (see migration 00036).
const MIN_ALBUM_PAGES = 20;
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

  // ── Self-heal: repair any pre-existing page_number gap ──────────────────
  // Diagnosis (direct DB inspection, see report) found a real order whose
  // pages run 1..39 contiguously, then jump straight to back_cover at 42 —
  // page_numbers 40 and 41 are simply gone, with no row occupying them. That
  // is the fingerprint of the ORIGINAL pre-fix version of this route: it
  // deleted the empty spread but never renumbered back_cover, so back_cover
  // stayed at 42 forever after. Once that gap exists, EVERY later request
  // (even with the renumbering fix in place) fails at the `!p1 || !p2` check
  // below — page_number 40/41 no longer exist — and returns 400 before the
  // correct renumbering code ever runs. That is why the button stayed gone
  // no matter how the post-delete renumbering logic was fixed: the fix can
  // only run after validation passes, and the corrupted gap makes validation
  // permanently fail. Repairing the gap (once, here) is what unblocks it.
  //
  // The repair is purely a page_number metadata correction — it renumbers
  // pages to be contiguous starting at the lowest existing page_number, in
  // their existing order. No content/id/row is touched and nothing is
  // deleted, so it can never turn non-empty pages into removable ones; it
  // only restores the contiguity invariant every lookup here assumes.
  //
  // Ascending order is safe for an arbitrary gap pattern: each target slot
  // (firstPageNumber + i) is always <= the page's current number (gaps only
  // ever push numbers higher than expected) and strictly less than every
  // not-yet-processed page's current number, so no transient unique
  // constraint conflict on (order_id, page_number) is possible.
  let gapRepaired = false;
  const sortedByNumber = [...pages].sort((a, b) => a.page_number - b.page_number);
  const firstPageNumber = sortedByNumber[0].page_number;
  for (let i = 0; i < sortedByNumber.length; i++) {
    const expected = firstPageNumber + i;
    const page = sortedByNumber[i];
    if (page.page_number !== expected) {
      const { error: healError } = await adminClient
        .from("pages")
        .update({ page_number: expected })
        .eq("id", page.id);
      if (healError) {
        return NextResponse.json(
          { error: `Failed to repair page numbering gap: ${healError.message}` },
          { status: 500 }
        );
      }
      page.page_number = expected; // keep in-memory copy (shared ref with `pages`) in sync
      gapRepaired = true;
    }
  }
  if (gapRepaired) {
    console.warn(
      `[remove-empty-last-spread] order=${orderId}: repaired a page_number gap — ` +
        `pages renumbered to be contiguous from ${firstPageNumber}. ` +
        `now=[${sortedByNumber.map((p) => `${p.page_number}:${p.page_type}`).join(", ")}]`
    );
  }

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

  // Re-close the gap left by the removed spread: shift every page that came
  // after it (in the normal album structure, just back_cover) down by 2, so
  // page numbering stays contiguous — the exact inverse of insert-spread's
  // shift of back_cover (and everything past the insertion point) up by 2.
  // Without this, a subsequent call would look for p1/p2 at the now-vacant
  // page_numbers (new back_cover.page_number - 2 / - 1), find nothing, and
  // the admin could only ever remove a single trailing spread.
  //
  // Ascending order (the inverse of insert-spread's descending order) avoids
  // transient unique-constraint conflicts on (order_id, page_number) while
  // decrementing: each page's target slot is only vacated once the
  // lower-numbered page that previously sat there has already moved down.
  const pagesToShift = pages
    .filter((p) => p.page_number > p2.page_number)
    .sort((a, b) => a.page_number - b.page_number); // ASC

  for (const page of pagesToShift) {
    const { error: shiftError } = await adminClient
      .from("pages")
      .update({ page_number: page.page_number - 2 })
      .eq("id", page.id);

    if (shiftError) {
      return NextResponse.json(
        {
          error: `Removed pages but failed to renumber page ${page.page_number}: ${shiftError.message}`,
        },
        { status: 500 }
      );
    }
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

  // Diagnostic logging: confirms (per request) that deletion + renumbering +
  // counter updates left the album contiguous and the order counters in sync.
  // `pages` already reflects deletions/shifts/heal in-memory (shared object
  // refs mutated above), so this needs no extra query.
  const remainingPages = pages
    .filter((p) => p.id !== p1.id && p.id !== p2.id)
    .map((p) => ({
      page_number: pagesToShift.some((s) => s.id === p.id) ? p.page_number - 2 : p.page_number,
      page_type: p.page_type,
    }))
    .sort((a, b) => a.page_number - b.page_number);

  console.log(
    `[remove-empty-last-spread] order=${orderId}\n` +
      `  gapRepaired=${gapRepaired}\n` +
      `  deletedPageNumbers=[${p1.page_number}, ${p2.page_number}] (ids ${p1.id}, ${p2.id})\n` +
      `  backCover.page_number: ${backCover.page_number} -> ${backCover.page_number - 2}\n` +
      `  remainingPages=[${remainingPages.map((p) => `${p.page_number}:${p.page_type}`).join(", ")}]\n` +
      `  order.target_page_count=${updates.target_page_count ?? "(unchanged)"}, order.total_pages=${updates.total_pages}`
  );

  return NextResponse.json({
    ok: true,
    removedPageNumbers: [p1.page_number, p2.page_number],
  });
}
