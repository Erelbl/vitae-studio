"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewData, PreviewPage } from "@/types/page";
import { AlbumPageView } from "./AlbumPageView";

interface AlbumPreviewProps {
  data: PreviewData;
  /** When set by a parent, jump the preview to this spread index. */
  focusedSpreadIndex?: number;
  /** Page ID for which text dragging is active. */
  textDragPageId?: string;
  /** Whether text drag mode is active (shows overlay + tint on target page). */
  textDragMode?: boolean;
  /**
   * When set, the active drag is for a cover text box (1 = title, 2 = subtitle).
   * Used to compute the correct initial dot position from the cover JSON.
   */
  coverDragBox?: 1 | 2 | null;
  /** Called when user drops text position on a page — (x, y) are 0–1 normalized coords. */
  onTextDrop?: (pageId: string, x: number, y: number) => void;
  /**
   * Called whenever the user navigates to a different spread (prev/next/dot click).
   * Provides the right (first) page's page_number so the editor can sync its selection.
   */
  onSpreadChange?: (firstPageNumber: number) => void;
  /** Page currently being image-edited on the large preview. */
  imageEditPageId?: string | null;
  /** Slot being edited (1 or 2). */
  imageEditSlot?: 1 | 2;
  /**
   * Called during drag (final=false) and on drop (final=true).
   * crop_x/crop_y are image center in page coords (0.5 = centered, can extend outside).
   * scale is image size as fraction of page width.
   */
  onImageUpdate?: (
    pageId: string,
    slot: 1 | 2,
    crop_x: number,
    crop_y: number,
    scale: number,
    final: boolean
  ) => void;
  /** Called when the user clicks outside the selection box to dismiss the overlay. */
  onImageEditDeactivate?: () => void;
}

/**
 * Layouts where the image fills the entire page — slot 1 is always managed by the
 * FloatingImage layer in AlbumPreview (z:2) rather than by ImageFill inside PageShell.
 * This gives consistent rendering between edit-mode (drag overlay active) and
 * non-edit-mode, and allows cross-spread bleed via overflow:visible on the container.
 *
 * Split layouts (IMAGE_TOP_TEXT_BOTTOM, TWO_IMAGES, etc.) are excluded — their images
 * sit inside sub-containers whose proportions can't be matched by the full-page anchor.
 */
const FULL_IMAGE_LAYOUT_SET = new Set([
  "FULL_IMAGE",
  "FULL_IMAGE_TEXT_TOP",
  "FULL_IMAGE_TEXT_CENTER",
]);

function isFullImagePage(page: PreviewPage): boolean {
  // Special pages optionally have a full-bleed background image in slot 1
  if (["cover", "dedication", "back_cover"].includes(page.page_type)) return true;
  return FULL_IMAGE_LAYOUT_SET.has(page.layout_type ?? "FULL_IMAGE");
}

/**
 * Groups pages into spreads:
 * - cover and back_cover appear alone (singleton spreads)
 * - all other pages pair up: (2,3), (4,5), (6,7), …
 */
function buildSpreads(pages: PreviewPage[]): [PreviewPage, PreviewPage | null][] {
  const spreads: [PreviewPage, PreviewPage | null][] = [];
  let i = 0;
  while (i < pages.length) {
    const page = pages[i];
    if (page.page_type === "cover" || page.page_type === "back_cover") {
      spreads.push([page, null]);
      i += 1;
    } else {
      spreads.push([pages[i], pages[i + 1] ?? null]);
      i += 2;
    }
  }
  return spreads;
}

export function AlbumPreview({
  data,
  focusedSpreadIndex,
  textDragPageId,
  textDragMode,
  coverDragBox,
  onTextDrop,
  onSpreadChange,
  imageEditPageId,
  imageEditSlot = 1,
  onImageUpdate,
  onImageEditDeactivate,
}: AlbumPreviewProps) {
  const { pages, personName } = data;
  const spreads = buildSpreads(pages);
  const totalSpreads = spreads.length;

  const [spreadIndex, setSpreadIndex] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  // Sync with external navigation requests (e.g. editor page selection).
  // Use a ref to suppress the onSpreadChange echo when the editor drives navigation —
  // otherwise we'd get a ping-pong between editor → preview → editor.
  const suppressNextChange = useRef(false);

  useEffect(() => {
    if (focusedSpreadIndex === undefined) return;
    const clamped = Math.max(0, Math.min(focusedSpreadIndex, totalSpreads - 1));
    suppressNextChange.current = true;
    setSpreadIndex(clamped);
    setAnimKey((k) => k + 1);
  }, [focusedSpreadIndex, totalSpreads]);

  function navigate(next: number) {
    setSpreadIndex(next);
    setAnimKey((k) => k + 1);
    if (!suppressNextChange.current && onSpreadChange) {
      const rightPage = spreads[next]?.[0];
      if (rightPage) onSpreadChange(rightPage.page_number);
    }
    suppressNextChange.current = false;
  }

  const goPrev = () => navigate(Math.max(0, spreadIndex - 1));
  const goNext = () => navigate(Math.min(totalSpreads - 1, spreadIndex + 1));

  const [rightPage, leftPage] = spreads[spreadIndex];
  const firstPageNum = rightPage.page_number;
  const lastPageNum = leftPage?.page_number ?? firstPageNum;
  const pageLabel = leftPage ? `${firstPageNum}–${lastPageNum}` : `${firstPageNum}`;

  // Which page in the current spread is being image-edited?
  const imageEditPage =
    imageEditPageId && rightPage?.id === imageEditPageId ? rightPage
    : imageEditPageId && leftPage?.id === imageEditPageId ? leftPage
    : null;
  const imageEditIsRight = imageEditPage?.id === rightPage?.id;

  // Current crop/scale/URL values for the image being edited (from live preview data)
  const editSlotData = imageEditPage?.images?.find((img) => img.slot === imageEditSlot) ?? null;
  const editCropX = editSlotData?.crop_x ?? 0.5;
  const editCropY = editSlotData?.crop_y ?? 0.5;
  const editScale = editSlotData?.scale ?? 1;
  // URL: prefer slot-specific url, fall back to legacy image_url on slot 1
  const editImageUrl =
    editSlotData?.image_url ??
    (imageEditSlot === 1 ? (imageEditPage?.image_url ?? null) : null);

  function renderPage(page: PreviewPage | null) {
    if (!page) return <div className="hidden sm:block aspect-square bg-secondary/40" />;
    const isDragTarget = Boolean(textDragMode && page.id === textDragPageId && onTextDrop);
    const isEditTarget = page.id === imageEditPageId;
    // editMode=true tells ImageFill to suppress its own render and let the
    // FloatingImage layer in AlbumPreview handle the image at z:2.
    // Applied to all full-image-layout pages so layering is consistent
    // regardless of whether the image-edit overlay is currently active.
    const editModeForPage = isEditTarget || isFullImagePage(page);

    // Compute initial dot position for the drag overlay.
    // For cover pages with an active box drag, read position from the JSON.
    // For regular pages, use text_x/text_y columns.
    let dragInitialX = page.text_x ?? null;
    let dragInitialY = page.text_y ?? null;
    if (isDragTarget && coverDragBox && page.page_type === "cover") {
      const boxDefaults = { 1: { x: 0.5, y: 0.47 }, 2: { x: 0.5, y: 0.63 } };
      const def = boxDefaults[coverDragBox];
      if (page.text_content) {
        try {
          const p = JSON.parse(page.text_content);
          if (p && typeof p === "object") {
            const b = coverDragBox === 1 ? p.box1 : p.box2;
            dragInitialX = b?.x ?? def.x;
            dragInitialY = b?.y ?? def.y;
          }
        } catch {
          dragInitialX = def.x;
          dragInitialY = def.y;
        }
      } else {
        dragInitialX = def.x;
        dragInitialY = def.y;
      }
    }

    return (
      <div key={page.id} className="relative">
        <AlbumPageView page={page} personName={personName} editMode={editModeForPage} />
        {isDragTarget && (
          <LargePreviewDragOverlay
            pageId={page.id}
            initialX={dragInitialX}
            initialY={dragInitialY}
            onDrop={onTextDrop!}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Mock data notice */}
      {data.isMock && (
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-center text-xs text-amber-700/90 leading-relaxed">
          תצוגה לדוגמה — האלבום האמיתי יהיה מוכן לאחר יצירת הסיפור והאיורים
        </div>
      )}

      {/* Drag mode banner */}
      {textDragMode && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-center text-xs text-primary/80 leading-relaxed">
          {coverDragBox
            ? `מצב הזזת ${coverDragBox === 1 ? "כותרת" : "תת-כותרת"} פעיל — לחץ וגרור על הכריכה`
            : "מצב הזזת טקסט פעיל — לחץ וגרור על הדף לשינוי מיקום הטקסט"}
        </div>
      )}

      {/*
        Open-album spread.
        Outer wrapper has a warm shadow and a subtle center-spine divider,
        mimicking a real 25×25 cm square photo-book opened flat.
        In RTL context col-1 is the right panel (lower/odd page number) and
        col-2 is the left panel — matching how Hebrew books are opened.
      */}
      <div
        className="relative"
        style={{ filter: "drop-shadow(0 6px 32px rgba(0,0,0,0.18))" }}
      >
        {/* Center spine shadow — visible only on two-page view */}
        {leftPage && (
          <div
            className="hidden sm:block absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] z-10 pointer-events-none"
            style={{
              background:
                "linear-gradient(to right, rgba(0,0,0,0.13), rgba(0,0,0,0.06), rgba(0,0,0,0.13))",
            }}
          />
        )}

        <div
          key={animKey}
          className="grid grid-cols-1 sm:grid-cols-2 rounded-sm overflow-hidden relative"
          style={{ animation: "albumSpreadIn 0.22s ease-out" }}
        >
          {/* Right page (first in RTL spread) */}
          {renderPage(rightPage)}

          {/* Left page (second in RTL spread) */}
          {leftPage ? renderPage(leftPage) : <div className="hidden sm:block aspect-square bg-secondary/40" />}

          {/*
            Floating image layer — one entry per page in the spread that uses a
            full-image layout. Rendered outside both page stacking contexts so
            images sit at z:2 within the grid's stacking context.
            Layer order:  page backgrounds (z:auto) < images (z:2) < text (z:10) < overlay (z:20)
            Applies to all full-image pages, not just the edit-target, so the
            rendering is identical whether or not the edit overlay is active.
            overflow:visible on the anchor container allows cross-spread bleed;
            the grid's own overflow:hidden clips at the album boundary.
            For the currently-dragged slot the live edit values (editCropX/Y/Scale)
            are used so the image moves in real-time with the pointer.
          */}
          {[
            { page: rightPage, isRight: true },
            ...(leftPage ? [{ page: leftPage, isRight: false }] : []),
          ].flatMap(({ page, isRight }) => {
            const isEditTarget = page.id === imageEditPageId;

            // For non-full-image layouts (split, two-images, text-only):
            // if this page is the edit target, fall back to the legacy single-slot
            // rendering so the drag overlay still has a visible image to move.
            if (!isFullImagePage(page)) {
              if (isEditTarget && editImageUrl) {
                const s = Math.max(0.1, editScale);
                return [(
                  <div
                    key={`fi-${page.id}-edit`}
                    style={{
                      position: "absolute", top: 0, bottom: 0,
                      ...(isRight ? { right: 0 } : { left: 0 }),
                      width: "50%", zIndex: 2, overflow: "visible", pointerEvents: "none",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={editImageUrl} alt="" draggable={false} style={{ position: "absolute", width: `${s * 100}%`, height: `${s * 100}%`, maxWidth: "none", left: `${(editCropX - s / 2) * 100}%`, top: `${(editCropY - s / 2) * 100}%`, objectFit: "contain", userSelect: "none", pointerEvents: "none" }} />
                  </div>
                )];
              }
              return [];
            }

            // Full-image layout: render slot 1 via floating layer.
            // Priority: page_images slot → legacy pages.image_url.
            const pgSlot1 = page.images?.find((i) => i.slot === 1);
            const slot1Url = pgSlot1?.image_url ?? page.image_url ?? null;
            if (!slot1Url) return [];

            // When this page is the edit target and slot 1 is the active slot,
            // substitute the live drag values so the image tracks the pointer.
            const useEditOverride = isEditTarget && imageEditSlot === 1;
            const s  = Math.max(0.1, useEditOverride ? editScale  : (pgSlot1?.scale  ?? 1));
            const cx = useEditOverride ? editCropX : (pgSlot1?.crop_x ?? 0.5);
            const cy = useEditOverride ? editCropY : (pgSlot1?.crop_y ?? 0.5);
            const finalUrl = useEditOverride ? (editImageUrl ?? slot1Url) : slot1Url;

            // Non-destructive crop inset — same values as used in ImageFill.
            const it = pgSlot1?.crop_inset_top    ?? 0;
            const ir = pgSlot1?.crop_inset_right  ?? 0;
            const ib = pgSlot1?.crop_inset_bottom ?? 0;
            const il = pgSlot1?.crop_inset_left   ?? 0;
            const cropClipPath = (it > 0 || ir > 0 || ib > 0 || il > 0)
              ? `inset(${it * 100}% ${ir * 100}% ${ib * 100}% ${il * 100}%)`
              : undefined;

            return [(
              <div
                key={`fi-${page.id}-1`}
                style={{
                  position: "absolute", top: 0, bottom: 0,
                  // In RTL grid: rightPage is col-1 (physical right), leftPage is col-2 (physical left)
                  ...(isRight ? { right: 0 } : { left: 0 }),
                  width: "50%", zIndex: 2, overflow: "visible", pointerEvents: "none",
                  ...(cropClipPath ? { clipPath: cropClipPath } : {}),
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={finalUrl}
                  alt=""
                  draggable={false}
                  style={{
                    position: "absolute",
                    width: `${s * 100}%`,
                    height: `${s * 100}%`,
                    maxWidth: "none",
                    left: `${(cx - s / 2) * 100}%`,
                    top: `${(cy - s / 2) * 100}%`,
                    objectFit: "contain",
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                />
              </div>
            )];
          })}

          {/* Image edit overlay — spans entire spread for cross-page drag */}
          {imageEditPage && onImageUpdate && (
            <SpreadImageEditOverlay
              isRightPage={imageEditIsRight}
              cropX={editCropX}
              cropY={editCropY}
              scale={editScale}
              onUpdate={(cx, cy, s, final) =>
                onImageUpdate(imageEditPage.id, imageEditSlot, cx, cy, s, final)
              }
              onDeactivate={() => onImageEditDeactivate?.()}
            />
          )}
        </div>
      </div>

      {/* Navigation row */}
      <div className="flex items-center justify-between px-1 pt-1">
        <NavButton onClick={goPrev} disabled={spreadIndex === 0}>
          הקודם
        </NavButton>

        <span className="text-sm tabular-nums text-muted-foreground select-none">
          עמודים {pageLabel} / {pages.length}
        </span>

        <NavButton onClick={goNext} disabled={spreadIndex === totalSpreads - 1}>
          הבא
        </NavButton>
      </div>

      {/* Spread dot indicators (up to 25 spreads = 50 pages) */}
      {totalSpreads <= 25 && (
        <div className="flex justify-center gap-1.5 pb-2 flex-wrap">
          {spreads.map((_, i) => (
            <button
              key={i}
              onClick={() => navigate(i)}
              aria-label={`פריסה ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === spreadIndex
                  ? "w-5 bg-primary"
                  : "w-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/45"
              }`}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes albumSpreadIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── SpreadImageEditOverlay ───────────────────────────────────────────────────
// Full-spread overlay for directly dragging and resizing an image on the large
// preview. Coordinate system:
//
//   crop_x / crop_y  = image CENTER as a fraction of the PAGE  (0.5 = centered)
//   scale            = image size as a fraction of the page width (1 = fills page)
//
// The spread grid is 2:1 (width:height), each page is 1:1 (square).
// In RTL layout: right page (lower page_number) is in column 1 (physical right).
//
// Spread-coordinate formulas:
//   box_left_sw  = (isRightPage ? 0.5 : 0)  +  (crop_x - scale/2) × 0.5
//   box_top_sh   = crop_y - scale/2
//   box_width_sw = scale × 0.5    (% of spread width  → same px as scale × 100% of height)
//   box_height_sh= scale           (% of spread height → same px, pages are square)
//
// Drag delta mapping:  Δpage_x = Δspread_x × 2,  Δpage_y = Δspread_y

function SpreadImageEditOverlay({
  isRightPage,
  cropX,
  cropY,
  scale,
  onUpdate,
  onDeactivate,
}: {
  isRightPage: boolean;
  cropX: number;
  cropY: number;
  scale: number;
  onUpdate: (cx: number, cy: number, s: number, final: boolean) => void;
  onDeactivate: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    type: "move" | "resize";
    startX: number;
    startY: number;
    startCropX: number;
    startCropY: number;
    startScale: number;
  } | null>(null);

  const xOffset = isRightPage ? 0.5 : 0;
  const boxLeft  = (xOffset + (cropX - scale / 2) * 0.5) * 100;   // % of spread width
  const boxTop   = (cropY - scale / 2) * 100;                       // % of spread height
  const boxW     = scale * 0.5 * 100;                                // % of spread width
  const boxH     = scale * 100;                                      // % of spread height

  function getPos(e: React.PointerEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function computeResult(pos: { x: number; y: number }) {
    const drag = dragRef.current;
    if (!drag) return null;
    const dx = pos.x - drag.startX;
    const dy = pos.y - drag.startY;

    if (drag.type === "move") {
      return { cx: drag.startCropX + dx * 2, cy: drag.startCropY + dy, s: drag.startScale };
    } else {
      // Keep center fixed; new scale = 2 × max(Δx_page, Δy_page)
      const centerSX = xOffset + drag.startCropX * 0.5;
      const centerSY = drag.startCropY;
      const dxFromCenter = Math.abs(pos.x - centerSX);
      const dyFromCenter = Math.abs(pos.y - centerSY);
      // dxFromCenter is in spread-x units (×2 to get page units)
      // dyFromCenter is in spread-y units (×1 = page units)
      const newS = Math.max(0.1, 2 * Math.max(dxFromCenter * 2, dyFromCenter));
      return { cx: drag.startCropX, cy: drag.startCropY, s: newS };
    }
  }

  function startDrag(e: React.PointerEvent, type: "move" | "resize") {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = getPos(e);
    if (!pos) return;
    dragRef.current = {
      type,
      startX: pos.x,
      startY: pos.y,
      startCropX: cropX,
      startCropY: cropY,
      startScale: scale,
    };
  }

  function handleMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const pos = getPos(e);
    if (!pos) return;
    const r = computeResult(pos);
    if (r) onUpdate(r.cx, r.cy, r.s, false);
  }

  function handleUp(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const drag = dragRef.current;
    dragRef.current = null;
    const pos = getPos(e);
    const r = pos ? computeResult(pos) : null;
    if (r) {
      onUpdate(r.cx, r.cy, r.s, true);
    } else {
      onUpdate(cropX, cropY, scale, true);
    }
    // Restore default cursor
    void drag;
  }

  const handleSz = 10; // corner handle size in px

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 select-none hidden sm:block"
      style={{ zIndex: 20 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDeactivate();
      }}
    >
      {/* Center spine guide */}
      <div
        className="absolute inset-y-0 w-px pointer-events-none"
        style={{ left: "50%", background: "rgba(255,255,255,0.35)" }}
      />

      {/* Selection box */}
      <div
        style={{
          position: "absolute",
          left: `${boxLeft}%`,
          top: `${boxTop}%`,
          width: `${boxW}%`,
          height: `${boxH}%`,
          border: "2px solid rgba(99,179,237,0.95)",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
          cursor: "move",
          boxSizing: "border-box",
        }}
        onPointerDown={(e) => startDrag(e, "move")}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
      >
        {/* Corner resize handles */}
        {(["tl", "tr", "bl", "br"] as const).map((c) => (
          <div
            key={c}
            style={{
              position: "absolute",
              width: handleSz,
              height: handleSz,
              background: "white",
              border: "1.5px solid rgba(99,179,237,0.95)",
              borderRadius: 2,
              cursor: "nwse-resize",
              ...(c[0] === "t" ? { top: -handleSz / 2 } : { bottom: -handleSz / 2 }),
              ...(c[1] === "l" ? { left: -handleSz / 2 } : { right: -handleSz / 2 }),
            }}
            onPointerDown={(e) => startDrag(e, "resize")}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
          />
        ))}
      </div>

      {/* Hint label */}
      <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
        <span className="text-[10px] text-white/90 bg-black/50 rounded px-2 py-0.5">
          גרור להזזה · פינות לשינוי גודל · לחץ מחוץ לסגירה
        </span>
      </div>
    </div>
  );
}

// ─── LargePreviewDragOverlay ──────────────────────────────────────────────────
// Rendered on top of a specific AlbumPageView when text drag mode is active.
// Captures pointer events and reports (x, y) in 0–1 normalized page coordinates.

function LargePreviewDragOverlay({
  pageId,
  initialX,
  initialY,
  onDrop,
}: {
  pageId: string;
  initialX: number | null;
  initialY: number | null;
  onDrop: (pageId: string, x: number, y: number) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [dotX, setDotX] = useState<number | null>(initialX);
  const [dotY, setDotY] = useState<number | null>(initialY);

  function getRelativePos(e: React.PointerEvent): { x: number; y: number } | null {
    if (!overlayRef.current) return null;
    const rect = overlayRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 select-none"
      style={{ zIndex: 20, cursor: "crosshair" }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        isDraggingRef.current = true;
        const pos = getRelativePos(e);
        if (pos) { setDotX(pos.x); setDotY(pos.y); }
      }}
      onPointerMove={(e) => {
        if (!isDraggingRef.current) return;
        const pos = getRelativePos(e);
        if (pos) { setDotX(pos.x); setDotY(pos.y); }
      }}
      onPointerUp={(e) => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        const pos = getRelativePos(e);
        if (pos) {
          setDotX(pos.x);
          setDotY(pos.y);
          onDrop(pageId, pos.x, pos.y);
        }
      }}
      onPointerLeave={() => {
        isDraggingRef.current = false;
      }}
    >
      {/* Light tint to indicate the overlay is active */}
      <div className="absolute inset-0 bg-primary/10 pointer-events-none" />

      {/* Position indicator dot */}
      {dotX !== null && dotY !== null && (
        <div
          className="absolute w-3.5 h-3.5 rounded-full bg-white border-2 border-primary shadow-md pointer-events-none"
          style={{
            left: `${dotX * 100}%`,
            top: `${dotY * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
        />
      )}

      {/* Hint label */}
      <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none">
        <span className="text-[10px] text-white/90 bg-black/50 rounded px-2 py-0.5">
          לחץ וגרור למיקום הטקסט
        </span>
      </div>
    </div>
  );
}

function NavButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary active:bg-secondary/80 disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
