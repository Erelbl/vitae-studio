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

function getStatusVariant(status: OrderStatus) {
  switch (status) {
    case "delivered":
      return "default";
    case "approved":
      return "default";
    case "error_generation":
      return "destructive";
    case "admin_review":
      return "secondary";
    default:
      return "outline";
  }
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
    <div>
      <h1 className="mb-6 text-2xl font-bold">הזמנות</h1>
      {orders && orders.length > 0 ? (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>תאריך</TableHead>
                <TableHead>שם</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>מזמין</TableHead>
                <TableHead>תשלום</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-primary hover:underline"
                    >
                      {new Date(order.created_at).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    {order.person_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(order.status as OrderStatus)}>
                      {STATUS_LABELS[order.status as OrderStatus] || order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{order.buyer_name || "-"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        order.payment_status === "paid"
                          ? "default"
                          : "outline"
                      }
                    >
                      {order.payment_status === "paid" ? "שולם" : "ממתין"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-muted-foreground">אין הזמנות עדיין</p>
      )}
    </div>
  );
}
