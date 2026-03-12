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
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ draftId?: string }>;
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

  const personName = (order.person_name as string | null) || "האדם היקר";
  const currentStatus = order.status as OrderStatus;

  // Resolve which draft to display (latest if none specified)
  const activeDraftId = draftId ?? (drafts?.[0]?.id as string | undefined) ?? null;
  const activeDraft = drafts?.find((d) => d.id === activeDraftId);

  const previewData = await loadPreviewData(orderId, personName, activeDraftId);

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
            href={`/admin/orders/${orderId}/draft-text${activeDraftId ? `?draftId=${activeDraftId}` : ""}`}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            צפייה בטקסט שנוצר
          </Link>
          <Badge variant="secondary">{STATUS_LABELS[currentStatus] || currentStatus}</Badge>
        </div>
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
                href={`/admin/orders/${orderId}/preview?draftId=${draft.id}`}
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

      {/* Internal notice */}
      <div className="rounded-xl border border-blue-200/70 bg-blue-50/60 px-4 py-3 text-center text-xs text-blue-700/90 leading-relaxed">
        תצוגה פנימית בלבד — הלקוח אינו יכול לראות את האלבום עד לאחר פרסום
        {activeDraft && (
          <span className="ms-2 opacity-75">
            · גרסה {activeDraft.version_number as number}
          </span>
        )}
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
