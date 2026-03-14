"use client";

import { useState } from "react";
import { AlbumPreview } from "@/components/album/AlbumPreview";
import { AlbumPageEditor } from "@/components/admin/AlbumPageEditor";
import type { EditorPage, PhotoForEditor } from "@/components/admin/AlbumPageEditor";
import type { PreviewData } from "@/types/page";

/** Resolves which spread index contains a page with the given page_number. */
function pageToSpreadIndex(pageNumber: number, pages: PreviewData["pages"]): number {
  const idx = pages.findIndex((p) => p.page_number === pageNumber);
  if (idx === -1) return 0;
  return Math.floor(idx / 2);
}

/**
 * Client-side shell that connects AlbumPreview navigation with the
 * AlbumPageEditor page-selector so that clicking a page button in the
 * editor automatically scrolls the preview to that spread.
 */
export function AlbumEditorLayout({
  previewData,
  editorPages,
  completedPhotos,
  orderId,
  personName,
}: {
  previewData: PreviewData;
  editorPages: EditorPage[];
  completedPhotos: PhotoForEditor[];
  orderId: string;
  personName: string;
}) {
  const [focusedSpreadIndex, setFocusedSpreadIndex] = useState<number | undefined>();

  function handlePageSelect(pageNumber: number) {
    setFocusedSpreadIndex(pageToSpreadIndex(pageNumber, previewData.pages));
  }

  return (
    <>
      {/* Album preview */}
      <div className="max-w-4xl mx-auto">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/60 font-semibold mb-3 text-center">
          תצוגה מקדימה
        </p>
        <h1 className="text-2xl font-semibold text-center mb-6">
          סיפורו של {personName}
        </h1>
        <AlbumPreview data={previewData} focusedSpreadIndex={focusedSpreadIndex} />
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
          onPageSelect={handlePageSelect}
        />
      </section>
    </>
  );
}
