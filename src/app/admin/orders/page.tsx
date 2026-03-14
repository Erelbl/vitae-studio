import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STATUS_LABELS } from "@/lib/state-machine";
import type { OrderStatus } from "@/types/order";
import { DeleteOrderButton } from "@/components/admin/DeleteOrderButton";

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
  const colorClass = STATUS_COLORS[status] ?? "bg-gray-50 text-gray-600 border-gray-200";
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

export default async function AdminOrdersPage() {
  const supabase = createAdminClient();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return <p className="text-destructive">שגיאה בטעינת ההזמנות</p>;
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6">
      <h1 className="mb-6 text-2xl font-bold">הזמנות</h1>
      {orders && orders.length > 0 ? (
        <div className="hidden md:block rounded-xl border bg-background shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead className="px-4 py-3 font-semibold text-foreground w-[120px]">
                  מזהה הזמנה
                </TableHead>
                <TableHead className="px-4 py-3 font-semibold text-foreground">
                  שם הנפש
                </TableHead>
                <TableHead className="px-4 py-3 font-semibold text-foreground">
                  שם המזמין
                </TableHead>
                <TableHead className="px-4 py-3 font-semibold text-foreground w-[130px]">
                  טלפון
                </TableHead>
                <TableHead className="px-4 py-3 font-semibold text-foreground w-[180px]">
                  סטטוס
                </TableHead>
                <TableHead className="px-4 py-3 font-semibold text-foreground w-[120px]">
                  תאריך יצירה
                </TableHead>
                <TableHead className="px-4 py-3 font-semibold text-foreground text-end w-[150px]">
                  פעולות
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow
                  key={order.id}
                  className="cursor-pointer transition-colors hover:bg-muted/40 border-b last:border-b-0"
                >
                  <TableCell className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-mono text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      {order.id.slice(0, 8)}…
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="hover:text-primary transition-colors"
                    >
                      {order.person_name || "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {order.buyer_name || "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground font-mono text-sm">
                    {order.buyer_phone || "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <StatusBadge status={order.status as OrderStatus} />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground text-sm">
                    {new Date(order.created_at).toLocaleDateString("he-IL", {
                      timeZone: "Asia/Jerusalem",
                    })}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-end">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                      >
                        פתח
                      </Link>
                      <DeleteOrderButton
                        orderId={order.id}
                        personName={order.person_name}
                        compact
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-muted-foreground">אין הזמנות עדיין</p>
      )}

      {/* Mobile fallback — simple card list */}
      {orders && orders.length > 0 && (
        <div className="md:hidden flex flex-col gap-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-lg border bg-background p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="font-medium hover:text-primary transition-colors"
                >
                  {order.person_name || "—"}
                </Link>
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
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                >
                  פתח
                </Link>
                <DeleteOrderButton
                  orderId={order.id}
                  personName={order.person_name}
                  compact
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
