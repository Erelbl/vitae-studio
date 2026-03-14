import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderStatus } from "@/types/order";
import { DraftPageCard } from "@/components/admin/DraftPageCard";

// Displays the current text content of all pages for an order.
// Each page card allows inline editing (saves as a new version via the edit API).
// Uses the real schema: pages table (one row per page per order, queried by order_id).
export default async function DraftTextPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    redirect("/admin/login");
  }

  const { orderId } = await params;
  const adminClient = createAdminClient();

  const { data: order } = await adminClient
    .from("orders")
    .select("id, person_name, status")
    .eq("id", orderId)
    .single();

  if (!order) notFound();

  // Load all current pages — include id for the inline editor
  const { data: pages, error: pagesError } = await adminClient
    .from("pages")
    .select("id, page_number, page_type, text_content, text_version")
    .eq("order_id", orderId)
    .order("page_number");

  console.log(
    `[draft-text] orderId=${orderId} pages=${pages?.length ?? "null"} error=${pagesError?.message ?? "none"}`
  );

  const personName = (order.person_name as string | null) || "ללא שם";
  const currentStatus = order.status as OrderStatus;
  const hasPages = pages && pages.length > 0;

  // Current text version = max text_version across all pages
  const maxTextVersion = hasPages
    ? Math.max(
        0,
        ...pages
          .map((p) => p.text_version as number | null)
          .filter((v): v is number => v != null)
      )
    : 0;

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link
          href={`/admin/orders/${orderId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← חזרה לפרטי הזמנה
        </Link>
        <div className="flex items-center gap-3">
          {hasPages && (
            <a
              href={`/api/admin/orders/${orderId}/export-text`}
              download
              className="text-sm text-primary hover:underline underline-offset-2"
            >
              ↓ ייצוא כטקסט
            </a>
          )}
          <Link
            href={`/admin/orders/${orderId}/preview`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            צפייה בתצוגת האלבום ←
          </Link>
        </div>
      </div>

      <div>
        <h1 className="text-xl font-bold mb-1">
          טיוטת טקסט — {personName}
          {maxTextVersion > 0 && (
            <span className="ms-2 text-sm font-normal text-muted-foreground">
              גרסת טקסט {maxTextVersion}
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          סטטוס: {currentStatus}
          {hasPages ? ` · ${pages.length} עמודים` : " · אין עמודים עדיין"}
        </p>
        {hasPages && (
          <p className="text-xs text-muted-foreground mt-1">
            לחץ על &ldquo;ערוך&rdquo; בכל עמוד כדי לערוך את הטקסט ולשמור אותו כגרסה חדשה.
          </p>
        )}
      </div>

      {!hasPages && (
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-5 text-sm text-amber-800">
          לא נוצרו עמודים עבור הזמנה זו עדיין. הפעל את יצירת הסיפור תחילה.
        </div>
      )}

      {hasPages &&
        pages.map((page) => (
          <DraftPageCard
            key={page.id as string}
            orderId={orderId}
            pageId={page.id as string}
            pageNumber={page.page_number as number}
            pageType={page.page_type as string}
            textContent={(page.text_content as string | null) ?? null}
            textVersion={(page.text_version as number | null) ?? null}
          />
        ))}
    </div>
  );
}
