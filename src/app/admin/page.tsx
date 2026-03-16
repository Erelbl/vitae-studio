import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { STATUS_LABELS } from "@/lib/state-machine";
import type { OrderStatus } from "@/types/order";

// Statuses grouped by business stage
const NEW_STATUSES: OrderStatus[] = [
  "created",
  "questionnaire_complete",
  "enrichment_complete",
  "photos_uploaded",
];
const REVIEW_STATUSES: OrderStatus[] = [
  "preview_ready",
  "admin_review",
  "revision_requested",
];
const APPROVED_STATUSES: OrderStatus[] = ["approved", "generating_pdf"];
const DELIVERED_STATUSES: OrderStatus[] = ["delivered"];

const STATUS_COLORS: Partial<Record<OrderStatus, string>> = {
  photos_uploaded: "bg-gray-100 text-gray-700 border-gray-300",
  generating_text: "bg-blue-100 text-blue-700 border-blue-300",
  generating_illustrations: "bg-blue-100 text-blue-700 border-blue-300",
  text_ready: "bg-blue-50 text-blue-600 border-blue-200",
  preview_ready: "bg-green-100 text-green-700 border-green-300",
  admin_review: "bg-yellow-100 text-yellow-700 border-yellow-300",
  approved: "bg-green-200 text-green-800 border-green-400",
  delivered: "bg-emerald-100 text-emerald-700 border-emerald-300",
  error_generation: "bg-red-100 text-red-700 border-red-300",
  revision_requested: "bg-orange-100 text-orange-700 border-orange-300",
};

const STATUS_DOT_COLORS: Partial<Record<OrderStatus, string>> = {
  photos_uploaded: "bg-gray-400",
  generating_text: "bg-blue-500",
  generating_illustrations: "bg-blue-500",
  text_ready: "bg-blue-400",
  preview_ready: "bg-green-500",
  admin_review: "bg-yellow-500",
  approved: "bg-green-600",
  delivered: "bg-emerald-500",
  error_generation: "bg-red-500",
  revision_requested: "bg-orange-500",
};

function StatusBadge({ status }: { status: OrderStatus }) {
  const colorClass =
    STATUS_COLORS[status] ?? "bg-gray-50 text-gray-600 border-gray-200";
  const dotClass = STATUS_DOT_COLORS[status] ?? "bg-gray-400";
  const label = STATUS_LABELS[status] || status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}

export default async function AdminDashboardPage() {
  const supabase = createAdminClient();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, status, person_name, buyer_name, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return <p className="text-destructive">שגיאה בטעינת נתונים</p>;
  }

  const allOrders = orders ?? [];
  const total = allOrders.length;
  const newCount = allOrders.filter((o) =>
    NEW_STATUSES.includes(o.status as OrderStatus)
  ).length;
  const reviewCount = allOrders.filter((o) =>
    REVIEW_STATUSES.includes(o.status as OrderStatus)
  ).length;
  const approvedCount = allOrders.filter((o) =>
    APPROVED_STATUSES.includes(o.status as OrderStatus)
  ).length;
  const deliveredCount = allOrders.filter((o) =>
    DELIVERED_STATUSES.includes(o.status as OrderStatus)
  ).length;

  const recentOrders = allOrders.slice(0, 8);

  const kpis = [
    {
      label: 'סה"כ הזמנות',
      value: total,
      icon: "📋",
      accent: "text-foreground",
      bg: "bg-background",
      border: "border",
    },
    {
      label: "חדשות / בתהליך",
      value: newCount,
      icon: "🔄",
      accent: "text-blue-700",
      bg: "bg-blue-50/60",
      border: "border-blue-200/80",
    },
    {
      label: "ממתינות לאישור",
      value: reviewCount,
      icon: "⏳",
      accent: "text-yellow-700",
      bg: "bg-yellow-50/60",
      border: "border-yellow-200/80",
    },
    {
      label: "מאושרות",
      value: approvedCount,
      icon: "✅",
      accent: "text-green-700",
      bg: "bg-green-50/60",
      border: "border-green-200/80",
    },
    {
      label: "נמסרו",
      value: deliveredCount,
      icon: "📦",
      accent: "text-emerald-700",
      bg: "bg-emerald-50/60",
      border: "border-emerald-200/80",
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6 space-y-8">
      <h1 className="text-2xl font-bold">לוח בקרה</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-xl ${kpi.border} ${kpi.bg} p-5 shadow-sm hover:shadow-md transition-shadow`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground tracking-wide">{kpi.label}</p>
              <span className="text-base opacity-70">{kpi.icon}</span>
            </div>
            <p className={`text-3xl font-bold tracking-tight ${kpi.accent}`}>{kpi.value}</p>
          </div>
        ))}
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
                    <th className="px-4 py-3 text-start font-semibold text-foreground w-[180px]">
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
                        <StatusBadge status={order.status as OrderStatus} />
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
                    <StatusBadge status={order.status as OrderStatus} />
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
    </div>
  );
}
