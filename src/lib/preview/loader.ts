import { createAdminClient } from "@/lib/supabase/admin";
import { getMockPreviewPages, MOCK_PERSON_NAME } from "./mock-data";
import type { PageType, PreviewData } from "@/types/page";

const ILLUSTRATIONS_BUCKET = "illustrations";

export async function loadPreviewData(
  orderId: string,
  personName: string
): Promise<PreviewData> {
  const supabase = createAdminClient();

  const { data: pages, error } = await supabase
    .from("pages")
    .select(
      "id, page_number, page_type, text_content, illustration_storage_path"
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
