import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadPreviewData } from "@/lib/preview/loader";
import { generateAlbumPdf } from "@/services/pdf/generator";

/**
 * GET /api/admin/orders/[orderId]/pdf
 *
 * Generate and download a PDF preview of the album.
 * Requires admin auth. Uses preview-resolution signed image URLs.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;

  // Re-use the same loader that drives the preview — use "original" profile for full
  // resolution images with no Supabase transform compression.
  const previewData = await loadPreviewData(orderId, "", "original");
  const personName = previewData.personName || "האדם היקר";

  // Map PreviewPage → generateAlbumPdf input format.
  // For each page, use the first assigned illustration slot URL (slot 1).
  const pdfPages = previewData.pages.map((page) => {
    const slot1 = page.images?.find((i) => i.slot === 1);
    const illustrationUrl = slot1?.image_url ?? page.image_url ?? null;
    return {
      pageNumber: page.page_number,
      textContent: page.text_content,
      illustrationUrl,
      pageType: page.page_type,
    };
  });

  try {
    const pdfBuffer = await generateAlbumPdf({ personName, pages: pdfPages });
    const safeName = personName.replace(/[^\w\u0590-\u05FF ]/g, "").trim() || "album";

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="album-preview.pdf"`,
      },
    });
  } catch (err) {
    console.error("[pdf] generation error:", err);
    return NextResponse.json(
      { error: "PDF generation failed", details: String(err) },
      { status: 500 }
    );
  }
}
