"use client";

import { useEffect, useMemo, useState } from "react";
import { AlbumPreview } from "@/components/album/AlbumPreview";
import { AlbumPageEditor } from "@/components/admin/AlbumPageEditor";
import type { EditorPage, PhotoForEditor } from "@/components/admin/AlbumPageEditor";
import type { PreviewData, PreviewPage } from "@/types/page";

/**
 * Resolves which spread index contains a page with the given page_number.
 * Mirrors buildSpreads() in AlbumPreview: cover + back_cover are singletons.
 */
function pageToSpreadIndex(pageNumber: number, pages: PreviewData["pages"]): number {
  let spreadIdx = 0;
  let i = 0;
  while (i < pages.length) {
    const page = pages[i];
    const isSingleton = page.page_type === "cover" || page.page_type === "back_cover";
    if (page.page_number === pageNumber) return spreadIdx;
    if (!isSingleton && pages[i + 1]?.page_number === pageNumber) return spreadIdx;
    spreadIdx++;
    i += isSingleton ? 1 : 2;
  }
  return 0;
}

/**
 * Client-side shell that:
 * 1. Owns the side-by-side layout: narrow controls column (right in RTL) +
 *    large album preview column (left in RTL, sticky).
 * 2. Owns `pageOverrides` — the single source of truth for in-flight style
 *    edits (font size, alignment, text position, text content) that have been
 *    saved to the DB but not yet reflected in a fresh server render.
 * 3. Owns text drag state — `textDragMode` and `selectedPageId` — so that
 *    dragging happens directly on the large AlbumPreview, not on a mini-preview.
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

  /** The page currently open in the editor — needed to target the drag overlay. */
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  /** Whether text drag mode is active for the currently selected page. */
  const [textDragMode, setTextDragMode] = useState(false);

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
   * slider released, alignment button clicked, etc.).
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
   * This is what AlbumPreview (large) reads from.
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

  /** Called when the user selects a page in the editor. */
  function handlePageSelect(pageNumber: number, pageId: string) {
    setFocusedSpreadIndex(pageToSpreadIndex(pageNumber, livePreviewData.pages));
    setSelectedPageId(pageId);
    setTextDragMode(false); // exit drag mode when switching pages
  }

  /**
   * Called when the user navigates prev/next in the large AlbumPreview.
   * Resolves the first page of the new spread and pushes it back to the editor
   * so the editor selection stays in sync with the preview.
   */
  function handlePreviewSpreadChange(firstPageNumber: number) {
    const page = livePreviewData.pages.find((p) => p.page_number === firstPageNumber);
    if (!page) return;
    setSelectedPageId(page.id);
    setTextDragMode(false);
    // No need to update focusedSpreadIndex here — the preview already navigated there.
  }

  /** Toggle text drag mode for the currently selected page. */
  function handleTextDragToggle(active: boolean) {
    setTextDragMode(active);
  }

  /**
   * Called when the user drops text on the large preview.
   * Updates pageOverrides immediately (preview re-renders) and persists to DB.
   * Does NOT call router.refresh() — that would regenerate all signed image URLs.
   */
  async function handleTextDrop(pageId: string, x: number, y: number) {
    handlePageUpdate(pageId, { text_x: x, text_y: y });
    await fetch(`/api/admin/orders/${orderId}/pages/${pageId}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_x: x, text_y: y }),
    });
  }

  /**
   * Clear custom text position for the given page.
   * Updates pageOverrides immediately and persists to DB.
   */
  async function handleClearTextPosition(pageId: string) {
    handlePageUpdate(pageId, { text_x: null, text_y: null });
    await fetch(`/api/admin/orders/${orderId}/pages/${pageId}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_x: null, text_y: null }),
    });
  }

  // Current text position for the selected page — drives "איפוס מיקום" visibility.
  const selectedPageLive = livePreviewData.pages.find((p) => p.id === selectedPageId) ?? null;
  const currentTextX = selectedPageLive?.text_x ?? null;
  const currentTextY = selectedPageLive?.text_y ?? null;

  // Diagnostic: preview has real pages but editor failed to load them.
  const previewHasRealPages = !previewData.isMock && previewData.pages.length > 0;
  const editorLoadFailed = previewHasRealPages && editorPages.length === 0;

  return (
    /*
      Side-by-side layout:
        - In RTL, grid column 1 renders on the RIGHT → controls (narrow)
        - In RTL, grid column 2 renders on the LEFT  → large preview
      Stacks vertically below lg breakpoint.
    */
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">

      {/* Controls column — right side in RTL */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">עריכת עמודים</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            ערוך טקסט, פריסה ואיורים לכל עמוד. שינויים נשמרים אוטומטית.
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
            onPageSelect={handlePageSelect}
            onPageUpdate={handlePageUpdate}
            textDragMode={textDragMode}
            onTextDragToggle={handleTextDragToggle}
            onClearTextPosition={handleClearTextPosition}
            currentTextX={currentTextX}
            currentTextY={currentTextY}
            externalPageId={selectedPageId}
          />
        )}
      </section>

      {/* Preview column — left side in RTL, sticky so it stays visible while scrolling controls */}
      <div className="lg:sticky lg:top-6 space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/60 font-semibold text-center">
          תצוגה מקדימה
        </p>
        <h1 className="text-2xl font-semibold text-center">
          סיפורו של {personName}
        </h1>

        {/* Large album preview — the real editing surface */}
        <AlbumPreview
          data={livePreviewData}
          focusedSpreadIndex={focusedSpreadIndex}
          textDragPageId={textDragMode && selectedPageId ? selectedPageId : undefined}
          textDragMode={textDragMode}
          onTextDrop={handleTextDrop}
          onSpreadChange={handlePreviewSpreadChange}
        />
      </div>

    </div>
  );
}
