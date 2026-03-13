import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPreviewData } from "@/lib/preview/loader";
import { AlbumPreview } from "@/components/album/AlbumPreview";
import { AlbumPageEditor } from "@/components/admin/AlbumPageEditor";
import type { EditorPage, PhotoForEditor } from "@/components/admin/AlbumPageEditor";
import { STATUS_LABELS } from "@/lib/state-machine";
import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/types/order";

const BUCKET = "illustrations";

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

  // ── Preview data (page_images + batch signed URLs via loader) ─────────────
  const previewData = await loadPreviewData(orderId, personName);

  // ── Editor data: all pages with text, layout, page_images ────────────────
  // Include all page types so admins can upload images to cover/dedication/etc.
  const { data: editorPagesRaw } = await adminClient
    .from("pages")
    .select("id, page_number, page_type, layout_type, text_content, text_version")
    .eq("order_id", orderId)
    .order("page_number");

  const editorPageIds = (editorPagesRaw ?? []).map((p) => p.id as string);

  const { data: pageImagesRaw } =
    editorPageIds.length > 0
      ? await adminClient
          .from("page_images")
          .select("page_id, slot, photo_id, crop_x, crop_y, scale, manual_image_path")
          .in("page_id", editorPageIds)
      : { data: [] as {
          page_id: unknown; slot: unknown; photo_id: unknown;
          crop_x: unknown; crop_y: unknown; scale: unknown; manual_image_path: unknown;
        }[] };

  // ── Completed illustrations for the picker ────────────────────────────────
  const { data: completedPhotosRaw } = await adminClient
    .from("photos")
    .select("id, illustration_storage_path, original_filename, life_stage")
    .eq("order_id", orderId)
    .eq("illustration_status", "completed")
    .order("display_order");

  // Gather all illustration paths to sign (completed photos + page_images photos)
  const pageImagesPhotoIds = new Set<string>();
  for (const pi of pageImagesRaw ?? []) {
    if (pi.photo_id) pageImagesPhotoIds.add(pi.photo_id as string);
  }

  // Fetch paths for photos referenced in page_images (may or may not be in completedPhotos)
  const pageImagesPhotoPaths = new Map<string, string>();
  if (pageImagesPhotoIds.size > 0) {
    const { data: piPhotos } = await adminClient
      .from("photos")
      .select("id, illustration_storage_path")
      .in("id", Array.from(pageImagesPhotoIds));
    for (const ph of piPhotos ?? []) {
      if (ph.illustration_storage_path) {
        pageImagesPhotoPaths.set(ph.id as string, ph.illustration_storage_path as string);
      }
    }
  }

  // Collect all paths for batch signing
  const allPaths = new Set<string>();
  for (const ph of completedPhotosRaw ?? []) {
    if (ph.illustration_storage_path) allPaths.add(ph.illustration_storage_path as string);
  }
  for (const path of pageImagesPhotoPaths.values()) {
    allPaths.add(path);
  }
  // Also include manual_image_path values
  for (const pi of pageImagesRaw ?? []) {
    if (pi.manual_image_path) allPaths.add(pi.manual_image_path as string);
  }

  // Batch sign all paths
  const signedUrlMap = new Map<string, string>();
  if (allPaths.size > 0) {
    const { data: signedResults } = await adminClient.storage
      .from(BUCKET)
      .createSignedUrls(Array.from(allPaths), 3600);
    for (const item of signedResults ?? []) {
      if (item.signedUrl && item.path) {
        signedUrlMap.set(item.path, item.signedUrl);
      }
    }
  }

  // Build completed photos for picker
  const completedPhotos: PhotoForEditor[] = (completedPhotosRaw ?? []).map((ph) => {
    const path = ph.illustration_storage_path as string | null;
    return {
      id: ph.id as string,
      illustrationUrl: path ? (signedUrlMap.get(path) ?? null) : null,
      original_filename: ph.original_filename as string,
      life_stage: (ph.life_stage as string | null) ?? null,
    };
  });

  // Build page_images grouped by page_id
  const pageImagesMap = new Map<string, EditorPage["images"]>();
  for (const pi of pageImagesRaw ?? []) {
    const pid = pi.page_id as string;
    const manualPath = (pi.manual_image_path as string | null) ?? null;
    const photoId = (pi.photo_id as string | null) ?? null;
    // manual_image_path takes priority over photo-based illustration path
    const storagePath = manualPath ?? (photoId ? pageImagesPhotoPaths.get(photoId) : undefined);
    const image_url = storagePath ? (signedUrlMap.get(storagePath) ?? null) : null;

    const existing = pageImagesMap.get(pid) ?? [];
    existing.push({
      slot: pi.slot as number,
      photo_id: photoId,
      crop_x: (pi.crop_x as number) ?? 0,
      crop_y: (pi.crop_y as number) ?? 0,
      scale: (pi.scale as number) ?? 1,
      image_url,
    });
    pageImagesMap.set(pid, existing);
  }

  // Build editor pages array
  const editorPages: EditorPage[] = (editorPagesRaw ?? []).map((p) => ({
    id: p.id as string,
    page_number: p.page_number as number,
    page_type: p.page_type as string,
    layout_type: (p.layout_type as string | null) ?? "FULL_IMAGE",
    text_content: (p.text_content as string | null) ?? null,
    text_version: (p.text_version as number) ?? 1,
    images: pageImagesMap.get(p.id as string) ?? [],
  }));

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

      {/* Album preview — centered */}
      <div className="max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/60 font-semibold mb-3 text-center">
          תצוגה מקדימה
        </p>
        <h1 className="text-2xl font-semibold text-center mb-6">
          סיפורו של {personName}
        </h1>
        <AlbumPreview data={previewData} />
      </div>

      {/* Album page editor */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">עריכת עמודים</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            ערוך טקסט, פריסה ואיורים לכל עמוד. טקסט נשמר עם ניהול גרסאות.
          </p>
        </div>
        <AlbumPageEditor
          orderId={orderId}
          pages={editorPages}
          completedPhotos={completedPhotos}
          personName={personName}
        />
      </section>
    </div>
  );
}
