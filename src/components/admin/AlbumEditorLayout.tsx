"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlbumPreview } from "@/components/album/AlbumPreview";
import { AlbumPageEditor } from "@/components/admin/AlbumPageEditor";
import type { EditorPage, PhotoForEditor } from "@/components/admin/AlbumPageEditor";
import type { PreviewData, PreviewPage } from "@/types/page";
import { exportAlbumPdf, exportAlbumSpreadsJpgZip } from "@/lib/export-album-pdf";

/**
 * Update a cover box's x/y position inside the text_content JSON.
 * Preserves all other fields (text, size) from the existing JSON.
 */
function setCoverBoxPosition(
  textContent: string | null,
  box: 1 | 2,
  x: number,
  y: number,
  fallbackPersonName: string
): string {
  const defaults = {
    box1: { text: fallbackPersonName, x: 0.5, y: 0.47, size: 28 },
    box2: { text: "סיפור חיים בחרוזים", x: 0.5, y: 0.63, size: 12 },
  };
  let data = { box1: { ...defaults.box1 }, box2: { ...defaults.box2 } };
  if (textContent) {
    try {
      const p = JSON.parse(textContent);
      if (p && typeof p === "object") {
        if (p.box1) data.box1 = { ...defaults.box1, ...p.box1 };
        if (p.box2) data.box2 = { ...defaults.box2, ...p.box2 };
      }
    } catch {}
  }
  if (box === 1) data.box1 = { ...data.box1, x, y };
  else data.box2 = { ...data.box2, x, y };
  return JSON.stringify(data);
}

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
  pdfPreviewData,
  editorPages,
  completedPhotos,
  orderId,
  personName,
}: {
  previewData: PreviewData;
  pdfPreviewData?: PreviewData;
  editorPages: EditorPage[];
  completedPhotos: PhotoForEditor[];
  orderId: string;
  personName: string;
}) {
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  const [jpgProgress, setJpgProgress] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [focusedSpreadIndex, setFocusedSpreadIndex] = useState<number | undefined>();

  /**
   * Admin-only visual aid — overlays horizontal guide lines on the large
   * preview to help compare text alignment between the right/left pages of a
   * spread. Local UI state only: never persisted, never affects rendering for
   * customers, PDF, JPG export, or film. See AlignmentGuideOverlay.
   */
  const [showAlignmentGuide, setShowAlignmentGuide] = useState(false);

  /** The page currently open in the editor — needed to target the drag overlay. */
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  /** Whether text drag mode is active for the currently selected page. */
  const [textDragMode, setTextDragMode] = useState(false);

  /**
   * Which cover text box (1 = title, 2 = subtitle) is being dragged.
   * When non-null, textDragMode is also true and the drop handler updates
   * the cover JSON instead of text_x/text_y columns.
   */
  const [coverDragBox, setCoverDragBox] = useState<1 | 2 | null>(null);

  /** Page being image-edited on the large preview canvas. */
  const [imageEditPageId, setImageEditPageId] = useState<string | null>(null);
  /** Slot being image-edited (1 or 2). */
  const [imageEditSlot] = useState<1 | 2>(1);

  /** Page/slot currently in on-canvas crop mode (null = inactive). */
  const [cropModePageId, setCropModePageId] = useState<string | null>(null);
  const [cropModeSlot, setCropModeSlot] = useState<1 | 2>(1);
  /** Snapshot of crop insets when crop mode was entered — used to revert on cancel. */
  const [originalCropInsets, setOriginalCropInsets] = useState<{
    top: number; right: number; bottom: number; left: number;
  } | null>(null);

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

  /**
   * Called when the user makes a final image drag/resize on the large preview.
   * Updates pageOverrides immediately for instant feedback, then PATCHes the DB.
   */
  function handleImageUpdate(
    pageId: string,
    slot: 1 | 2,
    cropX: number,
    cropY: number,
    scale: number,
    final: boolean
  ) {
    setPageOverrides((prev) => {
      const existing = prev.get(pageId);
      const serverPage = previewData.pages.find((p) => p.id === pageId);
      if (!serverPage) return prev;
      const baseImages = (existing?.images ?? serverPage.images ?? []) as NonNullable<PreviewPage["images"]>;
      const slotExists = baseImages.some((img) => img.slot === slot);
      const newImages = slotExists
        ? baseImages.map((img) =>
            img.slot === slot ? { ...img, crop_x: cropX, crop_y: cropY, scale } : img
          )
        : [
            ...baseImages,
            {
              id: `local-${slot}`,
              slot,
              crop_x: cropX,
              crop_y: cropY,
              scale,
              photo_id: null,
              // Preserve the legacy image_url (pages.illustration_storage_path) so
              // the image stays visible in non-edit mode. Without this, the local slot
              // with image_url:null would shadow the legacy fallback in resolveSlot().
              image_url: slot === 1 ? (serverPage.image_url ?? null) : null,
              frame_style: null,
              use_nobg: false,
              crop_inset_top: 0, crop_inset_right: 0, crop_inset_bottom: 0, crop_inset_left: 0,
            },
          ];
      const next = new Map(prev);
      next.set(pageId, { ...(existing ?? {}), images: newImages });
      return next;
    });

    if (final) {
      fetch(`/api/admin/orders/${orderId}/pages/${pageId}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, crop_x: cropX, crop_y: cropY, scale }),
      }).catch(console.error);
    }
  }

  /**
   * Enter on-canvas crop mode for a specific page slot.
   * Navigates to the spread, records original insets for cancel, deactivates drag overlay.
   */
  function handleEnterCropMode(pageId: string, slot: 1 | 2) {
    setCropModePageId(pageId);
    setCropModeSlot(slot);
    setImageEditPageId(null); // deactivate drag overlay while crop mode is active

    const page = livePreviewData.pages.find((p) => p.id === pageId);
    const slotData = page?.images?.find((img) => img.slot === slot);
    setOriginalCropInsets({
      top:    slotData?.crop_inset_top    ?? 0,
      right:  slotData?.crop_inset_right  ?? 0,
      bottom: slotData?.crop_inset_bottom ?? 0,
      left:   slotData?.crop_inset_left   ?? 0,
    });

    if (page) {
      setFocusedSpreadIndex(pageToSpreadIndex(page.page_number, livePreviewData.pages));
    }
  }

  /** Update crop insets live (called on every handle drag move). */
  function handleCropUpdate(top: number, right: number, bottom: number, left: number) {
    if (!cropModePageId) return;
    setPageOverrides((prev) => {
      const existing = prev.get(cropModePageId);
      const serverPage = previewData.pages.find((p) => p.id === cropModePageId);
      if (!serverPage) return prev;
      const baseImages = (existing?.images ?? serverPage.images ?? []) as NonNullable<PreviewPage["images"]>;
      const slotIdx = baseImages.findIndex((img) => img.slot === cropModeSlot);
      const updatedSlot = slotIdx >= 0
        ? { ...baseImages[slotIdx], crop_inset_top: top, crop_inset_right: right, crop_inset_bottom: bottom, crop_inset_left: left }
        : { id: `local-crop-${cropModeSlot}`, slot: cropModeSlot, crop_x: 0.5, crop_y: 0.5, scale: 1, photo_id: null, image_url: cropModeSlot === 1 ? (serverPage.image_url ?? null) : null, frame_style: null, use_nobg: false, crop_inset_top: top, crop_inset_right: right, crop_inset_bottom: bottom, crop_inset_left: left };
      const newImages = slotIdx >= 0
        ? baseImages.map((img, i) => (i === slotIdx ? updatedSlot : img))
        : [...baseImages, updatedSlot];
      const next = new Map(prev);
      next.set(cropModePageId, { ...(existing ?? {}), images: newImages });
      return next;
    });
  }

  /** Confirm crop — persist to DB and exit crop mode. */
  async function handleCropConfirm(top: number, right: number, bottom: number, left: number) {
    if (!cropModePageId) return;
    handleCropUpdate(top, right, bottom, left);
    await fetch(`/api/admin/orders/${orderId}/pages/${cropModePageId}/images`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: cropModeSlot, crop_inset_top: top, crop_inset_right: right, crop_inset_bottom: bottom, crop_inset_left: left }),
    }).catch(console.error);
    setCropModePageId(null);
    setOriginalCropInsets(null);
  }

  /** Cancel crop — revert to original insets and exit crop mode. */
  function handleCropCancel() {
    if (originalCropInsets) {
      handleCropUpdate(originalCropInsets.top, originalCropInsets.right, originalCropInsets.bottom, originalCropInsets.left);
    }
    setCropModePageId(null);
    setOriginalCropInsets(null);
  }

  /** Called when the user selects a page in the editor. */
  function handlePageSelect(pageNumber: number, pageId: string) {
    setFocusedSpreadIndex(pageToSpreadIndex(pageNumber, livePreviewData.pages));
    setSelectedPageId(pageId);
    setImageEditPageId(pageId); // auto-activate image editing for the selected page
    setTextDragMode(false); // exit drag mode when switching pages
    setCoverDragBox(null);
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
    if (!active) setCoverDragBox(null);
  }

  /**
   * Toggle cover box drag mode. Activating sets textDragMode so the overlay
   * renders on the cover page; deactivating (box=null) clears everything.
   */
  function handleCoverBoxDragToggle(box: 1 | 2 | null) {
    setCoverDragBox(box);
    setTextDragMode(box !== null);
  }

  /**
   * Called when the user drops text on the large preview.
   * For regular pages: updates text_x/text_y columns.
   * For cover pages (when coverDragBox is set): updates box position in text_content JSON.
   * Updates pageOverrides immediately (preview re-renders) and persists to DB.
   */
  async function handleTextDrop(pageId: string, x: number, y: number) {
    if (coverDragBox !== null) {
      // Cover box positioning — update the JSON stored in text_content
      const currentPage = livePreviewData.pages.find((p) => p.id === pageId);
      const json = setCoverBoxPosition(currentPage?.text_content ?? null, coverDragBox, x, y, personName);
      handlePageUpdate(pageId, { text_content: json });
      await fetch(`/api/admin/orders/${orderId}/pages/${pageId}/edit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_content: json }),
      });
    } else {
      handlePageUpdate(pageId, { text_x: x, text_y: y });
      await fetch(`/api/admin/orders/${orderId}/pages/${pageId}/edit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_x: x, text_y: y }),
      });
    }
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

  /**
   * Explicitly save all current image position overrides to the DB.
   * Autosave fires on every drag-end (PATCH), but this button provides a
   * clear confirmation that all edits are persisted.
   *
   * For slots with a photo_id: uses PUT (upsert) to handle the race condition
   * where the initial photo-assignment PUT may not have completed yet.
   * For slots without a photo_id (legacy/manual images): uses PATCH (crop-only).
   * Slots with no image_url are skipped — they have nothing to save.
   */
  async function handleSaveAll() {
    // Collect pages to save: those with in-flight overrides + the currently
    // selected page (captures confirmed-server images that were cleared from
    // pageOverrides by a prior router.refresh() but are still in livePreviewData).
    const pageIdsToSave = new Set<string>(pageOverrides.keys());
    if (selectedPageId) pageIdsToSave.add(selectedPageId);

    // For each page, use the full live image state (server data merged with overrides).
    const slotsToSave: Array<{ pageId: string; img: PreviewPage["images"][number] }> = [];
    for (const pageId of pageIdsToSave) {
      const livePage = livePreviewData.pages.find((p) => p.id === pageId);
      if (!livePage) continue;
      for (const img of livePage.images) {
        if (img.photo_id || img.image_url) slotsToSave.push({ pageId, img });
      }
    }

    // Nothing to write — do not flash "saved".
    if (slotsToSave.length === 0) return;

    setSaveState("saving");
    let anyFailed = false;

    await Promise.all(
      slotsToSave.map(async ({ pageId, img }) => {
        let res: Response;
        if (img.photo_id) {
          // PUT upserts the row with full state including frame style.
          res = await fetch(`/api/admin/orders/${orderId}/pages/${pageId}/images`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slot: img.slot,
              photoId: img.photo_id,
              crop_x: img.crop_x,
              crop_y: img.crop_y,
              scale: img.scale,
              frame_style: img.frame_style ?? null,
              use_nobg: img.use_nobg,
            }),
          });
        } else {
          // Crop-only update for legacy / manual-upload image slots.
          res = await fetch(`/api/admin/orders/${orderId}/pages/${pageId}/images`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slot: img.slot,
              crop_x: img.crop_x,
              crop_y: img.crop_y,
              scale: img.scale,
            }),
          });
        }
        if (!res.ok) anyFailed = true;
      })
    );

    setSaveState(anyFailed ? "error" : "saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  // Current text position for the selected page — drives "איפוס מיקום" visibility.
  const selectedPageLive = livePreviewData.pages.find((p) => p.id === selectedPageId) ?? null;
  const currentTextX = selectedPageLive?.text_x ?? null;
  const currentTextY = selectedPageLive?.text_y ?? null;

  /**
   * Merge high-res PDF URLs into livePreviewData for PDF export.
   * livePreviewData has the user's current edits (crop, layout, text).
   * pdfPreviewData has the same pages but with 2400px signed URLs.
   */
  const mergedPdfData: PreviewData = useMemo(() => {
    if (!pdfPreviewData) return livePreviewData;
    return {
      ...livePreviewData,
      pages: livePreviewData.pages.map((livePage) => {
        const pdfPage = pdfPreviewData.pages.find((p) => p.id === livePage.id);
        if (!pdfPage) return livePage;
        return {
          ...livePage,
          image_url: pdfPage.image_url,
          images: livePage.images.map((liveSlot) => {
            const pdfSlot = pdfPage.images.find((s) => s.slot === liveSlot.slot);
            return pdfSlot ? { ...liveSlot, image_url: pdfSlot.image_url } : liveSlot;
          }),
        };
      }),
    };
  }, [livePreviewData, pdfPreviewData]);

  const handleExportPdf = useCallback(async () => {
    if (pdfProgress) return; // already running
    setPdfProgress("מכין...");
    try {
      await exportAlbumPdf(mergedPdfData, personName, (current, total) => {
        setPdfProgress(`${current + 1} / ${total}`);
      });
    } catch (err) {
      console.error("PDF export failed:", err);
      setPdfProgress("שגיאה");
      setTimeout(() => setPdfProgress(null), 2000);
      return;
    }
    setPdfProgress(null);
  }, [mergedPdfData, personName, pdfProgress]);

  const handleExportJpgZip = useCallback(async () => {
    if (jpgProgress) return; // already running
    setJpgProgress("מכין...");
    try {
      await exportAlbumSpreadsJpgZip(mergedPdfData, personName, (current, total) => {
        setJpgProgress(`${current + 1} / ${total}`);
      });
    } catch (err) {
      console.error("JPG export failed:", err);
      setJpgProgress(null);
      toast.error("ייצוא ה-JPG נכשל");
      return;
    }
    setJpgProgress(null);
  }, [mergedPdfData, personName, jpgProgress]);

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
            personName={personName}
            onPageSelect={handlePageSelect}
            onPageUpdate={handlePageUpdate}
            textDragMode={textDragMode}
            onTextDragToggle={handleTextDragToggle}
            onClearTextPosition={handleClearTextPosition}
            currentTextX={currentTextX}
            currentTextY={currentTextY}
            externalPageId={selectedPageId}
            coverDragBox={coverDragBox}
            onCoverBoxDragToggle={handleCoverBoxDragToggle}
            onEnterCropMode={handleEnterCropMode}
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

        {/* Action buttons row */}
        <div className="flex justify-center items-center gap-2 flex-wrap">
          {/* Save image edits */}
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saveState === "saving"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {saveState === "saving"
              ? "שומר..."
              : saveState === "saved"
              ? "✓ נשמר"
              : saveState === "error"
              ? "⚠ שגיאה"
              : "שמור שינויים"}
          </button>

          {/* Toggle image editing overlay */}
          {selectedPageId && (
            <button
              type="button"
              onClick={() =>
                setImageEditPageId((prev) => (prev ? null : selectedPageId))
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              {imageEditPageId ? "הסתר כלי עריכה" : "הצג כלי עריכה"}
            </button>
          )}

          {/* Toggle alignment guide overlay — visual aid only, never persisted or exported */}
          <button
            type="button"
            onClick={() => setShowAlignmentGuide((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-1.5 text-xs transition-colors ${
              showAlignmentGuide
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}
          >
            {showAlignmentGuide ? "✓ סרגל יישור פעיל" : "הצג סרגל יישור"}
          </button>

          {/* PDF download */}
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!!pdfProgress}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {pdfProgress ? `⏳ ${pdfProgress}` : "↓ הורד אלבום (PDF)"}
          </button>

          {/* JPG spreads (ZIP) download — print-ready export */}
          <button
            type="button"
            onClick={handleExportJpgZip}
            disabled={!!jpgProgress}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {jpgProgress ? `⏳ ${jpgProgress}` : "↓ הורד כפולות כ-JPG"}
          </button>
        </div>

        {/* Large album preview — the real editing surface */}
        <AlbumPreview
          data={livePreviewData}
          focusedSpreadIndex={focusedSpreadIndex}
          textDragPageId={textDragMode && selectedPageId ? selectedPageId : undefined}
          textDragMode={textDragMode}
          coverDragBox={coverDragBox}
          onTextDrop={handleTextDrop}
          onSpreadChange={handlePreviewSpreadChange}
          imageEditPageId={imageEditPageId}
          imageEditSlot={imageEditSlot}
          onImageUpdate={handleImageUpdate}
          onImageEditDeactivate={() => setImageEditPageId(null)}
          cropModePageId={cropModePageId}
          cropModeSlot={cropModeSlot}
          onCropUpdate={handleCropUpdate}
          onCropConfirm={handleCropConfirm}
          onCropCancel={handleCropCancel}
          showAlignmentGuide={showAlignmentGuide}
        />
      </div>

    </div>
  );
}
