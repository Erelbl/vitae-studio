import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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

function fmtDate(ts: string) {
  return new Date(ts).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// How version grouping works:
//   page_versions stores one row per (page, version_type, version_number).
//   Each generation run increments pages.text_version by 1 for every page,
//   and inserts page_versions rows with that same version_number.
//   Therefore all page_versions rows sharing the same version_number (for a
//   given order's pages) belong to the same generation run.
//   This page loads those rows to reconstruct the historical story text.
export default async function TextVersionPage({
  params,
}: {
  params: Promise<{ orderId: string; versionNumber: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    redirect("/admin/login");
  }

  const { orderId, versionNumber } = await params;
  const versionNum = parseInt(versionNumber, 10);
  if (isNaN(versionNum) || versionNum < 1) notFound();

  const adminClient = createAdminClient();

  // Fetch order
  const { data: order } = await adminClient
    .from("orders")
    .select("id, person_name")
    .eq("id", orderId)
    .single();

  if (!order) notFound();

  // Fetch all pages for this order (need page_id → page_number/page_type mapping)
  const { data: orderPages } = await adminClient
    .from("pages")
    .select("id, page_number, page_type")
    .eq("order_id", orderId);

  if (!orderPages || orderPages.length === 0) notFound();

  const pageIds = orderPages.map((p) => p.id as string);

  // Fetch page_versions for this specific version number
  // This gives exactly the text content from that generation run.
  const { data: versions } = await adminClient
    .from("page_versions")
    .select("page_id, content, created_at")
    .eq("version_type", "text")
    .eq("version_number", versionNum)
    .in("page_id", pageIds);

  if (!versions || versions.length === 0) notFound();

  // Build page metadata map
  const pageById = new Map(
    orderPages.map((p) => [
      p.id as string,
      {
        page_number: p.page_number as number,
        page_type: p.page_type as string,
      },
    ])
  );

  // Merge version content with page metadata, sort by page_number
  const pages = versions
    .map((v) => ({
      page_number: pageById.get(v.page_id as string)?.page_number ?? 0,
      page_type: pageById.get(v.page_id as string)?.page_type ?? "",
      text_content: v.content as string,
      created_at: v.created_at as string,
    }))
    .filter((p) => p.page_number > 0)
    .sort((a, b) => a.page_number - b.page_number);

  if (pages.length === 0) notFound();

  // Use the earliest created_at as the run timestamp
  const runDate = fmtDate(
    pages.reduce((min, p) => (p.created_at < min ? p.created_at : min), pages[0].created_at)
  );

  const personName = (order.person_name as string | null) || "ללא שם";

  // Find if there's a later version (to link to current)
  const { data: maxVersionRow } = await adminClient
    .from("page_versions")
    .select("version_number")
    .eq("version_type", "text")
    .in("page_id", pageIds)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const maxVersion = (maxVersionRow?.version_number as number | null) ?? versionNum;
  const isLatest = versionNum === maxVersion;

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <Link
          href={`/admin/orders/${orderId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← חזרה לפרטי הזמנה
        </Link>
        <Link
          href={`/admin/orders/${orderId}/draft-text`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          גרסה נוכחית ←
        </Link>
      </div>

      {/* Title */}
      <div>
        <h1 className="text-xl font-bold mb-1">
          גרסת טקסט {versionNum} — {personName}
        </h1>
        <p className="text-sm text-muted-foreground">
          נוצרה: {runDate} · {pages.length} עמודי טקסט
          {!isLatest && (
            <span className="ms-2 text-amber-700">
              · גרסה {maxVersion} קיימת (עדכנית יותר)
            </span>
          )}
        </p>
      </div>

      {/* Version navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        {Array.from({ length: maxVersion }, (_, i) => i + 1).map((v) => (
          <Link
            key={v}
            href={`/admin/orders/${orderId}/text-version/${v}`}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              v === versionNum
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            גרסה {v}
            {v === maxVersion && (
              <span className="ms-1 opacity-70">(עדכנית)</span>
            )}
          </Link>
        ))}
      </div>

      {/* Historical notice */}
      {!isLatest && (
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-xs text-amber-800">
          זוהי גרסה היסטורית. הגרסה הנוכחית הפעילה היא גרסה {maxVersion}.
          הטקסט שלהלן הוא כפי שנוצר בגרסה זו — לא הנוכחי.
        </div>
      )}

      {/* Pages */}
      {pages.map((page) => (
        <div
          key={page.page_number}
          className="rounded-xl border bg-card p-5 space-y-2"
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
              עמוד {page.page_number}
            </span>
            <span className="text-xs text-muted-foreground">
              {PAGE_TYPE_LABELS[page.page_type as PageType] ?? page.page_type}
            </span>
          </div>
          <p className="text-sm leading-loose whitespace-pre-line font-serif">
            {page.text_content}
          </p>
        </div>
      ))}
    </div>
  );
}
