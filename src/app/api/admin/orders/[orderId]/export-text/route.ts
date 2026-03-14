import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PageType } from "@/types/page";

const PAGE_TYPE_LABELS: Record<PageType, string> = {
  cover: "כריכה קדמית",
  dedication: "הקדשה",
  illustration_and_text: "תוכן",
  text_only: "טקסט בלבד",
  back_cover: "כריכה אחורית",
};

/**
 * GET /api/admin/orders/[orderId]/export-text
 * Returns the current album story text as a plain-text download.
 * Each page is separated by a divider line. Pages without text are skipped.
 */
export async function GET(
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
  const adminClient = createAdminClient();

  const { data: order } = await adminClient
    .from("orders")
    .select("id, person_name")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: pages } = await adminClient
    .from("pages")
    .select("page_number, page_type, text_content, text_version")
    .eq("order_id", orderId)
    .order("page_number");

  if (!pages || pages.length === 0) {
    return NextResponse.json({ error: "No pages found" }, { status: 404 });
  }

  const personName = (order.person_name as string | null) || "ללא שם";

  // Build plain-text content
  const lines: string[] = [
    `סיפורו/ה של ${personName}`,
    "=".repeat(40),
    "",
  ];

  for (const page of pages) {
    const pageNum = page.page_number as number;
    const pageType = page.page_type as PageType;
    const textContent = page.text_content as string | null;
    const textVersion = page.text_version as number | null;

    // Skip pages with no text (cover, back-cover, illustration-only)
    if (!textContent?.trim()) continue;

    const typeLabel = PAGE_TYPE_LABELS[pageType] ?? pageType;
    const versionNote = textVersion && textVersion > 0 ? ` [v${textVersion}]` : "";

    lines.push(`── עמוד ${pageNum} · ${typeLabel}${versionNote} ──`);
    lines.push(textContent.trim());
    lines.push("");
  }

  const exportedAt = new Date().toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  lines.push("=".repeat(40));
  lines.push(`יוצא: ${exportedAt} · Vitae Studio`);

  const textContent = lines.join("\n");

  // Sanitize filename
  const safePersonName = personName.replace(/[^\u0590-\u05FF\w\s]/g, "").trim().replace(/\s+/g, "_") || "album";
  const filename = `vitae-story-${safePersonName}.txt`;

  return new NextResponse(textContent, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
