import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPreviewData } from "@/lib/preview/loader";
import { AlbumPreview } from "@/components/album/AlbumPreview";
import { STATUS_LABELS } from "@/lib/state-machine";
import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/types/order";

export default async function AdminOrderPreviewPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  // Verify admin — no access token required
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

  const personName = (order.person_name as string | null) || "האדם היקר";
  const currentStatus = order.status as OrderStatus;
  const previewData = await loadPreviewData(orderId, personName);

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-6">
      {/* Back + status bar */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/admin/orders/${orderId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← חזרה לפרטי הזמנה
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/orders/${orderId}/draft-text`}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            צפייה בטקסט שנוצר
          </Link>
          <Badge variant="secondary">{STATUS_LABELS[currentStatus] || currentStatus}</Badge>
        </div>
      </div>

      {/* Internal notice */}
      <div className="rounded-xl border border-blue-200/70 bg-blue-50/60 px-4 py-3 text-center text-xs text-blue-700/90 leading-relaxed">
        תצוגה פנימית בלבד — הלקוח אינו יכול לראות את האלבום עד לאחר פרסום
      </div>

      {/* Album preview */}
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-primary/60 font-semibold mb-3 text-center">
          תצוגה מקדימה
        </p>
        <h1 className="text-2xl font-semibold text-center mb-6">
          סיפורו של {personName}
        </h1>
        <AlbumPreview data={previewData} />
      </div>
    </div>
  );
}
