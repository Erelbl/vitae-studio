import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderStatus } from "@/types/order";
import type { PageType } from "@/types/page";

const PAGE_TYPE_LABELS: Record<PageType, string> = {
  cover: "כריכה קדמית",
  dedication: "הקדשה",
  illustration_and_text: "תוכן",
  text_only: "טקסט בלבד",
  back_cover: "כריכה אחורית",
};

export default async function DraftTextPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ draftId?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    redirect("/admin/login");
  }

  const { orderId } = await params;
  const { draftId } = await searchParams;
  const adminClient = createAdminClient();

  const { data: order } = await adminClient
    .from("orders")
    .select("id, person_name, status")
    .eq("id", orderId)
    .single();

  if (!order) notFound();

  // Fetch all drafts for version selector
  const { data: drafts } = await adminClient
    .from("story_drafts")
    .select("id, version_number, created_at")
    .eq("order_id", orderId)
    .order("version_number", { ascending: false });

  // Resolve active draft (latest if none specified)
  const activeDraftId = draftId ?? (drafts?.[0]?.id as string | undefined) ?? null;
  const activeDraft = drafts?.find((d) => d.id === activeDraftId);

  // Query pages filtered by draft, or fall back to order-wide for legacy data
  let pagesQuery = adminClient
    .from("pages")
    .select("page_number, page_type, text_content");

  if (activeDraftId) {
    pagesQuery = pagesQuery.eq("story_draft_id", activeDraftId);
  } else {
    pagesQuery = pagesQuery.eq("order_id", orderId);
  }

  const { data: pages, error: pagesQueryError } = await pagesQuery.order("page_number");

  console.log(`[DIAG][draft-text] orderId=${orderId} draftId=${activeDraftId ?? "none"} pages=${pages?.length ?? "null"} queryError=${pagesQueryError ? pagesQueryError.message : "none"}`);

  const personName = (order.person_name as string | null) || "ללא שם";
  const currentStatus = order.status as OrderStatus;
  const hasPages = pages && pages.length > 0;

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href={`/admin/orders/${orderId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← חזרה לפרטי הזמנה
        </Link>
        <Link
          href={`/admin/orders/${orderId}/preview${activeDraftId ? `?draftId=${activeDraftId}` : ""}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          צפייה בתצוגת האלבום ←
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold mb-1">
          טיוטת טקסט — {personName}
          {activeDraft && (
            <span className="ms-2 text-sm font-normal text-muted-foreground">
              גרסה {activeDraft.version_number as number}
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          סטטוס: {currentStatus}
          {hasPages ? ` · ${pages.length} עמודים נוצרו` : " · אין עמודים עדיין"}
        </p>
      </div>

      {/* Version selector */}
      {drafts && drafts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3">
          <span className="text-xs text-muted-foreground font-medium me-1">גרסה:</span>
          {drafts.map((draft) => {
            const isActive = draft.id === activeDraftId;
            return (
              <Link
                key={draft.id as string}
                href={`/admin/orders/${orderId}/draft-text?draftId=${draft.id}`}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                גרסה {draft.version_number as number}
                <span className="ms-1.5 opacity-60">
                  {new Date(draft.created_at as string).toLocaleDateString("he-IL")}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {!hasPages && (
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-5 text-sm text-amber-800">
          לא נוצרו עמודים עבור הזמנה זו עדיין. הפעל את יצירת הסיפור תחילה.
        </div>
      )}

      {hasPages &&
        pages.map((page) => (
          <div
            key={page.page_number as number}
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

            {page.text_content ? (
              <p className="text-sm leading-loose whitespace-pre-line font-serif">
                {page.text_content}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                אין טקסט (עמוד {PAGE_TYPE_LABELS[page.page_type as PageType] ?? page.page_type})
              </p>
            )}
          </div>
        ))}
    </div>
  );
}
