import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/orders/[orderId]/pages/insert-spread
 *
 * Inserts a new spread (2 content pages) into the album.
 *
 * Body: { afterPageNumber?: number }
 *   afterPageNumber — content page after whose spread the new spread is inserted.
 *                     If omitted (or if the page is cover/back_cover), the spread
 *                     is inserted just before the back_cover.
 *
 * Algorithm:
 *   1. Determine insertAfterPageNumber (the page that the new pages follow).
 *      For a content page at an even position (right page of a spread), round up
 *      to the matching odd position (left page) so the insert happens after the
 *      full spread, not in the middle of it.
 *   2. UPDATE all pages whose page_number > insertAfterPageNumber, incrementing
 *      page_number by 2. Pages are updated in DESCENDING order to avoid
 *      temporary conflicts on the unique (order_id, page_number) constraint.
 *   3. INSERT 2 new illustration_and_text pages at the freed positions.
 *   4. UPDATE orders.target_page_count += 2.
 */
export async function POST(
  req: NextRequest,
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

  // Parse optional afterPageNumber from body
  let afterPageNumber: number | undefined;
  try {
    const body = await req.json();
    if (typeof body?.afterPageNumber === "number") {
      afterPageNumber = body.afterPageNumber;
    }
  } catch {
    // body is optional — ignore parse errors
  }

  // Fetch all pages for this order in ascending order
  const { data: pagesRaw, error: pagesError } = await adminClient
    .from("pages")
    .select("id, page_number, page_type")
    .eq("order_id", orderId)
    .order("page_number");

  if (pagesError || !pagesRaw || pagesRaw.length === 0) {
    return NextResponse.json({ error: "Order has no pages" }, { status: 404 });
  }

  const pages = pagesRaw as { id: string; page_number: number; page_type: string }[];

  const backCover = pages.find((p) => p.page_type === "back_cover");
  if (!backCover) {
    return NextResponse.json(
      { error: "Album has no back_cover page" },
      { status: 400 }
    );
  }

  // Determine the page number after which we insert
  let insertAfterPageNumber: number;

  if (afterPageNumber != null) {
    const targetPage = pages.find((p) => p.page_number === afterPageNumber);

    if (
      !targetPage ||
      targetPage.page_type === "back_cover"
    ) {
      // Fall back to inserting before back_cover
      insertAfterPageNumber = backCover.page_number - 1;
    } else if (
      targetPage.page_type === "illustration_and_text" ||
      targetPage.page_type === "text_only"
    ) {
      // Content page — round up to the end of its spread.
      // Content pages start at 2 (even = right page of spread, odd = left page).
      // Even page → the left page of its spread is page_number + 1.
      // Odd page → it is already the left page of its spread.
      const candidate =
        afterPageNumber % 2 === 0 ? afterPageNumber + 1 : afterPageNumber;
      // Safety cap: never exceed back_cover - 1
      insertAfterPageNumber = Math.min(candidate, backCover.page_number - 1);
    } else {
      // cover or dedication: insert right after it
      insertAfterPageNumber = afterPageNumber;
    }
  } else {
    // Default: insert just before back_cover
    insertAfterPageNumber = backCover.page_number - 1;
  }

  const newPage1Number = insertAfterPageNumber + 1;
  const newPage2Number = insertAfterPageNumber + 2;

  // Shift all pages after the insertion point by +2.
  // Must update in DESCENDING page_number order to avoid unique-constraint
  // conflicts (e.g. updating page 40→42 before updating 39→41, etc.).
  const pagesToShift = pages
    .filter((p) => p.page_number > insertAfterPageNumber)
    .sort((a, b) => b.page_number - a.page_number); // DESC

  for (const page of pagesToShift) {
    const { error: shiftError } = await adminClient
      .from("pages")
      .update({ page_number: page.page_number + 2 })
      .eq("id", page.id);

    if (shiftError) {
      return NextResponse.json(
        { error: `Failed to shift page ${page.page_number}: ${shiftError.message}` },
        { status: 500 }
      );
    }
  }

  // Insert 2 new empty content pages at the freed slots
  const { data: inserted, error: insertError } = await adminClient
    .from("pages")
    .insert([
      {
        order_id: orderId,
        page_number: newPage1Number,
        page_type: "illustration_and_text",
        text_content: null,
        text_status: "ready",
        illustration_status: "pending",
        layout_type: "FULL_IMAGE",
        text_version: 1,
        illustration_version: 1,
      },
      {
        order_id: orderId,
        page_number: newPage2Number,
        page_type: "illustration_and_text",
        text_content: null,
        text_status: "ready",
        illustration_status: "pending",
        layout_type: "FULL_IMAGE",
        text_version: 1,
        illustration_version: 1,
      },
    ])
    .select("id, page_number");

  if (insertError) {
    return NextResponse.json(
      { error: `Failed to insert new pages: ${insertError.message}` },
      { status: 500 }
    );
  }

  // Update orders.target_page_count to reflect the new album length
  const { data: orderData } = await adminClient
    .from("orders")
    .select("target_page_count")
    .eq("id", orderId)
    .single();

  const currentTargetPageCount =
    (orderData?.target_page_count as number | null) ?? pages.length;

  await adminClient
    .from("orders")
    .update({ target_page_count: currentTargetPageCount + 2 })
    .eq("id", orderId);

  return NextResponse.json({
    ok: true,
    insertedPageNumbers: [newPage1Number, newPage2Number],
    insertedIds: (inserted ?? []).map((p) => (p as { id: string }).id),
  });
}
