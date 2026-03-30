import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { getDisplayStatus, getPipelineStage, PIPELINE_STAGES } from "@/lib/display-status";
import type { PipelineStage } from "@/lib/display-status";
import { AdminAnalyticsSection } from "@/components/admin/AdminAnalyticsSection";

function StatusBadge({ order }: { order: Record<string, unknown> }) {
  const ds = getDisplayStatus(order as {
    status: string;
    payment_status?: string | null;
    preview_status?: string | null;
    preview_round?: number | null;
    sent_to_print_at?: string | null;
    shipped_to_customer_at?: string | null;
    completed_at?: string | null;
  });

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${ds.color}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ds.dotColor}`} />
      {ds.label}
    </span>
  );
}

export default async function AdminDashboardPage() {
  const supabase = createAdminClient();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, status, person_name, buyer_name, created_at, payment_status, preview_status, preview_round, sent_to_print_at, shipped_to_customer_at, completed_at")
    .order("created_at", { ascending: false });

  if (error) {
    return <p className="text-destructive">שגיאה בטעינת נתונים</p>;
  }

  const allOrders = orders ?? [];

  // Count orders per pipeline stage
  const stageCounts: Record<PipelineStage, number> = {
    awaiting_payment: 0,
    in_progress: 0,
    published: 0,
    feedback: 0,
    customer_approved: 0,
    in_print: 0,
    shipped: 0,
    completed: 0,
  };

  for (const order of allOrders) {
    const stage = getPipelineStage(order as {
      status: string;
      payment_status?: string | null;
      preview_status?: string | null;
      preview_round?: number | null;
      sent_to_print_at?: string | null;
      shipped_to_customer_at?: string | null;
      completed_at?: string | null;
    });
    stageCounts[stage]++;
  }

  const recentOrders = allOrders.slice(0, 8);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">לוח בקרה</h1>
        <span className="text-sm text-muted-foreground">
          {allOrders.length} הזמנות
        </span>
      </div>

      {/* Pipeline Stage Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {PIPELINE_STAGES.map((stage) => {
          const count = stageCounts[stage.key];
          return (
            <Link
              key={stage.key}
              href={`/admin/orders?stage=${stage.key}`}
              className={`group rounded-xl border ${stage.color} ${stage.bg} p-4 shadow-sm hover:shadow-md transition-all duration-150 hover:-translate-y-0.5`}
            >
              <p className={`text-3xl font-bold tracking-tight mb-2 ${count > 0 ? "text-foreground" : "text-muted-foreground/50"}`}>
                {count}
              </p>
              <p className="text-xs font-medium text-foreground/80 leading-snug">
                {stage.label}
              </p>
              {stage.subLabel && (
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                  {stage.subLabel}
                </p>
              )}
            </Link>
          );
        })}
      </div>

      {/* Recent Orders */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">הזמנות אחרונות</h2>
          <Link
            href="/admin/orders"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            כל ההזמנות ←
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <p className="text-muted-foreground">אין הזמנות עדיין</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-xl border bg-background shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/60 border-b">
                    <th className="px-4 py-3 text-start font-semibold text-foreground">
                      שם הנפש
                    </th>
                    <th className="px-4 py-3 text-start font-semibold text-foreground">
                      שם המזמין
                    </th>
                    <th className="px-4 py-3 text-start font-semibold text-foreground w-[120px]">
                      תאריך יצירה
                    </th>
                    <th className="px-4 py-3 text-start font-semibold text-foreground w-[200px]">
                      סטטוס
                    </th>
                    <th className="px-4 py-3 text-end font-semibold text-foreground w-[100px]" />
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        {order.person_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {order.buyer_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString(
                          "he-IL",
                          { timeZone: "Asia/Jerusalem" }
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge order={order} />
                      </td>
                      <td className="px-4 py-3 text-end">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                        >
                          פתח
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-3">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-lg border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-medium">
                      {order.person_name || "—"}
                    </span>
                    <StatusBadge order={order} />
                  </div>
                  <div className="text-sm text-muted-foreground flex flex-col gap-0.5 mb-3">
                    <span>{order.buyer_name || "—"}</span>
                    <span>
                      {new Date(order.created_at).toLocaleDateString("he-IL", {
                        timeZone: "Asia/Jerusalem",
                      })}
                    </span>
                  </div>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                  >
                    פתח
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Site Analytics */}
      <AdminAnalyticsSection />
    </div>
  );
}
