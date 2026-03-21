import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDisplayStatus } from "@/lib/display-status";
import { DeleteOrderButton } from "@/components/admin/DeleteOrderButton";

function StatusBadge({ order }: { order: Record<string, unknown> }) {
  const ds = getDisplayStatus(order as { status: string; payment_status?: string | null; preview_status?: string | null; preview_round?: number | null });

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${ds.color}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ds.dotColor}`} />
      {ds.label}
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
                <TableHead className="px-4 py-3 font-semibold text-foreground">
                  שם הנפש
                </TableHead>
                <TableHead className="px-4 py-3 font-semibold text-foreground">
                  שם המזמין
                </TableHead>
                <TableHead className="px-4 py-3 font-semibold text-foreground w-[130px]">
                  טלפון
                </TableHead>
                <TableHead className="px-4 py-3 font-semibold text-foreground w-[220px]">
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
                  <TableCell className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="hover:text-primary transition-colors"
                    >
                      {order.person_name || "-"}
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {order.buyer_name || "-"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground font-mono text-sm">
                    {order.buyer_phone || "-"}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <StatusBadge order={order} />
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
                  {order.person_name || "-"}
                </Link>
                <StatusBadge order={order} />
              </div>
              <div className="text-sm text-muted-foreground flex flex-col gap-0.5 mb-3">
                <span>{order.buyer_name || "-"}</span>
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
