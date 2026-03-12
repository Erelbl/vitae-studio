import { createAdminClient } from "@/lib/supabase/admin";
import { getMockPreviewPages, MOCK_PERSON_NAME } from "./mock-data";
import type { PageType, PreviewData } from "@/types/page";

const ILLUSTRATIONS_BUCKET = "illustrations";

/**
 * Resolves which story_draft_id to use for this order.
 * - If draftId is provided, use it directly.
 * - Otherwise, use the latest draft (highest version_number).
 * - If no drafts exist at all, returns null (caller falls back to order-wide query).
 */
async function resolveDraftId(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string,
  draftId?: string | null
): Promise<string | null> {
  if (draftId) return draftId;

  const { data } = await supabase
    .from("story_drafts")
    .select("id")
    .eq("order_id", orderId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  return (data?.id as string | null) ?? null;
}

export async function loadPreviewData(
  orderId: string,
  personName: string,
  draftId?: string | null
): Promise<PreviewData> {
  const supabase = createAdminClient();

  const resolvedDraftId = await resolveDraftId(supabase, orderId, draftId);

  // Build the pages query — filter by draft if one exists, otherwise fall back
  // to the legacy order-wide query (for orders created before draft versioning).
  let query = supabase
    .from("pages")
    .select("id, page_number, page_type, text_content, illustration_storage_path");

  if (resolvedDraftId) {
    query = query.eq("story_draft_id", resolvedDraftId);
  } else {
    query = query.eq("order_id", orderId);
  }

  const { data: pages, error } = await query.order("page_number");

  if (error || !pages || pages.length === 0) {
    return {
      personName: personName || MOCK_PERSON_NAME,
      pages: getMockPreviewPages(personName || MOCK_PERSON_NAME),
      isMock: true,
    };
  }

  // Resolve signed URLs for any existing illustration paths
  const previewPages = await Promise.all(
    pages.map(async (page) => {
      let image_url: string | null = null;

      if (page.illustration_storage_path) {
        const { data: urlData } = await supabase.storage
          .from(ILLUSTRATIONS_BUCKET)
          .createSignedUrl(page.illustration_storage_path, 3600);
        image_url = urlData?.signedUrl ?? null;
      }

      return {
        id: page.id as string,
        page_number: page.page_number as number,
        page_type: page.page_type as PageType,
        text_content: (page.text_content as string | null) ?? null,
        image_url,
      };
    })
  );

  return {
    personName,
    pages: previewPages,
    isMock: false,
  };
}
