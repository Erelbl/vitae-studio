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

  const { data: pages } = await adminClient
    .from("pages")
    .select("page_number, page_type, text_content")
    .eq("order_id", orderId)
    .order("page_number");

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
          href={`/admin/orders/${orderId}/preview`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          צפייה בתצוגת האלבום ←
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold mb-1">טיוטת טקסט — {personName}</h1>
        <p className="text-sm text-muted-foreground">
          סטטוס: {currentStatus}
          {hasPages ? ` · ${pages.length} עמודים נוצרו` : " · אין עמודים עדיין"}
        </p>
      </div>

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
