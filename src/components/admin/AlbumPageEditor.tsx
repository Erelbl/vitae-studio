"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  /** Legacy illustration assignment — null when the page has no image content. */
  illustration_storage_path: string | null;
  /** Legacy photo assignment column — null when the page has no image content. */
  photo_id: string | null;
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
  /** Line-height multiplier. Null = default (1.4). */
  line_height: number | null;
  /** Text box width percentage (20–100). Null = layout default. */
  text_width_pct: number | null;
  /** Page background hex color. Null = layout default. */
  bg_color: string | null;
  images: Array<{
    slot: number;
    photo_id: string | null;
    /** Manually-uploaded image path — set when the slot bypasses photo selection. */
    manual_image_path: string | null;
    crop_x: number;
    crop_y: number;
    scale: number;
    frame_style: string | null;
    image_url: string | null;
    use_nobg: boolean;
    crop_inset_top: number;
    crop_inset_right: number;
    crop_inset_bottom: number;
    crop_inset_left: number;
  }>;
};

export type PhotoForEditor = {
  id: string;
  illustrationUrl: string | null;
  original_filename: string;
  life_stage: string | null;
  caption: string | null;
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
  use_nobg: boolean;
  crop_inset_top: number;
  crop_inset_right: number;
  crop_inset_bottom: number;
  crop_inset_left: number;
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
      use_nobg: s.use_nobg,
      crop_inset_top:    s.crop_inset_top,
      crop_inset_right:  s.crop_inset_right,
      crop_inset_bottom: s.crop_inset_bottom,
      crop_inset_left:   s.crop_inset_left,
    }));
}

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
  personName,
  onPageSelect,
  onPageUpdate,
  textDragMode,
  onTextDragToggle,
  onClearTextPosition,
  currentTextX,
  currentTextY,
  externalPageId,
  coverDragBox,
  onCoverBoxDragToggle,
  onEnterCropMode,
}: {
  orderId: string;
  pages: EditorPage[];
  completedPhotos: PhotoForEditor[];
  /** Person name from the order — forwarded to cover page editor for defaults. */
  personName?: string;
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
  /** Which cover text box is being dragged (1 = title, 2 = subtitle, null = none). */
  coverDragBox?: 1 | 2 | null;
  /** Called to toggle drag mode for a cover box. */
  onCoverBoxDragToggle?: (box: 1 | 2 | null) => void;
  /** Called when admin clicks "חתוך תמונה" to start on-canvas crop mode. */
  onEnterCropMode?: (pageId: string, slot: 1 | 2) => void;
}) {
  const router = useRouter();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [insertingSpread, setInsertingSpread] = useState(false);
  const [removingEmptySpread, setRemovingEmptySpread] = useState(false);

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
   * The "remove empty last spread" button is always shown to the admin —
   * visibility is intentionally NOT gated by any client-side prediction of
   * whether the last spread is empty/removable. A client-side gate here
   * (e.g. a `lastEmptySpread` memo mirroring the server's checks) previously
   * caused the button to vanish and stay gone — once it disagreed with the
   * server about the album's state (e.g. after a historical page_number
   * anomaly), there was no way for the admin to even trigger a request that
   * could resolve it. The server (route.ts remove-empty-last-spread) is the
   * sole source of truth: it independently re-validates everything (order
   * scope, last-spread-only, pair-only, both-pages-empty, minimum page
   * count) before deleting anything, and returns a clear Hebrew error when
   * the action isn't currently valid — which we surface as a toast.
   */
  async function handleRemoveEmptyLastSpread() {
    if (
      !confirm(
        "להסיר את כפולת העמודים הריקה האחרונה מהאלבום? הפעולה אינה הפיכה."
      )
    ) {
      return;
    }
    setRemovingEmptySpread(true);
    try {
      const res = await fetch(
        `/api/admin/orders/${orderId}/album/remove-empty-last-spread`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "שגיאה בהסרת הכפולה הריקה");
        return;
      }
      // The removed pages may have included the currently-selected one —
      // clear selection unconditionally rather than guessing which IDs
      // were deleted (the server only returns page numbers, not ids).
      setSelectedPageId(null);
      toast.success("כפולת העמודים הריקה הוסרה מהאלבום");
      router.refresh();
      // Correctness over smooth UX: force a hard reload so the next click's
      // gating decision (made entirely server-side) always sees the true
      // post-deletion state, even if the RSC refresh were ever insufficient.
      window.location.reload();
    } finally {
      setRemovingEmptySpread(false);
    }
  }

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

  async function handleInsertSpread() {
    setInsertingSpread(true);
    try {
      const isContentPage =
        selectedPage?.page_type === "illustration_and_text" ||
        selectedPage?.page_type === "text_only";
      const res = await fetch(
        `/api/admin/orders/${orderId}/pages/insert-spread`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isContentPage
              ? { afterPageNumber: selectedPage!.page_number }
              : {}
          ),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "שגיאה בהוספת כפולה");
        return;
      }
      router.refresh();
    } finally {
      setInsertingSpread(false);
    }
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

        {/* Insert / remove spread actions */}
        <div className="flex items-center justify-end gap-3">
          {/* Always rendered — admin-only (AlbumPageEditor is admin-preview-only
              UI). Visibility is intentionally not gated by any client-side
              prediction; the server independently validates and authoritatively
              decides whether the action succeeds (see handleRemoveEmptyLastSpread). */}
          <button
            onClick={handleRemoveEmptyLastSpread}
            disabled={removingEmptySpread}
            className="text-xs text-destructive/70 hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {removingEmptySpread
              ? "מסיר כפולה ריקה..."
              : "🗑 הסר כפולה ריקה אחרונה"}
          </button>
          <button
            onClick={handleInsertSpread}
            disabled={insertingSpread}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {insertingSpread
              ? "מוסיף כפולה..."
              : selectedPage?.page_type === "illustration_and_text" ||
                selectedPage?.page_type === "text_only"
              ? "＋ הוסף כפולה אחרי עמוד זה"
              : "＋ הוסף כפולה"}
          </button>
        </div>
      </div>

      {/* Editor panel */}
      {selectedPage && (
        selectedPage.page_type === "illustration_and_text" ? (
          <PageEditorPanel
            key={selectedPage.id}
            orderId={orderId}
            page={selectedPage}
            completedPhotos={completedPhotos}
            onSaved={() => router.refresh()}
            onPageUpdate={onPageUpdate}
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
            onEnterCropMode={
              onEnterCropMode
                ? (slot) => onEnterCropMode(selectedPage.id, slot)
                : undefined
            }
          />
        ) : (
          <SpecialPagePanel
            key={selectedPage.id}
            orderId={orderId}
            page={selectedPage}
            completedPhotos={completedPhotos}
            personName={personName}
            onSaved={() => router.refresh()}
            coverDragBox={coverDragBox}
            onCoverBoxDragToggle={onCoverBoxDragToggle}
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
  completedPhotos,
  onSaved,
  onPageUpdate,
  textDragMode,
  onTextDragToggle,
  onClearTextPosition,
  currentTextX,
  currentTextY,
  onEnterCropMode,
}: {
  orderId: string;
  page: EditorPage;
  completedPhotos: PhotoForEditor[];
  onSaved: () => void;
  onPageUpdate?: (pageId: string, overrides: Partial<PreviewPage>) => void;
  textDragMode?: boolean;
  /** Toggle drag mode for current page. */
  onTextDragToggle?: () => void;
  /** Clear custom text position for current page. */
  onClearTextPosition?: () => void;
  currentTextX?: number | null;
  currentTextY?: number | null;
  /** Called when admin clicks the crop button — activates on-canvas crop mode. */
  onEnterCropMode?: (slot: 1 | 2) => void;
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
  const [lineHeight, setLineHeight] = useState<number>(page.line_height ?? 1.4);
  const [textWidthPct, setTextWidthPct] = useState<number>(page.text_width_pct ?? 84);
  const [bgColor, setBgColor] = useState<string | null>(page.bg_color ?? null);

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
        use_nobg: img.use_nobg ?? false,
        crop_inset_top:    img.crop_inset_top    ?? 0,
        crop_inset_right:  img.crop_inset_right  ?? 0,
        crop_inset_bottom: img.crop_inset_bottom ?? 0,
        crop_inset_left:   img.crop_inset_left   ?? 0,
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

  async function handleLineHeightCommit(newLh: number) {
    onPageUpdate?.(page.id, { line_height: newLh });
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line_height: newLh }),
    });
  }

  async function handleTextWidthCommit(newPct: number) {
    onPageUpdate?.(page.id, { text_width_pct: newPct });
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_width_pct: newPct }),
    });
  }

  async function handleBgColorChange(newColor: string | null) {
    setBgColor(newColor);
    onPageUpdate?.(page.id, { bg_color: newColor });
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bg_color: newColor }),
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
      [slot]: { photo_id: photoId, image_url: imageUrl, crop_x: 0.5, crop_y: 0.5, scale: 1, frame_style: null, use_nobg: false, crop_inset_top: 0, crop_inset_right: 0, crop_inset_bottom: 0, crop_inset_left: 0 },
    };
    setSlots(newSlots);
    // Push to large preview immediately for instant visual feedback
    onPageUpdate?.(page.id, { images: buildImages(newSlots) });

    const res = await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, photoId, crop_x: 0.5, crop_y: 0.5, scale: 1, frame_style: null }),
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
      [slot]: { photo_id: null, image_url: imageUrl, crop_x: 0.5, crop_y: 0.5, scale: 1, frame_style: null, use_nobg: false, crop_inset_top: 0, crop_inset_right: 0, crop_inset_bottom: 0, crop_inset_left: 0 },
    };
    setSlots(newSlots);
    onPageUpdate?.(page.id, { images: buildImages(newSlots) });
    // Optimistic update already shows the image — no router.refresh() to avoid clearing it.
  }

  /** Save non-destructive crop insets for a slot. Called from ImageCropModal. */
  async function handleCropInsetSave(
    slotNum: 1 | 2,
    top: number, right: number, bottom: number, left: number
  ) {
    const currentSlot = slots[slotNum];
    if (!currentSlot) return;
    const newSlots = {
      ...slots,
      [slotNum]: { ...currentSlot, crop_inset_top: top, crop_inset_right: right, crop_inset_bottom: bottom, crop_inset_left: left },
    };
    setSlots(newSlots);
    onPageUpdate?.(page.id, { images: buildImages(newSlots) });
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: slotNum, crop_inset_top: top, crop_inset_right: right, crop_inset_bottom: bottom, crop_inset_left: left }),
    });
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

  const [nobgLoadingSlot, setNobgLoadingSlot] = useState<number | null>(null);

  /**
   * Enable or disable the white-background-removed version for a slot.
   *
   * Enable:  calls the remove-background API (idempotent), updates DB use_nobg=true,
   *          and immediately shows the transparent PNG in the preview.
   * Disable: updates DB use_nobg=false, clears local image_url so the preview falls
   *          back to server data (original URL) after the next refresh.
   */
  async function handleNobg(slotNum: 1 | 2, enable: boolean) {
    const currentSlot = slots[slotNum];
    if (!currentSlot?.photo_id) return;

    if (enable) {
      setNobgLoadingSlot(slotNum);
      try {
        const res = await fetch(
          `/api/admin/orders/${orderId}/photos/${currentSlot.photo_id}/remove-background`,
          { method: "POST" }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error ?? "שגיאה בהסרת הרקע הלבן");
          return;
        }
        const { nobgUrl } = await res.json();

        // Persist use_nobg=true in DB
        await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot: slotNum, use_nobg: true }),
        });

        // Update local state + preview immediately
        setSlots((prev) => {
          const updated = {
            ...prev,
            [slotNum]: { ...prev[slotNum], use_nobg: true, image_url: nobgUrl },
          };
          onPageUpdate?.(page.id, { images: buildImages(updated) });
          return updated;
        });
        // Refresh server data so `pages` prop is up-to-date with use_nobg=true.
        // Without this, navigating away and back would remount PageEditorPanel
        // from stale page.images, losing the nobg choice.
        onSaved();
      } finally {
        setNobgLoadingSlot(null);
      }
    } else {
      // Persist use_nobg=false in DB
      await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: slotNum, use_nobg: false }),
      });

      // Clear local image_url so buildImages excludes this slot from overrides.
      // The preview will then fall back to server data (original URL) after refresh.
      setSlots((prev) => {
        const updated = {
          ...prev,
          [slotNum]: { ...prev[slotNum], use_nobg: false, image_url: null },
        };
        onPageUpdate?.(page.id, { images: buildImages(updated) });
        return updated;
      });

      // Refresh to reload original signed URL from server
      onSaved();
    }
  }

  const activeSlots = LAYOUT_SLOTS[layoutType] ?? [];

  return (
    <div className="space-y-6 pt-1">
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

      {/* Line spacing slider + numeric input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">רווח בין שורות</p>
          <input
            type="number"
            min={0.8}
            max={2.5}
            step={0.1}
            value={lineHeight}
            onChange={(e) => {
              const v = Math.max(0.8, Math.min(2.5, parseFloat(e.target.value) || 1.4));
              setLineHeight(v);
              onPageUpdate?.(page.id, { line_height: v });
            }}
            onBlur={(e) => {
              const v = Math.max(0.8, Math.min(2.5, parseFloat(e.target.value) || 1.4));
              handleLineHeightCommit(v);
            }}
            className="w-14 rounded border border-border bg-background px-2 py-0.5 text-xs tabular-nums text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <input
          type="range"
          min={0.8}
          max={2.5}
          step={0.1}
          value={lineHeight}
          onChange={(e) => setLineHeight(parseFloat(e.target.value))}
          onPointerUp={(e) => handleLineHeightCommit(parseFloat((e.target as HTMLInputElement).value))}
          className="w-full h-1.5 appearance-none bg-border rounded accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/50 select-none">
          <span>צפוף (0.8)</span>
          <span>מרווח (2.5)</span>
        </div>
      </div>

      {/* Text box width slider + numeric input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">רוחב תיבת טקסט</p>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={20}
              max={100}
              step={5}
              value={textWidthPct}
              onChange={(e) => {
                const v = Math.max(20, Math.min(100, Number(e.target.value) || 84));
                setTextWidthPct(v);
                onPageUpdate?.(page.id, { text_width_pct: v });
              }}
              onBlur={(e) => {
                const v = Math.max(20, Math.min(100, Number(e.target.value) || 84));
                handleTextWidthCommit(v);
              }}
              className="w-14 rounded border border-border bg-background px-2 py-0.5 text-xs tabular-nums text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          value={textWidthPct}
          onChange={(e) => setTextWidthPct(Number(e.target.value))}
          onPointerUp={(e) => handleTextWidthCommit(Number((e.target as HTMLInputElement).value))}
          className="w-full h-1.5 appearance-none bg-border rounded accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/50 select-none">
          <span>צר (20%)</span>
          <span>רחב (100%)</span>
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

      {/* Background color palette */}
      <BgColorPicker value={bgColor} onChange={handleBgColorChange} />

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
              nobgLoading={nobgLoadingSlot === focusedSlot}
              onAssign={(photo) => handleSlotAssign(focusedSlot, photo)}
              onCropSave={(crop_x, crop_y, scale) =>
                handleCropSave(focusedSlot, crop_x, crop_y, scale)
              }
              onCropInsetSave={(t, r, b, l) => handleCropInsetSave(focusedSlot, t, r, b, l)}
              onEnterCropMode={onEnterCropMode ? () => onEnterCropMode(focusedSlot) : undefined}
              onManualUpload={(imageUrl) =>
                handleManualUpload(focusedSlot, imageUrl)
              }
              onToggleNobg={(enable) => handleNobg(focusedSlot, enable)}
            />
          ) : (
            <ImageSlotEditor
              key={activeSlots[0]}
              slot={activeSlots[0] as 1 | 2}
              slotState={slots[activeSlots[0]] ?? null}
              completedPhotos={completedPhotos}
              orderId={orderId}
              pageId={page.id}
              nobgLoading={nobgLoadingSlot === activeSlots[0]}
              onAssign={(photo) => handleSlotAssign(activeSlots[0] as 1 | 2, photo)}
              onCropSave={(crop_x, crop_y, scale) =>
                handleCropSave(activeSlots[0] as 1 | 2, crop_x, crop_y, scale)
              }
              onCropInsetSave={(t, r, b, l) => handleCropInsetSave(activeSlots[0] as 1 | 2, t, r, b, l)}
              onEnterCropMode={onEnterCropMode ? () => onEnterCropMode(activeSlots[0] as 1 | 2) : undefined}
              onManualUpload={(imageUrl) =>
                handleManualUpload(activeSlots[0] as 1 | 2, imageUrl)
              }
              onToggleNobg={(enable) => handleNobg(activeSlots[0] as 1 | 2, enable)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── SpecialPagePanel ─────────────────────────────────────────────────────────
// Editor for cover, dedication, back_cover, text_only pages.
// Cover gets a two-box editor with position + size controls and nobg support.
// Other special pages get a single text textarea + manual image upload.

interface CoverBoxEditorState {
  text: string;
  x: number;   // 0–1 horizontal position
  y: number;   // 0–1 vertical position
  size: number; // px
}

function parseCoverEditorData(
  textContent: string | null,
  personName: string
): { box1: CoverBoxEditorState; box2: CoverBoxEditorState } {
  const b1: CoverBoxEditorState = { text: personName, x: 0.5, y: 0.47, size: 28 };
  const b2: CoverBoxEditorState = { text: "סיפור חיים בחרוזים", x: 0.5, y: 0.63, size: 12 };
  if (!textContent) return { box1: b1, box2: b2 };
  try {
    const parsed = JSON.parse(textContent);
    if (parsed && typeof parsed === "object" && ("box1" in parsed || "box2" in parsed)) {
      return {
        box1: { text: parsed.box1?.text ?? b1.text, x: parsed.box1?.x ?? b1.x, y: parsed.box1?.y ?? b1.y, size: parsed.box1?.size ?? b1.size },
        box2: { text: parsed.box2?.text ?? b2.text, x: parsed.box2?.x ?? b2.x, y: parsed.box2?.y ?? b2.y, size: parsed.box2?.size ?? b2.size },
      };
    }
  } catch {}
  // Legacy plain string → becomes box2 text
  return { box1: b1, box2: { ...b2, text: textContent } };
}

function SpecialPagePanel({
  orderId,
  page,
  completedPhotos,
  personName,
  onSaved,
  coverDragBox,
  onCoverBoxDragToggle,
}: {
  orderId: string;
  page: EditorPage;
  completedPhotos: PhotoForEditor[];
  personName?: string;
  onSaved: () => void;
  /** Which cover box drag is active (passed from AlbumEditorLayout via AlbumPageEditor). */
  coverDragBox?: 1 | 2 | null;
  onCoverBoxDragToggle?: (box: 1 | 2 | null) => void;
}) {
  const isCover = page.page_type === "cover";

  // Cover: two-box state
  const initCover = parseCoverEditorData(page.text_content, personName ?? "");
  const [coverBox1, setCoverBox1] = useState<CoverBoxEditorState>(initCover.box1);
  const [coverBox2, setCoverBox2] = useState<CoverBoxEditorState>(initCover.box2);
  const [coverDirty, setCoverDirty] = useState(false);
  const [savingCover, setSavingCover] = useState(false);

  // Non-cover: single text
  const [text, setText] = useState(page.text_content ?? "");
  const [textDirty, setTextDirty] = useState(false);
  const [savingText, setSavingText] = useState(false);

  // Slot 1 image state (shared)
  const [slotState, setSlotState] = useState<SlotState>(() => {
    const img = page.images.find((i) => i.slot === 1);
    return img
      ? { photo_id: img.photo_id, image_url: img.image_url, crop_x: img.crop_x, crop_y: img.crop_y, scale: img.scale, frame_style: img.frame_style ?? null, use_nobg: img.use_nobg ?? false, crop_inset_top: img.crop_inset_top ?? 0, crop_inset_right: img.crop_inset_right ?? 0, crop_inset_bottom: img.crop_inset_bottom ?? 0, crop_inset_left: img.crop_inset_left ?? 0 }
      : { photo_id: null, image_url: null, crop_x: 0.5, crop_y: 0.5, scale: 1, frame_style: null, use_nobg: false, crop_inset_top: 0, crop_inset_right: 0, crop_inset_bottom: 0, crop_inset_left: 0 };
  });
  const [nobgLoading, setNobgLoading] = useState(false);

  async function saveCoverText() {
    if (!coverDirty) return;
    setSavingCover(true);
    const json = JSON.stringify({
      box1: { text: coverBox1.text, x: coverBox1.x, y: coverBox1.y, size: coverBox1.size },
      box2: { text: coverBox2.text, x: coverBox2.x, y: coverBox2.y, size: coverBox2.size },
    });
    const res = await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_content: json }),
    });
    setSavingCover(false);
    if (res.ok) {
      setCoverDirty(false);
      onSaved();
    } else {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "שגיאה בשמירת הטקסט");
    }
  }

  async function saveText() {
    if (!textDirty) return;
    setSavingText(true);
    const res = await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_content: text }),
    });
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
  }

  async function handleAssign(photo: PhotoForEditor | null) {
    const newState: SlotState = photo
      ? { photo_id: photo.id, image_url: photo.illustrationUrl, crop_x: 0.5, crop_y: 0.5, scale: 1, frame_style: null, use_nobg: false, crop_inset_top: 0, crop_inset_right: 0, crop_inset_bottom: 0, crop_inset_left: 0 }
      : { photo_id: null, image_url: null, crop_x: 0.5, crop_y: 0.5, scale: 1, frame_style: null, use_nobg: false, crop_inset_top: 0, crop_inset_right: 0, crop_inset_bottom: 0, crop_inset_left: 0 };
    setSlotState(newState);
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: 1, photoId: photo?.id ?? null }),
    });
    onSaved();
  }

  function handleManualUpload(imageUrl: string) {
    setSlotState({ photo_id: null, image_url: imageUrl, crop_x: 0.5, crop_y: 0.5, scale: 1, frame_style: null, use_nobg: false, crop_inset_top: 0, crop_inset_right: 0, crop_inset_bottom: 0, crop_inset_left: 0 });
    onSaved();
  }

  async function handleNobg(enable: boolean) {
    const photo_id = slotState.photo_id;
    if (!photo_id) return;
    setNobgLoading(true);
    if (enable) {
      const res = await fetch(
        `/api/admin/orders/${orderId}/photos/${photo_id}/remove-background`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "שגיאה בהסרת הרקע הלבן");
        setNobgLoading(false);
        return;
      }
      const { nobgUrl } = await res.json();
      await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: 1, use_nobg: true }),
      });
      setSlotState((prev) => ({ ...prev, use_nobg: true, image_url: nobgUrl }));
    } else {
      await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: 1, use_nobg: false }),
      });
      setSlotState((prev) => ({ ...prev, use_nobg: false, image_url: null }));
      onSaved();
    }
    setNobgLoading(false);
  }

  return (
    <div className="space-y-6 pt-1">
      {isCover ? (
        /* ── Cover: two independent text boxes ── */
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">טקסטים על הכריכה</p>
          {/* Box 1 — title */}
          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">כותרת</p>
              {onCoverBoxDragToggle && (
                <button
                  type="button"
                  onClick={() => onCoverBoxDragToggle(coverDragBox === 1 ? null : 1)}
                  className={`text-[10px] rounded px-2 py-0.5 border transition-colors ${
                    coverDragBox === 1
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {coverDragBox === 1 ? "✓ גוררים" : "גרור על הכריכה"}
                </button>
              )}
            </div>
            <input
              type="text"
              value={coverBox1.text}
              onChange={(e) => { setCoverBox1((p) => ({ ...p, text: e.target.value })); setCoverDirty(true); }}
              onBlur={saveCoverText}
              dir="rtl"
              placeholder={personName ?? "שם האדם"}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <label className="text-[10px] text-muted-foreground whitespace-nowrap">אופקי %</label>
              <label className="text-[10px] text-muted-foreground whitespace-nowrap">אנכי %</label>
              <input
                type="number" min={0} max={100} step={1}
                value={Math.round(coverBox1.x * 100)}
                onChange={(e) => { setCoverBox1((p) => ({ ...p, x: Number(e.target.value) / 100 })); setCoverDirty(true); }}
                onBlur={saveCoverText}
                className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <input
                type="number" min={0} max={100} step={1}
                value={Math.round(coverBox1.y * 100)}
                onChange={(e) => { setCoverBox1((p) => ({ ...p, y: Number(e.target.value) / 100 })); setCoverDirty(true); }}
                onBlur={saveCoverText}
                className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-[10px] text-muted-foreground whitespace-nowrap">גודל px</label>
              <input
                type="number" min={10} max={80} step={1}
                value={coverBox1.size}
                onChange={(e) => { setCoverBox1((p) => ({ ...p, size: Number(e.target.value) })); setCoverDirty(true); }}
                onBlur={saveCoverText}
                className="w-14 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
          </div>
          {/* Box 2 — subtitle */}
          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">תת-כותרת</p>
              {onCoverBoxDragToggle && (
                <button
                  type="button"
                  onClick={() => onCoverBoxDragToggle(coverDragBox === 2 ? null : 2)}
                  className={`text-[10px] rounded px-2 py-0.5 border transition-colors ${
                    coverDragBox === 2
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {coverDragBox === 2 ? "✓ גוררים" : "גרור על הכריכה"}
                </button>
              )}
            </div>
            <input
              type="text"
              value={coverBox2.text}
              onChange={(e) => { setCoverBox2((p) => ({ ...p, text: e.target.value })); setCoverDirty(true); }}
              onBlur={saveCoverText}
              dir="rtl"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <label className="text-[10px] text-muted-foreground whitespace-nowrap">אופקי %</label>
              <label className="text-[10px] text-muted-foreground whitespace-nowrap">אנכי %</label>
              <input
                type="number" min={0} max={100} step={1}
                value={Math.round(coverBox2.x * 100)}
                onChange={(e) => { setCoverBox2((p) => ({ ...p, x: Number(e.target.value) / 100 })); setCoverDirty(true); }}
                onBlur={saveCoverText}
                className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <input
                type="number" min={0} max={100} step={1}
                value={Math.round(coverBox2.y * 100)}
                onChange={(e) => { setCoverBox2((p) => ({ ...p, y: Number(e.target.value) / 100 })); setCoverDirty(true); }}
                onBlur={saveCoverText}
                className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-[10px] text-muted-foreground whitespace-nowrap">גודל px</label>
              <input
                type="number" min={10} max={80} step={1}
                value={coverBox2.size}
                onChange={(e) => { setCoverBox2((p) => ({ ...p, size: Number(e.target.value) })); setCoverDirty(true); }}
                onBlur={saveCoverText}
                className="w-14 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
          </div>
          {coverDirty && (
            <button onClick={saveCoverText} disabled={savingCover} className="text-xs text-primary hover:underline disabled:opacity-50">
              {savingCover ? "שומר..." : "שמור ←"}
            </button>
          )}
        </div>
      ) : (
        /* ── Non-cover: single text editor ── */
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">טקסט העמוד</label>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setTextDirty(true); }}
            onBlur={saveText}
            rows={3}
            dir="rtl"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 leading-relaxed"
            placeholder="הטקסט של העמוד..."
          />
          {textDirty && (
            <button onClick={saveText} disabled={savingText} className="text-xs text-primary hover:underline disabled:opacity-50">
              {savingText ? "שומר..." : "שמור טקסט ←"}
            </button>
          )}
        </div>
      )}

      {/* Background image — slot 1 */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">תמונת רקע</p>
        <ImageSlotEditor
          slot={1}
          slotState={slotState}
          completedPhotos={isCover ? completedPhotos : []}
          orderId={orderId}
          pageId={page.id}
          hidePhotoPicker={!isCover}
          nobgLoading={nobgLoading}
          onAssign={handleAssign}
          onCropSave={(crop_x, crop_y, scale) => handleCropSave(crop_x, crop_y, scale)}
          onManualUpload={handleManualUpload}
          onToggleNobg={isCover ? handleNobg : undefined}
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
  nobgLoading = false,
  onAssign,
  onCropSave,
  onCropInsetSave,
  onEnterCropMode,
  onManualUpload,
  onToggleNobg,
}: {
  slot: 1 | 2;
  slotState: SlotState | null;
  completedPhotos: PhotoForEditor[];
  orderId: string;
  pageId: string;
  hidePhotoPicker?: boolean;
  /** Whether the remove-background operation is currently running for this slot. */
  nobgLoading?: boolean;
  onAssign: (photo: PhotoForEditor | null) => void;
  onCropSave: (crop_x: number, crop_y: number, scale: number) => void;
  /** Called when admin resets crop to zero (still used for the reset button). */
  onCropInsetSave?: (top: number, right: number, bottom: number, left: number) => void;
  /** Called when admin clicks the crop button — activates on-canvas crop mode. */
  onEnterCropMode?: () => void;
  onManualUpload: (imageUrl: string) => void;
  /** Called when the admin toggles the no-bg effect on/off. Only available for photo slots. */
  onToggleNobg?: (enable: boolean) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [scale, setScale] = useState(slotState?.scale ?? 1);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageUrl = slotState?.image_url ?? null;
  const hasImage = Boolean(imageUrl);
  const isManual = hasImage && !slotState?.photo_id;
  const hasCropInset = Boolean(
    slotState && (
      (slotState.crop_inset_top ?? 0) > 0 ||
      (slotState.crop_inset_right ?? 0) > 0 ||
      (slotState.crop_inset_bottom ?? 0) > 0 ||
      (slotState.crop_inset_left ?? 0) > 0
    )
  );

  function handleScaleChange(newScale: number) {
    setScale(newScale);
    onCropSave(slotState?.crop_x ?? 0.5, slotState?.crop_y ?? 0.5, newScale);
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
      setScale(1);
      onManualUpload(data.imageUrl);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "שגיאה בהעלאת התמונה");
    }
  }

  const slotLabel = slot === 1 ? "איור 1 (ראשי)" : "איור 2 (משני)";

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
              setScale(1);
            }}
            className="text-xs text-destructive hover:underline"
          >
            הסר
          </button>
        )}
      </div>

      {/* Image controls */}
      {hasImage ? (
        <div className="space-y-3">
          {/* Hint: editing happens on the large preview */}
          <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            גרור ושנה גודל ישירות על התצוגה הגדולה
          </p>

          {/* Zoom slider — supplemental control */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground w-12 shrink-0 tabular-nums">
              זום {scale.toFixed(1)}×
            </span>
            <input
              type="range"
              min={0.1}
              max={4}
              step={0.05}
              value={scale}
              onChange={(e) => handleScaleChange(Number(e.target.value))}
              className="flex-1 h-1.5 appearance-none bg-border rounded accent-primary"
            />
          </div>

          {/* Crop button */}
          {onEnterCropMode && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onEnterCropMode()}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  hasCropInset
                    ? "border-primary/60 text-primary bg-primary/5 hover:bg-primary/10"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {hasCropInset ? "✂ ערוך חיתוך" : "✂ חתוך תמונה"}
              </button>
              {hasCropInset && onCropInsetSave && (
                <button
                  onClick={() => onCropInsetSave(0, 0, 0, 0)}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  איפוס חיתוך
                </button>
              )}
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

          {/* White background removal — only available for photo-based slots */}
          {slotState?.photo_id && onToggleNobg && (
            <div className="flex items-center gap-2 pt-1 border-t border-border/40">
              {slotState.use_nobg ? (
                <button
                  onClick={() => onToggleNobg(false)}
                  disabled={nobgLoading}
                  className="text-xs text-amber-600 hover:text-amber-700 underline underline-offset-2 disabled:opacity-50"
                >
                  שחזר רקע מקורי
                </button>
              ) : (
                <button
                  onClick={() => onToggleNobg(true)}
                  disabled={nobgLoading}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
                >
                  {nobgLoading ? "מסיר רקע..." : "הסר רקע לבן"}
                </button>
              )}
              {slotState.use_nobg && (
                <span className="text-[10px] text-primary/60 font-normal">(ללא רקע)</span>
              )}
            </div>
          )}
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
          <DialogContent className="sm:max-w-[92vw] max-h-[92vh] flex flex-col" dir="rtl">
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-base">בחר איור</DialogTitle>
            </DialogHeader>
            {completedPhotos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                אין איורים מוכנים עדיין
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 overflow-y-auto py-1 pe-1 min-h-0 flex-1">
                {completedPhotos.map((photo) => {
                  const isSelected = slotState?.photo_id === photo.id;
                  const label = photo.caption
                    ?? (photo.life_stage ? (LIFE_STAGE_LABELS[photo.life_stage] ?? photo.life_stage) : null)
                    ?? photo.original_filename;
                  return (
                    <div key={photo.id} className="flex flex-col gap-1.5">
                      <p className="text-xs leading-snug text-foreground/80 line-clamp-2 px-0.5 text-right min-h-[2.5em]">
                        {label}
                      </p>
                      <button
                        onClick={() => {
                          onAssign(photo);
                          setScale(1);
                          setShowPicker(false);
                        }}
                        className={`relative rounded-lg overflow-hidden aspect-square border-2 transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                          isSelected
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-transparent hover:border-primary/40"
                        }`}
                      >
                        {photo.illustrationUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photo.illustrationUrl}
                            alt={photo.caption ?? photo.original_filename}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-contain"
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
                    </div>
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

// ─── BgColorPicker ────────────────────────────────────────────────────────────
// Predefined palette for page background color + optional hex input.

const BG_COLOR_PALETTE = [
  { color: null,      label: "ברירת מחדל" },
  { color: "#FAF8F2", label: "קרם" },
  { color: "#FFFFFF", label: "לבן" },
  { color: "#F5F0E8", label: "חמאה" },
  { color: "#EBF0E8", label: "ירוק בהיר" },
  { color: "#E8EAF0", label: "כחול בהיר" },
  { color: "#F0E8EB", label: "ורוד בהיר" },
  { color: "#2D2D2D", label: "כהה" },
  { color: "#1C1C1C", label: "שחור" },
] as const;

function BgColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">צבע רקע עמוד</p>
      <div className="flex flex-wrap gap-1.5">
        {BG_COLOR_PALETTE.map((entry) => {
          const isActive = value === entry.color;
          return (
            <button
              key={String(entry.color)}
              onClick={() => onChange(entry.color as string | null)}
              title={entry.label}
              className={`h-7 w-7 rounded-md border-2 transition-all ${
                isActive
                  ? "border-primary ring-1 ring-primary ring-offset-1"
                  : "border-border hover:border-primary/50"
              }`}
              style={{
                background: entry.color ?? "linear-gradient(135deg, #f0f0f0 50%, #d0d0d0 50%)",
              }}
            />
          );
        })}
      </div>
      {/* Manual hex input for custom colors */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="#RRGGBB"
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (v === "") {
              onChange(null);
            } else if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
              onChange(v);
            }
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v === "" || /^#[0-9A-Fa-f]{6}$/.test(v)) {
              onChange(v === "" ? null : v);
            }
          }}
          maxLength={7}
          dir="ltr"
          className="w-24 rounded border border-border bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        {value && (
          <button
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            איפוס
          </button>
        )}
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

