import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPreviewData } from "@/lib/preview/loader";
import { AlbumPreview } from "@/components/album/AlbumPreview";
import { IllustrationPageMapper } from "@/components/admin/IllustrationPageMapper";
import type { PageForMapper, CompletedPhotoForMapper } from "@/components/admin/IllustrationPageMapper";
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

  // Load preview data (signed URLs for illustrations already on pages)
  const previewData = await loadPreviewData(orderId, personName);

  // Load pages with photo_id info for the mapper (only illustration_and_text pages)
  const { data: rawPages } = await adminClient
    .from("pages")
    .select("id, page_number, page_type, photo_id")
    .eq("order_id", orderId)
    .eq("page_type", "illustration_and_text")
    .order("page_number");

  const mapperPages: PageForMapper[] = (rawPages ?? []).map((p) => ({
    id: p.id as string,
    page_number: p.page_number as number,
    photo_id: (p.photo_id as string | null) ?? null,
  }));

  // Load completed illustrations for the picker
  const { data: completedPhotosRaw } = await adminClient
    .from("photos")
    .select("id, illustration_storage_path, original_filename, life_stage")
    .eq("order_id", orderId)
    .eq("illustration_status", "completed")
    .order("display_order");

  const completedPhotos: CompletedPhotoForMapper[] = completedPhotosRaw
    ? await Promise.all(
        completedPhotosRaw.map(async (photo) => {
          let illustrationUrl: string | null = null;
          if (photo.illustration_storage_path) {
            const { data: urlData } = await adminClient.storage
              .from("illustrations")
              .createSignedUrl(photo.illustration_storage_path as string, 3600);
            illustrationUrl = urlData?.signedUrl ?? null;
          }
          return {
            id: photo.id as string,
            illustrationUrl,
            original_filename: photo.original_filename as string,
            life_stage: (photo.life_stage as string | null) ?? null,
          };
        })
      )
    : [];

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 space-y-8">
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
          <Badge variant="secondary">
            {STATUS_LABELS[currentStatus] || currentStatus}
          </Badge>
        </div>
      </div>

      {/* Internal notice */}
      <div className="rounded-xl border border-blue-200/70 bg-blue-50/60 px-4 py-3 text-center text-xs text-blue-700/90 leading-relaxed">
        תצוגה פנימית בלבד — הלקוח אינו יכול לראות את האלבום עד לאחר פרסום
      </div>

      {/* Album preview — centered, max-w-3xl */}
      <div className="max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/60 font-semibold mb-3 text-center">
          תצוגה מקדימה
        </p>
        <h1 className="text-2xl font-semibold text-center mb-6">
          סיפורו של {personName}
        </h1>
        <AlbumPreview data={previewData} />
      </div>

      {/* Illustration-to-page mapper */}
      {mapperPages.length > 0 && (
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold">שיוך איורים לעמודים</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              שייך איור מוכן לכל עמוד תוכן. לאחר השיוך האיור יופיע בתצוגה המקדימה.
            </p>
          </div>
          <IllustrationPageMapper
            orderId={orderId}
            pages={mapperPages}
            completedPhotos={completedPhotos}
          />
        </section>
      )}
    </div>
  );
}
