"use client";

import { useEffect, useMemo, useState } from "react";
import { AlbumPreview } from "@/components/album/AlbumPreview";
import { AlbumPageEditor } from "@/components/admin/AlbumPageEditor";
import type { EditorPage, PhotoForEditor } from "@/components/admin/AlbumPageEditor";
import type { PreviewData, PreviewPage } from "@/types/page";

/** Resolves which spread index contains a page with the given page_number. */
function pageToSpreadIndex(pageNumber: number, pages: PreviewData["pages"]): number {
  const idx = pages.findIndex((p) => p.page_number === pageNumber);
  if (idx === -1) return 0;
  return Math.floor(idx / 2);
}

/**
 * Client-side shell that:
 * 1. Connects AlbumPreview navigation with the AlbumPageEditor page-selector.
 * 2. Owns the `pageOverrides` map — the single source of truth for in-flight
 *    style edits (font size, alignment, text position) that have been saved to
 *    the DB but not yet reflected in a fresh server render.
 *
 * Data flow:
 *   Server          → previewData (static until router.refresh())
 *   PageEditorPanel → calls onPageUpdate() when a style commits
 *   AlbumEditorLayout merges previewData + pageOverrides → livePreviewData
 *   AlbumPreview    reads livePreviewData → updates immediately on every edit
 *
 * When router.refresh() fires (layout change, image assign, etc.) the server
 * returns fresh previewData that already contains the saved values, so
 * pageOverrides is cleared via useEffect — no stale override can linger.
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

  /**
   * Per-page style overrides accumulated from the editor without requiring a
   * full server refresh. Only fields that the editor can change without
   * triggering router.refresh() are stored here:
   *   font_size_px, text_align, text_x, text_y, text_content
   *
   * Fields that DO trigger router.refresh() (layout_type, images) are never
   * stored here — the refreshed previewData carries the updated values.
   */
  const [pageOverrides, setPageOverrides] = useState<Map<string, Partial<PreviewPage>>>(
    () => new Map()
  );

  /**
   * When router.refresh() completes, Next.js passes a new previewData object.
   * Clear all overrides: the refreshed server data is now the ground truth.
   */
  useEffect(() => {
    setPageOverrides(new Map());
  }, [previewData]);

  /**
   * Called by PageEditorPanel whenever a style value is committed (font size
   * slider released, alignment button clicked, text drag released, etc.).
   * Merges the partial update into the override map so the large AlbumPreview
   * re-renders immediately without waiting for a server round-trip.
   */
  function handlePageUpdate(pageId: string, overrides: Partial<PreviewPage>) {
    setPageOverrides((prev) => {
      const next = new Map(prev);
      next.set(pageId, { ...(prev.get(pageId) ?? {}), ...overrides });
      return next;
    });
  }

  /**
   * Merge base server data with in-flight overrides.
   * This is what both AlbumPreview (large) and the editor mini-preview read from.
   */
  const livePreviewData: PreviewData = useMemo(
    () => ({
      ...previewData,
      pages: previewData.pages.map((p) => {
        const ov = pageOverrides.get(p.id);
        return ov ? { ...p, ...ov } : p;
      }),
    }),
    [previewData, pageOverrides]
  );

  function handlePageSelect(pageNumber: number) {
    setFocusedSpreadIndex(pageToSpreadIndex(pageNumber, livePreviewData.pages));
  }

  // Diagnostic: preview has real pages but editor failed to load them.
  const previewHasRealPages = !previewData.isMock && previewData.pages.length > 0;
  const editorLoadFailed = previewHasRealPages && editorPages.length === 0;

  return (
    <>
      {/* Large album preview — reads livePreviewData so it reflects edits immediately */}
      <div className="w-full">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/60 font-semibold mb-3 text-center">
          תצוגה מקדימה
        </p>
        <h1 className="text-2xl font-semibold text-center mb-6">
          סיפורו של {personName}
        </h1>
        <AlbumPreview data={livePreviewData} focusedSpreadIndex={focusedSpreadIndex} />
      </div>

      {/* Album page editor */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">עריכת עמודים</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            ערוך טקסט, פריסה ואיורים לכל עמוד. טקסט נשמר עם ניהול גרסאות.
          </p>
        </div>

        {editorLoadFailed ? (
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-4 text-sm text-amber-800 space-y-1">
            <p className="font-medium">עמודים קיימים בתצוגה אך לא נטענו לעורך.</p>
            <p className="text-xs opacity-80">
              ייתכן שיש עדכון ממתין למסד הנתונים. נסה לרענן את הדף.
            </p>
          </div>
        ) : (
          <AlbumPageEditor
            orderId={orderId}
            pages={editorPages}
            completedPhotos={completedPhotos}
            personName={personName}
            onPageSelect={handlePageSelect}
            onPageUpdate={handlePageUpdate}
          />
        )}
      </section>
    </>
  );
}
