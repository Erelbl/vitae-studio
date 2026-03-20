import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSignedImageUrls } from "@/lib/storage-image";
import { loadPreviewData } from "@/lib/preview/loader";
import { AlbumEditorLayout } from "@/components/admin/AlbumEditorLayout";
import type { EditorPage, PhotoForEditor } from "@/components/admin/AlbumPageEditor";
import { STATUS_LABELS } from "@/lib/state-machine";
import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/types/order";
import type { TextAlign, TextColor, TextSize } from "@/types/page";

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
  // Load both UI-quality (1800px) and PDF-quality (2400px) in parallel.
  const [previewData, pdfPreviewData] = await Promise.all([
    loadPreviewData(orderId, personName),
    // "original" = no Supabase transform → full source resolution, lossless,
    // and uses efficient batch signing (single API call).
    // The PDF exporter applies its own contain/no-crop layout via CSS.
    loadPreviewData(orderId, personName, "original"),
  ]);

  // ── Editor data: all pages with text, layout, page_images ────────────────
  // Include all page types so admins can upload images to cover/dedication/etc.
  //
  // NOTE: text_size is intentionally excluded from this query.
  // It requires migration 00027 (ADD COLUMN text_size) which may not be applied yet.
  // A failed query would return data:null and silently make editorPages empty,
  // causing the "no pages to edit" empty state even when pages exist.
  // text_size is loaded separately below with a graceful null fallback.
  const { data: editorPagesRaw, error: editorPagesError } = await adminClient
    .from("pages")
    .select("id, page_number, page_type, layout_type, text_content, text_version")
    .eq("order_id", orderId)
    .order("page_number");

  if (editorPagesError) {
    console.error("[preview] Failed to load editor pages:", editorPagesError.message);
  }

  const editorPageIds = (editorPagesRaw ?? []).map((p) => p.id as string);

  // Load style columns separately — graceful fallback to null if migrations
  // 00027/00028 haven't been applied yet (columns may not exist).
  type PageStyleRow = {
    text_size: TextSize | null;
    font_size_px: number | null;
    text_align: TextAlign | null;
    text_x: number | null;
    text_y: number | null;
    text_color: TextColor | null;
  };
  const pageStyleMap = new Map<string, PageStyleRow>();
  if (editorPageIds.length > 0) {
    const { data: styleRows } = await adminClient
      .from("pages")
      .select("id, text_size, font_size_px, text_align, text_x, text_y, text_color")
      .in("id", editorPageIds);
    for (const r of styleRows ?? []) {
      const row = r as Record<string, unknown>;
      pageStyleMap.set(r.id as string, {
        text_size: (row.text_size as TextSize | null) ?? null,
        font_size_px: (row.font_size_px as number | null) ?? null,
        text_align: (row.text_align as TextAlign | null) ?? null,
        text_x: (row.text_x as number | null) ?? null,
        text_y: (row.text_y as number | null) ?? null,
        text_color: (row.text_color as TextColor | null) ?? null,
      });
    }
  }

  const { data: pageImagesRaw } =
    editorPageIds.length > 0
      ? await adminClient
          .from("page_images")
          .select("page_id, slot, photo_id, crop_x, crop_y, scale, manual_image_path, frame_style")
          .in("page_id", editorPageIds)
      : { data: [] as {
          page_id: unknown; slot: unknown; photo_id: unknown;
          crop_x: unknown; crop_y: unknown; scale: unknown; manual_image_path: unknown;
          frame_style: unknown;
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

  // Sign all paths with thumb transform (300px, q70) for editor/picker display
  const signedUrlMap = await createSignedImageUrls(
    adminClient,
    BUCKET,
    Array.from(allPaths),
    3600,
    "thumb"
  );

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
      frame_style: (pi.frame_style as string | null) ?? null,
      image_url,
    });
    pageImagesMap.set(pid, existing);
  }

  // Build editor pages array
  const editorPages: EditorPage[] = (editorPagesRaw ?? []).map((p) => {
    const style = pageStyleMap.get(p.id as string);
    return {
      id: p.id as string,
      page_number: p.page_number as number,
      page_type: p.page_type as string,
      layout_type: (p.layout_type as string | null) ?? "FULL_IMAGE",
      text_content: (p.text_content as string | null) ?? null,
      text_version: (p.text_version as number) ?? 1,
      text_size: style?.text_size ?? null,
      font_size_px: style?.font_size_px ?? null,
      text_align: style?.text_align ?? null,
      text_x: style?.text_x ?? null,
      text_y: style?.text_y ?? null,
      text_color: style?.text_color ?? null,
      images: pageImagesMap.get(p.id as string) ?? [],
    };
  });

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 space-y-8">
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

      {/* Album preview + editor — connected via AlbumEditorLayout client wrapper */}
      <AlbumEditorLayout
        previewData={previewData}
        pdfPreviewData={pdfPreviewData}
        editorPages={editorPages}
        completedPhotos={completedPhotos}
        orderId={orderId}
        personName={personName}
      />
    </div>
  );
}
