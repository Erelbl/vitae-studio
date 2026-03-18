"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LayoutType, PageImageSlot, PreviewPage, TextAlign, TextColor } from "@/types/page";
import { LAYOUT_TYPES } from "@/types/page";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditorPage = {
  id: string;
  page_number: number;
  page_type: string;
  layout_type: string;
  text_content: string | null;
  text_version: number;
  /** Legacy text size enum — used as initial fallback for the font-size slider. */
  text_size: "sm" | "md" | "lg" | "xl" | null;
  /** Numeric font size in px. Takes priority over text_size when set. */
  font_size_px: number | null;
  /** Text alignment. Defaults to 'center'. */
  text_align: TextAlign | null;
  /** Free-position text X (0–1). Null = layout default. */
  text_x: number | null;
  /** Free-position text Y (0–1). Null = layout default. */
  text_y: number | null;
  /** Text color. Null = layout default (white for overlays, foreground for splits). */
  text_color: TextColor | null;
  images: Array<{
    slot: number;
    photo_id: string | null;
    crop_x: number;
    crop_y: number;
    scale: number;
    frame_style: string | null;
    image_url: string | null;
  }>;
};

export type PhotoForEditor = {
  id: string;
  illustrationUrl: string | null;
  original_filename: string;
  life_stage: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const LAYOUT_LABELS: Record<LayoutType, string> = {
  FULL_IMAGE: "תמונה מלאה — טקסט תחתון",
  TEXT_ONLY: "טקסט בלבד",
  IMAGE_TOP_TEXT_BOTTOM: "תמונה עליונה",
  TEXT_TOP_IMAGE_BOTTOM: "תמונה תחתונה",
  IMAGE_LEFT_TEXT_RIGHT: "תמונה שמאל / טקסט ימין",
  IMAGE_RIGHT_TEXT_LEFT: "תמונה ימין / טקסט שמאל",
  TWO_IMAGES: "שתי תמונות",
  FULL_IMAGE_TEXT_TOP: "תמונה מלאה — טקסט עליון",
  FULL_IMAGE_TEXT_CENTER: "תמונה מלאה — טקסט מרכז",
};

/** How many image slots each layout uses */
const LAYOUT_SLOTS: Record<LayoutType, number[]> = {
  FULL_IMAGE: [1],
  TEXT_ONLY: [],
  IMAGE_TOP_TEXT_BOTTOM: [1],
  TEXT_TOP_IMAGE_BOTTOM: [1],
  IMAGE_LEFT_TEXT_RIGHT: [1],
  IMAGE_RIGHT_TEXT_LEFT: [1],
  TWO_IMAGES: [1, 2],
  FULL_IMAGE_TEXT_TOP: [1],
  FULL_IMAGE_TEXT_CENTER: [1],
};

/** Layouts where the text overlays the image — text dragging makes sense here. */
const OVERLAY_LAYOUTS: LayoutType[] = [
  "FULL_IMAGE",
  "FULL_IMAGE_TEXT_TOP",
  "FULL_IMAGE_TEXT_CENTER",
];

/** Derive a numeric px value from the legacy text_size enum. */
function legacyTextSizeToPx(ts: EditorPage["text_size"]): number {
  switch (ts) {
    case "sm": return 12;
    case "lg": return 18;
    case "xl": return 22;
    default:   return 15;
  }
}

const LIFE_STAGE_LABELS: Record<string, string> = {
  baby: "תינוקות",
  childhood: "ילדות",
  youth: "נעורים",
  military: "צבא",
  career: "קריירה",
  wedding: "חתונה",
  family: "משפחה",
  recent: "לאחרונה",
  other: "אחר",
};

const SPECIAL_PAGE_LABELS: Record<string, string> = {
  cover: "כריכה",
  dedication: "הקדשה",
  back_cover: "גב",
  text_only: "טקסט",
};

// ─── Per-slot state ───────────────────────────────────────────────────────────

type SlotState = {
  photo_id: string | null;
  image_url: string | null;
  crop_x: number;
  crop_y: number;
  scale: number;
  frame_style: string | null;
};

/** Convert the local slots map → PageImageSlot[] suitable for an onPageUpdate override. */
function buildImages(slotsMap: Record<number, SlotState>): PageImageSlot[] {
  return Object.entries(slotsMap)
    .filter(([, s]) => s.image_url != null)
    .map(([slotNum, s]) => ({
      id: `local-slot-${slotNum}`,
      slot: Number(slotNum) as 1 | 2,
      photo_id: s.photo_id,
      crop_x: s.crop_x,
      crop_y: s.crop_y,
      scale: s.scale,
      frame_style: s.frame_style ?? null,
      image_url: s.image_url!,
    }));
}

// ─── Spread canvas constants ──────────────────────────────────────────────────

/** Size in CSS pixels of each page square inside the spread mini-canvas. */
const PAGE_PX = 148;

/** Position of each image slot within a page (0-1 fractions of page width/height). */
type SlotBounds = { x: number; y: number; w: number; h: number };
const SLOT_BOUNDS: Partial<Record<string, Record<number, SlotBounds>>> = {
  FULL_IMAGE:             { 1: { x: 0, y: 0, w: 1,    h: 1 } },
  FULL_IMAGE_TEXT_TOP:    { 1: { x: 0, y: 0, w: 1,    h: 1 } },
  FULL_IMAGE_TEXT_CENTER: { 1: { x: 0, y: 0, w: 1,    h: 1 } },
  IMAGE_TOP_TEXT_BOTTOM:  { 1: { x: 0, y: 0, w: 1,    h: 0.6 } },
  TEXT_TOP_IMAGE_BOTTOM:  { 1: { x: 0, y: 0.4, w: 1,  h: 0.6 } },
  IMAGE_LEFT_TEXT_RIGHT:  { 1: { x: 0, y: 0, w: 0.55, h: 1 } },
  IMAGE_RIGHT_TEXT_LEFT:  { 1: { x: 0.45, y: 0, w: 0.55, h: 1 } },
  TWO_IMAGES:             { 1: { x: 0, y: 0, w: 0.5,  h: 1 }, 2: { x: 0.5, y: 0, w: 0.5, h: 1 } },
  TEXT_ONLY:              {},
};

/** Decorative frame style presets displayed in the frame-style picker. */
const FRAME_STYLES = [
  { id: null,           label: "ללא" },
  { id: "torn_top",     label: "קצה עליון" },
  { id: "torn_bottom",  label: "קצה תחתון" },
  { id: "torn_left",    label: "קצה שמאל" },
  { id: "torn_right",   label: "קצה ימין" },
] as const;

// ─── Main component ───────────────────────────────────────────────────────────

export function AlbumPageEditor({
  orderId,
  pages,
  completedPhotos,
  onPageSelect,
  onPageUpdate,
  textDragMode,
  onTextDragToggle,
  onClearTextPosition,
  currentTextX,
  currentTextY,
  externalPageId,
}: {
  orderId: string;
  pages: EditorPage[];
  completedPhotos: PhotoForEditor[];
  /**
   * Called when the user selects a page — tells the parent which spread to
   * scroll to and which page is now active for drag operations.
   */
  onPageSelect?: (pageNumber: number, pageId: string) => void;
  /**
   * Called whenever a style property is committed so the large AlbumPreview
   * can reflect the change without a server round-trip.
   */
  onPageUpdate?: (pageId: string, overrides: Partial<PreviewPage>) => void;
  /** Whether text drag mode is currently active (controlled by parent). */
  textDragMode?: boolean;
  /** Called when the user toggles drag mode on/off. */
  onTextDragToggle?: (active: boolean) => void;
  /** Called when the user resets the text position for a page. */
  onClearTextPosition?: (pageId: string) => void;
  /** Current text_x of the selected page from livePreviewData (for "clear" button). */
  currentTextX?: number | null;
  /** Current text_y of the selected page from livePreviewData (for "clear" button). */
  currentTextY?: number | null;
  /**
   * When the large preview navigates, the parent passes the new active page ID here.
   * The editor syncs its local selection to stay in step with the preview.
   */
  externalPageId?: string | null;
}) {
  const router = useRouter();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  // Sync selection when the preview navigates (bidirectional sync).
  // We only adopt the external page ID if it differs — avoids re-render loops.
  useEffect(() => {
    if (externalPageId !== undefined && externalPageId !== selectedPageId) {
      setSelectedPageId(externalPageId ?? null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPageId]);

  const selectedPage = pages.find((p) => p.id === selectedPageId) ?? null;
  const selectedIndex = pages.findIndex((p) => p.id === selectedPageId);

  /**
   * Find the spread partner of the selected page.
   * Illustration pages pair up as (2,3), (4,5), …, (38,39).
   * Cover and back_cover are singletons with no partner.
   */
  const partnerPage: EditorPage | null = (() => {
    if (!selectedPage || selectedPage.page_type !== "illustration_and_text") return null;
    const n = selectedPage.page_number;
    // Even → partner is n+1, Odd (≥3) → partner is n-1
    const partnerNum = n % 2 === 0 ? n + 1 : n - 1;
    return pages.find(
      (p) => p.page_number === partnerNum && p.page_type === "illustration_and_text"
    ) ?? null;
  })();

  function selectPage(page: EditorPage) {
    setSelectedPageId(page.id);
    onPageSelect?.(page.page_number, page.id);
  }

  function goToPrev() {
    if (selectedIndex <= 0) return;
    selectPage(pages[selectedIndex - 1]);
  }

  function goToNext() {
    if (selectedIndex < 0 || selectedIndex >= pages.length - 1) return;
    selectPage(pages[selectedIndex + 1]);
  }

  if (pages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        אין עמודים לעריכה. יש לייצר את הסיפור תחילה.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page selector */}
      <div className="space-y-2">
        {/* Prev / current label / next row */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrev}
            disabled={selectedIndex <= 0}
            className="h-7 w-7 rounded border border-border bg-muted hover:bg-muted/60 text-xs flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ←
          </button>
          <span className="flex-1 text-xs text-center text-muted-foreground">
            {selectedPage ? (
              <span className="font-medium text-foreground">
                {SPECIAL_PAGE_LABELS[selectedPage.page_type] ??
                  `עמוד ${selectedPage.page_number}`}
              </span>
            ) : (
              `${pages.length} עמודים — בחר עמוד לעריכה`
            )}
          </span>
          <button
            onClick={goToNext}
            disabled={selectedIndex < 0 || selectedIndex >= pages.length - 1}
            className="h-7 w-7 rounded border border-border bg-muted hover:bg-muted/60 text-xs flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            →
          </button>
        </div>

        {/* Page button grid — scrollable when many pages */}
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto py-0.5">
          {pages.map((page) => {
            const specialLabel = SPECIAL_PAGE_LABELS[page.page_type];
            return (
              <button
                key={page.id}
                onClick={() => {
                  if (page.id === selectedPageId) {
                    setSelectedPageId(null);
                  } else {
                    selectPage(page);
                  }
                }}
                className={`h-7 min-w-[2rem] px-1.5 rounded text-xs font-mono transition-colors ${
                  page.id === selectedPageId
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {specialLabel ?? page.page_number}
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor panel */}
      {selectedPage && (
        selectedPage.page_type === "illustration_and_text" ? (
          <PageEditorPanel
            key={selectedPage.id}
            orderId={orderId}
            page={selectedPage}
            partnerPage={partnerPage}
            completedPhotos={completedPhotos}
            onSaved={() => router.refresh()}
            onPageUpdate={onPageUpdate}
            onSelectPartner={
              partnerPage ? () => selectPage(partnerPage) : undefined
            }
            textDragMode={textDragMode}
            onTextDragToggle={
              onTextDragToggle
                ? () => onTextDragToggle(!textDragMode)
                : undefined
            }
            onClearTextPosition={
              onClearTextPosition
                ? () => onClearTextPosition(selectedPage.id)
                : undefined
            }
            currentTextX={currentTextX}
            currentTextY={currentTextY}
          />
        ) : (
          <SpecialPagePanel
            key={selectedPage.id}
            orderId={orderId}
            page={selectedPage}
            onSaved={() => router.refresh()}
          />
        )
      )}
    </div>
  );
}

// ─── PageEditorPanel ──────────────────────────────────────────────────────────
// Full editor for illustration_and_text pages.
// No mini-preview — editing is done directly on the large AlbumPreview.

function PageEditorPanel({
  orderId,
  page,
  partnerPage,
  completedPhotos,
  onSaved,
  onPageUpdate,
  onSelectPartner,
  textDragMode,
  onTextDragToggle,
  onClearTextPosition,
  currentTextX,
  currentTextY,
}: {
  orderId: string;
  page: EditorPage;
  /** The other page of the same spread (for SpreadMiniView). Null for cover/back_cover. */
  partnerPage?: EditorPage | null;
  completedPhotos: PhotoForEditor[];
  onSaved: () => void;
  onPageUpdate?: (pageId: string, overrides: Partial<PreviewPage>) => void;
  /** Called when user clicks the partner page in SpreadMiniView to switch selection. */
  onSelectPartner?: () => void;
  textDragMode?: boolean;
  /** Toggle drag mode for current page. */
  onTextDragToggle?: () => void;
  /** Clear custom text position for current page. */
  onClearTextPosition?: () => void;
  currentTextX?: number | null;
  currentTextY?: number | null;
}) {
  const [text, setText] = useState(page.text_content ?? "");
  const [layoutType, setLayoutType] = useState<LayoutType>(
    (page.layout_type as LayoutType) ?? "FULL_IMAGE"
  );
  const [fontSizePx, setFontSizePx] = useState<number>(
    page.font_size_px ?? legacyTextSizeToPx(page.text_size)
  );
  const [textAlign, setTextAlign] = useState<TextAlign>(page.text_align ?? "center");
  const [textColor, setTextColor] = useState<TextColor>(page.text_color ?? "white");

  const [slots, setSlots] = useState<Record<number, SlotState>>(() => {
    const m: Record<number, SlotState> = {};
    for (const img of page.images) {
      m[img.slot] = {
        photo_id: img.photo_id,
        image_url: img.image_url,
        crop_x: img.crop_x,
        crop_y: img.crop_y,
        scale: img.scale,
        frame_style: img.frame_style ?? null,
      };
    }
    return m;
  });

  const [savingText, setSavingText] = useState(false);
  const [textDirty, setTextDirty] = useState(false);
  /** Which slot is focused in the spread mini canvas (for frame picker + single slot editor). */
  const [focusedSlot, setFocusedSlot] = useState<1 | 2>(1);

  const canDragText = OVERLAY_LAYOUTS.includes(layoutType) && Boolean(text);
  const hasCustomPosition = currentTextX != null || currentTextY != null;

  async function saveText() {
    if (!textDirty) return;
    setSavingText(true);
    const res = await fetch(
      `/api/admin/orders/${orderId}/pages/${page.id}/edit`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_content: text }),
      }
    );
    setSavingText(false);
    if (res.ok) {
      setTextDirty(false);
      // Push text change to large preview immediately; router.refresh() will
      // confirm with fresh server data and clear the override.
      onPageUpdate?.(page.id, { text_content: text || null });
      onSaved();
    } else {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "שגיאה בשמירת הטקסט");
    }
  }

  async function handleLayoutChange(newLayout: LayoutType) {
    setLayoutType(newLayout);
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout_type: newLayout }),
    });
    onSaved();
  }

  async function handleFontSizeCommit(newSize: number) {
    // Push to large preview immediately (no router.refresh — that would force
    // all signed image URLs to regenerate and the browser to re-download them).
    onPageUpdate?.(page.id, { font_size_px: newSize });
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ font_size_px: newSize }),
    });
  }

  async function handleTextAlignChange(newAlign: TextAlign) {
    setTextAlign(newAlign);
    // Push to large preview immediately.
    onPageUpdate?.(page.id, { text_align: newAlign });
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_align: newAlign }),
    });
  }

  async function handleTextColorChange(newColor: TextColor) {
    setTextColor(newColor);
    onPageUpdate?.(page.id, { text_color: newColor });
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_color: newColor }),
    });
  }

  async function handleSlotAssign(
    slot: 1 | 2,
    photo: PhotoForEditor | null
  ) {
    const photoId = photo?.id ?? null;
    const imageUrl = photo?.illustrationUrl ?? null;

    const prevSlots = slots;
    const newSlots = {
      ...slots,
      [slot]: { photo_id: photoId, image_url: imageUrl, crop_x: 0, crop_y: 0, scale: 1, frame_style: null },
    };
    setSlots(newSlots);
    // Push to large preview immediately for instant visual feedback
    onPageUpdate?.(page.id, { images: buildImages(newSlots) });

    const res = await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, photoId, crop_x: 0, crop_y: 0, scale: 1 }),
    });

    if (!res.ok) {
      setSlots(prevSlots);
      onPageUpdate?.(page.id, { images: buildImages(prevSlots) });
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "שגיאה בשמירת האיור");
      return;
    }

    onSaved();
  }

  async function handleCropSave(
    slot: 1 | 2,
    crop_x: number,
    crop_y: number,
    scale: number
  ) {
    const currentSlot = slots[slot];
    if (!currentSlot?.image_url) return;

    const newSlots = {
      ...slots,
      [slot]: { ...currentSlot, crop_x, crop_y, scale },
    };
    setSlots(newSlots);
    // Push crop/zoom update to large preview immediately — no router.refresh() needed.
    // (Refreshing would force all signed image URLs to regenerate and re-download.)
    onPageUpdate?.(page.id, { images: buildImages(newSlots) });

    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, crop_x, crop_y, scale }),
    });
  }

  function handleManualUpload(slot: 1 | 2, imageUrl: string) {
    const newSlots = {
      ...slots,
      [slot]: { photo_id: null, image_url: imageUrl, crop_x: 0, crop_y: 0, scale: 1, frame_style: null },
    };
    setSlots(newSlots);
    onPageUpdate?.(page.id, { images: buildImages(newSlots) });
    onSaved();
  }

  /** Called by SpreadMiniView when the user drags to pan/scale an image. */
  function handleMiniCropUpdate(
    slotNum: 1 | 2,
    cx: number,
    cy: number,
    scale: number,
    save: boolean
  ) {
    const currentSlot = slots[slotNum];
    if (!currentSlot?.image_url) return;
    const newSlots = { ...slots, [slotNum]: { ...currentSlot, crop_x: cx, crop_y: cy, scale } };
    setSlots(newSlots);
    onPageUpdate?.(page.id, { images: buildImages(newSlots) });
    if (save) {
      fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: slotNum, crop_x: cx, crop_y: cy, scale }),
      });
    }
  }

  /** Save a frame style change for a slot. */
  async function handleFrameStyleSave(slotNum: 1 | 2, style: string | null) {
    const currentSlot = slots[slotNum];
    if (!currentSlot) return;
    const newSlots = { ...slots, [slotNum]: { ...currentSlot, frame_style: style } };
    setSlots(newSlots);
    onPageUpdate?.(page.id, { images: buildImages(newSlots) });
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: slotNum, frame_style: style }),
    });
  }

  const activeSlots = LAYOUT_SLOTS[layoutType] ?? [];

  return (
    <div className="space-y-6 pt-1">
      {/* Spread mini canvas — both pages side by side with interactive crop/zoom */}
      <SpreadMiniView
        activePage={page}
        partnerPage={partnerPage ?? null}
        slots={slots}
        focusedSlotNum={focusedSlot}
        onSlotFocus={setFocusedSlot}
        onCropUpdate={handleMiniCropUpdate}
        onSelectPartner={() => onSelectPartner?.()}
      />

      {/* Frame style picker — shown when focused slot has an image */}
      {slots[focusedSlot]?.image_url && (
        <FrameStylePicker
          value={slots[focusedSlot]?.frame_style ?? null}
          onChange={(style) => handleFrameStyleSave(focusedSlot, style)}
        />
      )}

      {/* Text editor */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          טקסט העמוד
        </label>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setTextDirty(true);
          }}
          onBlur={saveText}
          rows={4}
          dir="rtl"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 leading-relaxed"
          placeholder="הטקסט של העמוד..."
        />
        {textDirty && (
          <button
            onClick={saveText}
            disabled={savingText}
            className="text-xs text-primary hover:underline disabled:opacity-50"
          >
            {savingText ? "שומר..." : "שמור טקסט ←"}
          </button>
        )}
        {/* Warn when an image is assigned but there is no story text.
            pages.text_content is the canonical text source for narration —
            if it is empty the film narration will be silent for this spread. */}
        {!text && Object.values(slots).some((s) => s.photo_id) && (
          <p className="text-[11px] text-amber-600/80 leading-snug">
            לעמוד זה יש איור אך אין טקסט סיפור — הנארציה תהיה שקטה לפריסה זו
          </p>
        )}
      </div>

      {/* Font size slider + numeric input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">גודל טקסט</p>
          <input
            type="number"
            min={10}
            max={36}
            step={1}
            value={fontSizePx}
            onChange={(e) => {
              const v = Math.max(10, Math.min(36, Number(e.target.value) || 10));
              setFontSizePx(v);
              onPageUpdate?.(page.id, { font_size_px: v });
            }}
            onBlur={(e) => {
              const v = Math.max(10, Math.min(36, Number(e.target.value) || 10));
              handleFontSizeCommit(v);
            }}
            className="w-14 rounded border border-border bg-background px-2 py-0.5 text-xs tabular-nums text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <input
          type="range"
          min={10}
          max={36}
          step={1}
          value={fontSizePx}
          onChange={(e) => setFontSizePx(Number(e.target.value))}
          onPointerUp={(e) => handleFontSizeCommit(Number((e.target as HTMLInputElement).value))}
          className="w-full h-1.5 appearance-none bg-border rounded accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/50 select-none">
          <span>קטן (10)</span>
          <span>גדול (36)</span>
        </div>
      </div>

      {/* Text alignment */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">יישור טקסט</p>
        <div className="flex gap-1.5">
          {(["right", "center", "left"] as TextAlign[]).map((align) => {
            const label = align === "right" ? "ימין" : align === "center" ? "מרכז" : "שמאל";
            const icon  = align === "right" ? "▶" : align === "center" ? "◉" : "◀";
            return (
              <button
                key={align}
                onClick={() => handleTextAlignChange(align)}
                title={label}
                className={`flex-1 rounded-md py-1.5 text-xs border transition-colors flex items-center justify-center gap-1 ${
                  textAlign === align
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="text-[10px]">{icon}</span> {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Text color picker */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">צבע טקסט</p>
        <div className="flex gap-1.5">
          {(["white", "black"] as TextColor[]).map((color) => {
            const label = color === "white" ? "לבן" : "שחור";
            return (
              <button
                key={color}
                onClick={() => handleTextColorChange(color)}
                className={`flex-1 rounded-md py-1.5 text-xs border transition-colors flex items-center justify-center gap-1.5 ${
                  textColor === color
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className="inline-block w-3 h-3 rounded-full border"
                  style={{
                    background: color === "white" ? "#fff" : "#111",
                    borderColor: color === "white" ? "#ccc" : "#444",
                  }}
                />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Text position (drag on large preview) — only for full-image overlay layouts */}
      {canDragText && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">מיקום טקסט</p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => onTextDragToggle?.()}
              className={`rounded-md px-3 py-1.5 text-xs border transition-colors ${
                textDragMode
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {textDragMode ? "✓ מצב הזזה פעיל" : "הזז טקסט על התצוגה"}
            </button>
            {hasCustomPosition && (
              <button
                onClick={() => onClearTextPosition?.()}
                className="rounded-md px-3 py-1.5 text-xs border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive transition-colors"
              >
                איפוס מיקום
              </button>
            )}
          </div>
          {textDragMode && (
            <p className="text-[10px] text-muted-foreground/60">
              לחץ וגרור על התצוגה הגדולה למיקום הרצוי. הרקע ישאר שקוף.
            </p>
          )}
        </div>
      )}

      {/* Layout picker */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">פריסת עמוד</p>
        <div className="flex flex-wrap gap-1.5">
          {LAYOUT_TYPES.map((lt) => (
            <button
              key={lt}
              onClick={() => handleLayoutChange(lt)}
              className={`rounded-md px-2.5 py-1.5 text-xs border transition-colors ${
                layoutType === lt
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {LAYOUT_LABELS[lt]}
            </button>
          ))}
        </div>
      </div>

      {/* Image slot editor — shows only the focused slot.
          For TWO_IMAGES, click the other slot in the mini canvas above to switch. */}
      {activeSlots.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {activeSlots.length === 1 ? "איור" : `איור ${focusedSlot}`}
            </p>
            {activeSlots.length > 1 && (
              <div className="flex gap-1">
                {activeSlots.map((sn) => (
                  <button
                    key={sn}
                    onClick={() => setFocusedSlot(sn as 1 | 2)}
                    className={`h-6 w-6 rounded text-[10px] border transition-colors ${
                      focusedSlot === sn
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {sn}
                  </button>
                ))}
              </div>
            )}
          </div>
          {activeSlots.includes(focusedSlot) ? (
            <ImageSlotEditor
              key={focusedSlot}
              slot={focusedSlot}
              slotState={slots[focusedSlot] ?? null}
              completedPhotos={completedPhotos}
              orderId={orderId}
              pageId={page.id}
              onAssign={(photo) => handleSlotAssign(focusedSlot, photo)}
              onCropSave={(crop_x, crop_y, scale) =>
                handleCropSave(focusedSlot, crop_x, crop_y, scale)
              }
              onManualUpload={(imageUrl) =>
                handleManualUpload(focusedSlot, imageUrl)
              }
            />
          ) : (
            <ImageSlotEditor
              key={activeSlots[0]}
              slot={activeSlots[0] as 1 | 2}
              slotState={slots[activeSlots[0]] ?? null}
              completedPhotos={completedPhotos}
              orderId={orderId}
              pageId={page.id}
              onAssign={(photo) => handleSlotAssign(activeSlots[0] as 1 | 2, photo)}
              onCropSave={(crop_x, crop_y, scale) =>
                handleCropSave(activeSlots[0] as 1 | 2, crop_x, crop_y, scale)
              }
              onManualUpload={(imageUrl) =>
                handleManualUpload(activeSlots[0] as 1 | 2, imageUrl)
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── SpecialPagePanel ─────────────────────────────────────────────────────────
// Simplified editor for cover, dedication, back_cover, text_only pages.
// Supports text editing and manual image upload to slot 1.

function SpecialPagePanel({
  orderId,
  page,
  onSaved,
}: {
  orderId: string;
  page: EditorPage;
  onSaved: () => void;
}) {
  const [text, setText] = useState(page.text_content ?? "");
  const [textDirty, setTextDirty] = useState(false);
  const [savingText, setSavingText] = useState(false);
  const [slotState, setSlotState] = useState<SlotState>(() => {
    const img = page.images.find((i) => i.slot === 1);
    return img
      ? { photo_id: img.photo_id, image_url: img.image_url, crop_x: img.crop_x, crop_y: img.crop_y, scale: img.scale, frame_style: img.frame_style ?? null }
      : { photo_id: null, image_url: null, crop_x: 0, crop_y: 0, scale: 1, frame_style: null };
  });

  async function saveText() {
    if (!textDirty) return;
    setSavingText(true);
    const res = await fetch(
      `/api/admin/orders/${orderId}/pages/${page.id}/edit`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_content: text }),
      }
    );
    setSavingText(false);
    if (res.ok) {
      setTextDirty(false);
      onSaved();
    } else {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "שגיאה בשמירת הטקסט");
    }
  }

  async function handleCropSave(crop_x: number, crop_y: number, scale: number) {
    setSlotState((prev) => ({ ...prev, crop_x, crop_y, scale }));
    if (!slotState.image_url) return;
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: 1, crop_x, crop_y, scale }),
    });
    // Intentionally NOT calling onSaved() — see note in PageEditorPanel.handleCropSave
  }

  async function handleRemove() {
    setSlotState({ photo_id: null, image_url: null, crop_x: 0, crop_y: 0, scale: 1, frame_style: null });
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: 1, photoId: null }),
    });
    onSaved();
  }

  function handleManualUpload(imageUrl: string) {
    setSlotState({ photo_id: null, image_url: imageUrl, crop_x: 0, crop_y: 0, scale: 1, frame_style: null });
    onSaved();
  }

  return (
    <div className="space-y-6 pt-1">
      {/* Text editor — all special page types have editable text */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          טקסט העמוד
        </label>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setTextDirty(true);
          }}
          onBlur={saveText}
          rows={3}
          dir="rtl"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 leading-relaxed"
          placeholder="הטקסט של העמוד..."
        />
        {textDirty && (
          <button
            onClick={saveText}
            disabled={savingText}
            className="text-xs text-primary hover:underline disabled:opacity-50"
          >
            {savingText ? "שומר..." : "שמור טקסט ←"}
          </button>
        )}
      </div>

      {/* Background image upload — slot 1, no photo picker */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">תמונת רקע</p>
        <ImageSlotEditor
          slot={1}
          slotState={slotState}
          completedPhotos={[]}
          orderId={orderId}
          pageId={page.id}
          hidePhotoPicker
          onAssign={handleRemove}
          onCropSave={(crop_x, crop_y, scale) => handleCropSave(crop_x, crop_y, scale)}
          onManualUpload={handleManualUpload}
        />
      </div>
    </div>
  );
}

// ─── ImageSlotEditor ──────────────────────────────────────────────────────────

function ImageSlotEditor({
  slot,
  slotState,
  completedPhotos,
  orderId,
  pageId,
  hidePhotoPicker = false,
  onAssign,
  onCropSave,
  onManualUpload,
}: {
  slot: 1 | 2;
  slotState: SlotState | null;
  completedPhotos: PhotoForEditor[];
  orderId: string;
  pageId: string;
  hidePhotoPicker?: boolean;
  onAssign: (photo: PhotoForEditor | null) => void;
  onCropSave: (crop_x: number, crop_y: number, scale: number) => void;
  onManualUpload: (imageUrl: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [cropX, setCropX] = useState(slotState?.crop_x ?? 0);
  const [cropY, setCropY] = useState(slotState?.crop_y ?? 0);
  const [scale, setScale] = useState(slotState?.scale ?? 1);
  const [uploading, setUploading] = useState(false);

  const frameRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);
  const dragOriginRef = useRef({ px: 0, py: 0, cx: 0, cy: 0 });
  const latestCropRef = useRef({ crop_x: cropX, crop_y: cropY });

  const imageUrl = slotState?.image_url ?? null;
  const hasImage = Boolean(imageUrl);
  const isManual = hasImage && !slotState?.photo_id;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (scale <= 1 || !imageUrl) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;
      dragOriginRef.current = { px: e.clientX, py: e.clientY, cx: cropX, cy: cropY };
    },
    [scale, imageUrl, cropX, cropY]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || !frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      const rangeX = rect.width * (scale - 1);
      const rangeY = rect.height * (scale - 1);
      if (rangeX === 0 || rangeY === 0) return;

      const dx = (e.clientX - dragOriginRef.current.px) / rangeX;
      const dy = (e.clientY - dragOriginRef.current.py) / rangeY;
      const newCX = Math.max(0, Math.min(1, dragOriginRef.current.cx - dx));
      const newCY = Math.max(0, Math.min(1, dragOriginRef.current.cy - dy));
      setCropX(newCX);
      setCropY(newCY);
      latestCropRef.current = { crop_x: newCX, crop_y: newCY };
    },
    [scale]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    onCropSave(latestCropRef.current.crop_x, latestCropRef.current.crop_y, scale);
  }, [scale, onCropSave]);

  function handleScaleChange(newScale: number) {
    setScale(newScale);
    onCropSave(cropX, cropY, newScale);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("slot", String(slot));

    const res = await fetch(
      `/api/admin/orders/${orderId}/pages/${pageId}/images/upload`,
      { method: "POST", body: fd }
    );
    setUploading(false);
    e.target.value = "";

    if (res.ok) {
      const data = await res.json();
      setCropX(0);
      setCropY(0);
      setScale(1);
      onManualUpload(data.imageUrl);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "שגיאה בהעלאת התמונה");
    }
  }

  const slotLabel = slot === 1 ? "איור 1 (ראשי)" : "איור 2 (משני)";
  const s = Math.max(1, scale);

  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-3">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium">
          {hidePhotoPicker ? "תמונת רקע" : slotLabel}
          {isManual && (
            <span className="ms-1.5 text-[10px] text-primary/60 font-normal">
              (תמונה ידנית)
            </span>
          )}
        </p>
        {hasImage && (
          <button
            onClick={() => {
              onAssign(null);
              setCropX(0);
              setCropY(0);
              setScale(1);
            }}
            className="text-xs text-destructive hover:underline"
          >
            הסר
          </button>
        )}
      </div>

      {/* Image frame / drag canvas */}
      {hasImage ? (
        <div className="space-y-3">
          {/* Drag-to-pan frame */}
          <div
            ref={frameRef}
            className="relative aspect-square w-48 overflow-hidden rounded-lg border border-border bg-muted"
            style={{
              cursor:
                scale > 1
                  ? isDraggingRef.current
                    ? "grabbing"
                    : "grab"
                  : "default",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl!}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              style={{
                position: "absolute",
                width: `${s * 100}%`,
                height: `${s * 100}%`,
                left: `${-cropX * (s - 1) * 100}%`,
                top: `${-cropY * (s - 1) * 100}%`,
                objectFit: "cover",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
            {scale > 1 && (
              <div className="absolute inset-0 flex items-end justify-center pb-1.5 pointer-events-none">
                <span className="text-white/70 text-[10px] bg-black/40 rounded px-1.5 py-0.5">
                  גרור להזזה
                </span>
              </div>
            )}
          </div>

          {/* Zoom slider */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground w-12 shrink-0 tabular-nums">
              זום {scale.toFixed(1)}×
            </span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={scale}
              onChange={(e) => handleScaleChange(Number(e.target.value))}
              className="flex-1 h-1.5 appearance-none bg-border rounded accent-primary"
            />
          </div>

          {/* Fine-grained nudge controls */}
          {scale > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground shrink-0">כיוון:</span>
              <div className="grid grid-cols-3 gap-0.5">
                <div />
                <NudgeButton
                  label="↑"
                  onClick={() => {
                    const next = Math.max(0, cropY - 0.05);
                    setCropY(next);
                    latestCropRef.current = { crop_x: cropX, crop_y: next };
                    onCropSave(cropX, next, scale);
                  }}
                />
                <div />
                <NudgeButton
                  label="←"
                  onClick={() => {
                    const next = Math.max(0, cropX - 0.05);
                    setCropX(next);
                    latestCropRef.current = { crop_x: next, crop_y: cropY };
                    onCropSave(next, cropY, scale);
                  }}
                />
                <div />
                <NudgeButton
                  label="→"
                  onClick={() => {
                    const next = Math.min(1, cropX + 0.05);
                    setCropX(next);
                    latestCropRef.current = { crop_x: next, crop_y: cropY };
                    onCropSave(next, cropY, scale);
                  }}
                />
                <div />
                <NudgeButton
                  label="↓"
                  onClick={() => {
                    const next = Math.min(1, cropY + 0.05);
                    setCropY(next);
                    latestCropRef.current = { crop_x: cropX, crop_y: next };
                    onCropSave(cropX, next, scale);
                  }}
                />
                <div />
              </div>
            </div>
          )}

          {/* Replace buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            {!hidePhotoPicker && (
              <button
                onClick={() => setShowPicker(true)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                החלף מאיורים
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
            >
              {uploading ? "מעלה..." : "החלף בתמונה ידנית"}
            </button>
          </div>
        </div>
      ) : (
        /* No image: picker first (priority), then upload */
        <div className="space-y-2">
          {!hidePhotoPicker && (
            <button
              onClick={() => setShowPicker(true)}
              className="w-full rounded-lg border-2 border-dashed border-primary/40 hover:border-primary/70 bg-primary/5 aspect-video flex items-center justify-center text-xs text-primary/70 transition-colors"
            >
              + בחר מאיורים שנוצרו
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-lg border-2 border-dashed border-border hover:border-primary/40 aspect-video flex items-center justify-center text-xs text-muted-foreground transition-colors disabled:opacity-50"
          >
            {uploading ? "מעלה תמונה..." : "↑ העלה תמונה מהמחשב"}
          </button>
        </div>
      )}

      {/* Photo picker dialog */}
      {!hidePhotoPicker && (
        <Dialog open={showPicker} onOpenChange={setShowPicker}>
          <DialogContent className="max-w-2xl w-full" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-base">בחר איור</DialogTitle>
            </DialogHeader>
            {completedPhotos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                אין איורים מוכנים עדיין
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto py-1 pe-1">
                {completedPhotos.map((photo) => {
                  const isSelected = slotState?.photo_id === photo.id;
                  return (
                    <button
                      key={photo.id}
                      onClick={() => {
                        onAssign(photo);
                        setCropX(0);
                        setCropY(0);
                        setScale(1);
                        setShowPicker(false);
                      }}
                      className={`relative rounded-lg overflow-hidden aspect-square border-2 transition-all hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-transparent hover:border-primary/40"
                      }`}
                    >
                      {photo.illustrationUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo.illustrationUrl}
                          alt={photo.original_filename}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                          אין תמונה
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <span className="text-white text-lg font-bold drop-shadow">✓</span>
                        </div>
                      )}
                      {photo.life_stage && (
                        <div className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[9px] text-center py-0.5 truncate px-0.5">
                          {LIFE_STAGE_LABELS[photo.life_stage] ?? photo.life_stage}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── NudgeButton ──────────────────────────────────────────────────────────────

function NudgeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-7 w-7 rounded border border-border bg-muted hover:bg-muted/60 text-xs font-mono flex items-center justify-center transition-colors"
    >
      {label}
    </button>
  );
}

// ─── SpreadMiniView ───────────────────────────────────────────────────────────
// Side-by-side mini canvas for both pages of the spread.
// Active page: drag to pan, drag corner handle to zoom.
// Partner page: dimmed, click to switch selection.

type MiniDragState =
  | { type: "pan";   slotNum: 1 | 2; ox: number; oy: number; cx: number; cy: number; scale: number }
  | { type: "scale"; slotNum: 1 | 2; oy: number; initScale: number; cx: number; cy: number }
  | null;

function SpreadMiniView({
  activePage,
  partnerPage,
  slots,
  focusedSlotNum,
  onSlotFocus,
  onCropUpdate,
  onSelectPartner,
}: {
  activePage: EditorPage;
  partnerPage: EditorPage | null;
  slots: Record<number, SlotState>;
  focusedSlotNum: 1 | 2;
  onSlotFocus: (slot: 1 | 2) => void;
  onCropUpdate: (slotNum: 1 | 2, cx: number, cy: number, scale: number, save: boolean) => void;
  onSelectPartner: () => void;
}) {
  const dragRef = useRef<MiniDragState>(null);
  const latestRef = useRef<{ slotNum: 1 | 2; cx: number; cy: number; scale: number } | null>(null);

  // Convert partner page images to SlotState map for rendering
  const partnerSlots: Record<number, SlotState> = {};
  if (partnerPage) {
    for (const img of partnerPage.images) {
      partnerSlots[img.slot] = {
        photo_id: img.photo_id,
        image_url: img.image_url,
        crop_x: img.crop_x,
        crop_y: img.crop_y,
        scale: img.scale,
        frame_style: img.frame_style ?? null,
      };
    }
  }

  function onPanDown(e: React.PointerEvent, slotNum: 1 | 2) {
    e.stopPropagation();
    const s = slots[slotNum];
    dragRef.current = {
      type: "pan",
      slotNum,
      ox: e.clientX,
      oy: e.clientY,
      cx: s?.crop_x ?? 0,
      cy: s?.crop_y ?? 0,
      scale: s?.scale ?? 1,
    };
    latestRef.current = { slotNum, cx: s?.crop_x ?? 0, cy: s?.crop_y ?? 0, scale: s?.scale ?? 1 };
    onSlotFocus(slotNum);
  }

  function onScaleDown(e: React.PointerEvent, slotNum: 1 | 2) {
    e.stopPropagation();
    const s = slots[slotNum];
    dragRef.current = {
      type: "scale",
      slotNum,
      oy: e.clientY,
      initScale: s?.scale ?? 1,
      cx: s?.crop_x ?? 0,
      cy: s?.crop_y ?? 0,
    };
    latestRef.current = { slotNum, cx: s?.crop_x ?? 0, cy: s?.crop_y ?? 0, scale: s?.scale ?? 1 };
    onSlotFocus(slotNum);
  }

  function onMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const bounds = SLOT_BOUNDS[activePage.layout_type]?.[drag.slotNum];
    if (!bounds) return;

    if (drag.type === "pan") {
      const rangeX = bounds.w * PAGE_PX * (drag.scale - 1);
      const rangeY = bounds.h * PAGE_PX * (drag.scale - 1);
      const newCX = rangeX > 0 ? Math.max(0, Math.min(1, drag.cx - (e.clientX - drag.ox) / rangeX)) : drag.cx;
      const newCY = rangeY > 0 ? Math.max(0, Math.min(1, drag.cy - (e.clientY - drag.oy) / rangeY)) : drag.cy;
      latestRef.current = { slotNum: drag.slotNum, cx: newCX, cy: newCY, scale: drag.scale };
      onCropUpdate(drag.slotNum, newCX, newCY, drag.scale, false);
    } else {
      // Drag DOWN = zoom in (increase scale)
      const dy = e.clientY - drag.oy;
      const newScale = Math.max(1, Math.min(4, drag.initScale + dy / (PAGE_PX * 0.5)));
      latestRef.current = { slotNum: drag.slotNum, cx: drag.cx, cy: drag.cy, scale: newScale };
      onCropUpdate(drag.slotNum, drag.cx, drag.cy, newScale, false);
    }
  }

  function onUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (latestRef.current) {
      const { slotNum, cx, cy, scale } = latestRef.current;
      latestRef.current = null;
      onCropUpdate(slotNum, cx, cy, scale, true);
    }
  }

  function renderPageCanvas(
    page: EditorPage,
    pageSlots: Record<number, SlotState>,
    isActive: boolean
  ) {
    const slotBoundsMap = SLOT_BOUNDS[page.layout_type] ?? {};
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded border ${
          isActive
            ? "border-primary/40"
            : "border-border/30 cursor-pointer"
        }`}
        style={{ width: PAGE_PX, height: PAGE_PX, opacity: isActive ? 1 : 0.65 }}
        onClick={!isActive ? onSelectPartner : undefined}
      >
        {/* Slot containers */}
        {Object.entries(slotBoundsMap).map(([snStr, bounds]) => {
          const sn = Number(snStr) as 1 | 2;
          const ss = pageSlots[sn];
          const isFocused = isActive && sn === focusedSlotNum;
          const imgScale = Math.max(1, ss?.scale ?? 1);
          return (
            <div
              key={sn}
              className="absolute overflow-hidden"
              style={{
                left: bounds.x * PAGE_PX,
                top: bounds.y * PAGE_PX,
                width: bounds.w * PAGE_PX,
                height: bounds.h * PAGE_PX,
                outline: isFocused
                  ? "2px dashed hsl(var(--primary))"
                  : isActive
                  ? "1px dashed hsl(var(--border))"
                  : undefined,
                outlineOffset: isFocused ? "-2px" : "-1px",
                cursor: isActive
                  ? ss?.image_url && imgScale > 1
                    ? "grab"
                    : "crosshair"
                  : "pointer",
              }}
              onPointerDown={
                isActive
                  ? ss?.image_url
                    ? (e) => onPanDown(e, sn)
                    : (e) => { e.stopPropagation(); onSlotFocus(sn); }
                  : undefined
              }
            >
              {ss?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ss.image_url}
                  alt=""
                  draggable={false}
                  style={{
                    position: "absolute",
                    width: `${imgScale * 100}%`,
                    height: `${imgScale * 100}%`,
                    left: `${-(ss.crop_x ?? 0) * (imgScale - 1) * 100}%`,
                    top: `${-(ss.crop_y ?? 0) * (imgScale - 1) * 100}%`,
                    objectFit: "cover",
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                />
              ) : (
                <div className="w-full h-full bg-muted/40 flex items-center justify-center">
                  <span className="text-[8px] text-muted-foreground/40">ריק</span>
                </div>
              )}
              {/* Corner handles on focused slot with image */}
              {isFocused && ss?.image_url && (
                <>
                  {[
                    "top-0 start-0",
                    "top-0 end-0",
                    "bottom-0 start-0",
                    "bottom-0 end-0",
                  ].map((pos, i) => (
                    <div
                      key={i}
                      className={`absolute ${pos} z-10 w-2 h-2 bg-white border border-primary/80 rounded-[1px]`}
                      style={{ margin: 1 }}
                      onPointerDown={(e) => onScaleDown(e, sn)}
                    />
                  ))}
                </>
              )}
            </div>
          );
        })}
        {/* Empty state for TEXT_ONLY */}
        {Object.keys(slotBoundsMap).length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[9px] text-muted-foreground/40">טקסט בלבד</span>
          </div>
        )}
        {/* Page number */}
        <div
          className="absolute bottom-0 inset-x-0 text-[8px] text-center py-0.5 pointer-events-none select-none"
          style={{ background: "rgba(0,0,0,0.25)", color: "white" }}
        >
          {page.page_number}
        </div>
      </div>
    );
  }

  // Hebrew book order: lower page_number = right page (physically on the right)
  // We display: left-side canvas = higher page#, right-side canvas = lower page#
  const activeIsRight = !partnerPage || activePage.page_number <= partnerPage.page_number;

  const leftContent = activeIsRight
    ? partnerPage
      ? renderPageCanvas(partnerPage, partnerSlots, false)
      : <div style={{ width: PAGE_PX, height: PAGE_PX }} className="rounded border border-dashed border-border/20" />
    : renderPageCanvas(activePage, slots, true);

  const rightContent = activeIsRight
    ? renderPageCanvas(activePage, slots, true)
    : partnerPage
      ? renderPageCanvas(partnerPage, partnerSlots, false)
      : <div style={{ width: PAGE_PX, height: PAGE_PX }} className="rounded border border-dashed border-border/20" />;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">תצוגת פריסה</p>
      <div
        dir="ltr"
        className="flex items-start select-none"
        style={{ touchAction: "none" }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        {leftContent}
        {/* Spine guide */}
        <div
          className="shrink-0 self-stretch relative"
          style={{ width: 12 }}
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border/50" />
        </div>
        {rightContent}
      </div>
    </div>
  );
}

// ─── FrameStylePicker ─────────────────────────────────────────────────────────
// Row of buttons to select a decorative frame preset for the focused slot.

function FrameStylePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (style: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">מסגרת</p>
      <div className="flex flex-wrap gap-1.5">
        {FRAME_STYLES.map((fs) => (
          <button
            key={String(fs.id)}
            onClick={() => onChange(fs.id as string | null)}
            className={`rounded-md px-2.5 py-1.5 text-xs border transition-colors ${
              value === fs.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {fs.label}
          </button>
        ))}
      </div>
    </div>
  );
}
