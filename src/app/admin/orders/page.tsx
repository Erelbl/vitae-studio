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
import { getDisplayStatus, getPipelineStage, PIPELINE_STAGES } from "@/lib/display-status";
import type { PipelineStage } from "@/lib/display-status";
import { DeleteOrderButton } from "@/components/admin/DeleteOrderButton";

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

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage: stageFilter } = await searchParams;

  const supabase = createAdminClient();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return <p className="text-destructive">שגיאה בטעינת ההזמנות</p>;
  }

  // Filter by pipeline stage if specified
  const validStage = PIPELINE_STAGES.find((s) => s.key === stageFilter);
  const filteredOrders = validStage
    ? (orders ?? []).filter((order) => {
        const orderStage = getPipelineStage(order as {
          status: string;
          payment_status?: string | null;
          preview_status?: string | null;
          preview_round?: number | null;
          sent_to_print_at?: string | null;
          shipped_to_customer_at?: string | null;
          completed_at?: string | null;
        });
        return orderStage === stageFilter;
      })
    : (orders ?? []);

  const stageLabel = validStage?.label;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">הזמנות</h1>
          {stageLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium bg-muted/60">
              {stageLabel}
              <Link
                href="/admin/orders"
                className="text-muted-foreground hover:text-foreground transition-colors ms-1"
                title="הסר סינון"
              >
                ✕
              </Link>
            </span>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {filteredOrders.length} הזמנות
        </span>
      </div>

      {/* Stage filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href="/admin/orders"
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            !validStage
              ? "bg-foreground text-background border-foreground"
              : "bg-background text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          הכל
        </Link>
        {PIPELINE_STAGES.map((stage) => (
          <Link
            key={stage.key}
            href={`/admin/orders?stage=${stage.key}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              stageFilter === stage.key
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {stage.label}
          </Link>
        ))}
      </div>

      {filteredOrders.length > 0 ? (
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
              {filteredOrders.map((order) => (
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
        <p className="text-muted-foreground">
          {validStage ? "אין הזמנות בשלב זה" : "אין הזמנות עדיין"}
        </p>
      )}

      {/* Mobile fallback — simple card list */}
      {filteredOrders.length > 0 && (
        <div className="md:hidden flex flex-col gap-3">
          {filteredOrders.map((order) => (
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
