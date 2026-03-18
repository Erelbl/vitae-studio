import { createAdminClient } from "@/lib/supabase/admin";
import { createSignedImageUrls } from "@/lib/storage-image";
import { getMockPreviewPages, MOCK_PERSON_NAME } from "./mock-data";
import type { LayoutType, PageImageSlot, PageType, PreviewData, PreviewPage, TextAlign, TextColor, TextSize } from "@/types/page";

const ILLUSTRATIONS_BUCKET = "illustrations";

// Loads all pages for an order, resolves illustration signed URLs (batch),
// and loads page_images slot assignments with crop/zoom values.
export async function loadPreviewData(
  orderId: string,
  personName: string
): Promise<PreviewData> {
  const supabase = createAdminClient();

  const { data: pages, error } = await supabase
    .from("pages")
    .select(
      "id, page_number, page_type, layout_type, text_content, illustration_storage_path, text_size, font_size_px, text_align, text_x, text_y, text_color"
    )
    .eq("order_id", orderId)
    .order("page_number");

  if (error || !pages || pages.length === 0) {
    return {
      personName: personName || MOCK_PERSON_NAME,
      pages: getMockPreviewPages(personName || MOCK_PERSON_NAME),
      isMock: true,
    };
  }

  const pageIds = pages.map((p) => p.id as string);

  // Load page_images for all pages in one query
  const { data: pageImagesRaw } = await supabase
    .from("page_images")
    .select("id, page_id, photo_id, slot, crop_x, crop_y, scale, manual_image_path, frame_style")
    .in("page_id", pageIds);

  // Collect all photo_ids referenced by page_images to resolve their paths
  const photoIdsNeeded = new Set<string>();
  for (const pi of pageImagesRaw ?? []) {
    if (pi.photo_id) photoIdsNeeded.add(pi.photo_id as string);
  }

  // Fetch illustration_storage_path for those photos in one query
  const photoStoragePaths = new Map<string, string>();
  if (photoIdsNeeded.size > 0) {
    const { data: photos } = await supabase
      .from("photos")
      .select("id, illustration_storage_path")
      .in("id", Array.from(photoIdsNeeded));
    for (const ph of photos ?? []) {
      if (ph.illustration_storage_path) {
        photoStoragePaths.set(
          ph.id as string,
          ph.illustration_storage_path as string
        );
      }
    }
  }

  // Collect all unique storage paths that need signed URLs
  const allPaths = new Set<string>();
  for (const page of pages) {
    if (page.illustration_storage_path)
      allPaths.add(page.illustration_storage_path as string);
  }
  for (const path of photoStoragePaths.values()) {
    allPaths.add(path);
  }
  // Also include manual_image_path values from page_images
  for (const pi of pageImagesRaw ?? []) {
    if (pi.manual_image_path) allPaths.add(pi.manual_image_path as string);
  }

  // Sign all paths with albumPreview transform (1400px, q75) for browser display.
  // Uses parallel individual calls to enable Supabase image transforms.
  const signedUrlMap = await createSignedImageUrls(
    supabase,
    ILLUSTRATIONS_BUCKET,
    Array.from(allPaths),
    3600,
    "albumPreview"
  );

  // Build page_images map: page_id → sorted slot array
  const pageImagesMap = new Map<string, PageImageSlot[]>();
  for (const pi of pageImagesRaw ?? []) {
    const pid = pi.page_id as string;
    const manualPath = (pi.manual_image_path as string | null) ?? null;
    const photoId = (pi.photo_id as string | null) ?? null;
    // manual_image_path takes priority over photo-based illustration path
    const storagePath = manualPath ?? (photoId ? photoStoragePaths.get(photoId) : undefined);
    const image_url = storagePath ? (signedUrlMap.get(storagePath) ?? null) : null;

    const slot: PageImageSlot = {
      id: pi.id as string,
      slot: pi.slot as 1 | 2,
      photo_id: photoId,
      crop_x: (pi.crop_x as number) ?? 0,
      crop_y: (pi.crop_y as number) ?? 0,
      scale: (pi.scale as number) ?? 1,
      frame_style: (pi.frame_style as string | null) ?? null,
      image_url,
    };

    const existing = pageImagesMap.get(pid) ?? [];
    existing.push(slot);
    pageImagesMap.set(pid, existing);
  }
  for (const slots of pageImagesMap.values()) {
    slots.sort((a, b) => a.slot - b.slot);
  }

  // Build PreviewPage objects
  const previewPages: PreviewPage[] = pages.map((page) => {
    const storagePath = page.illustration_storage_path as string | null;
    const image_url = storagePath ? (signedUrlMap.get(storagePath) ?? null) : null;

    return {
      id: page.id as string,
      page_number: page.page_number as number,
      page_type: page.page_type as PageType,
      layout_type: ((page.layout_type as string | null) ?? "FULL_IMAGE") as LayoutType,
      text_content: (page.text_content as string | null) ?? null,
      image_url,
      text_size: ((page as Record<string, unknown>).text_size as TextSize | null) ?? null,
      font_size_px: ((page as Record<string, unknown>).font_size_px as number | null) ?? null,
      text_align: ((page as Record<string, unknown>).text_align as TextAlign | null) ?? null,
      text_x: ((page as Record<string, unknown>).text_x as number | null) ?? null,
      text_y: ((page as Record<string, unknown>).text_y as number | null) ?? null,
      text_color: ((page as Record<string, unknown>).text_color as TextColor | null) ?? null,
      images: pageImagesMap.get(page.id as string) ?? [],
    };
  });

  return {
    personName,
    pages: previewPages,
    isMock: false,
  };
}
