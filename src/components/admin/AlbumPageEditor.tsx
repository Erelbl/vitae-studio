"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlbumPageView } from "@/components/album/AlbumPageView";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LayoutType, PageImageSlot, PreviewPage, TextSize } from "@/types/page";
import { LAYOUT_TYPES, TEXT_SIZES } from "@/types/page";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditorPage = {
  id: string;
  page_number: number;
  page_type: string;
  layout_type: string;
  text_content: string | null;
  text_version: number;
  text_size: TextSize | null;
  images: Array<{
    slot: number;
    photo_id: string | null;
    crop_x: number;
    crop_y: number;
    scale: number;
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

const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  sm: "קטן",
  md: "בינוני",
  lg: "גדול",
  xl: "גדול מאוד",
};

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
};

// ─── Main component ───────────────────────────────────────────────────────────

export function AlbumPageEditor({
  orderId,
  pages,
  completedPhotos,
  personName,
  onPageSelect,
}: {
  orderId: string;
  pages: EditorPage[];
  completedPhotos: PhotoForEditor[];
  personName: string;
  onPageSelect?: (pageNumber: number) => void;
}) {
  const router = useRouter();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const selectedPage = pages.find((p) => p.id === selectedPageId) ?? null;

  if (pages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        אין עמודים לעריכה. יש לייצר את הסיפור תחילה.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page selector */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">
          בחר עמוד לעריכה ({pages.length} עמודים)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {pages.map((page) => {
            const specialLabel = SPECIAL_PAGE_LABELS[page.page_type];
            return (
              <button
                key={page.id}
                onClick={() => {
                  const isDeselect = page.id === selectedPageId;
                  setSelectedPageId(isDeselect ? null : page.id);
                  if (!isDeselect) onPageSelect?.(page.page_number);
                }}
                className={`h-8 min-w-[2.5rem] px-2 rounded-md text-xs font-mono transition-colors ${
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
            completedPhotos={completedPhotos}
            personName={personName}
            onSaved={() => router.refresh()}
          />
        ) : (
          <SpecialPagePanel
            key={selectedPage.id}
            orderId={orderId}
            page={selectedPage}
            personName={personName}
            onSaved={() => router.refresh()}
          />
        )
      )}
    </div>
  );
}

// ─── PageEditorPanel ──────────────────────────────────────────────────────────

function PageEditorPanel({
  orderId,
  page,
  completedPhotos,
  personName,
  onSaved,
}: {
  orderId: string;
  page: EditorPage;
  completedPhotos: PhotoForEditor[];
  personName: string;
  onSaved: () => void;
}) {
  const [text, setText] = useState(page.text_content ?? "");
  const [layoutType, setLayoutType] = useState<LayoutType>(
    (page.layout_type as LayoutType) ?? "FULL_IMAGE"
  );
  const [textSize, setTextSize] = useState<TextSize>(page.text_size ?? "md");
  const [slots, setSlots] = useState<Record<number, SlotState>>(() => {
    const m: Record<number, SlotState> = {};
    for (const img of page.images) {
      m[img.slot] = {
        photo_id: img.photo_id,
        image_url: img.image_url,
        crop_x: img.crop_x,
        crop_y: img.crop_y,
        scale: img.scale,
      };
    }
    return m;
  });

  const [savingText, setSavingText] = useState(false);
  const [textDirty, setTextDirty] = useState(false);

  /** Build a PreviewPage for the live mini-preview */
  function buildPreviewPage(): PreviewPage {
    const images: PageImageSlot[] = Object.entries(slots)
      // Include slot if it has an image URL (works for both photo and manual)
      .filter(([, s]) => s.image_url !== null)
      .map(([slot, s]) => ({
        id: `local-slot-${slot}`,
        slot: Number(slot) as 1 | 2,
        photo_id: s.photo_id,
        crop_x: s.crop_x,
        crop_y: s.crop_y,
        scale: s.scale,
        image_url: s.image_url,
      }));

    return {
      id: page.id,
      page_number: page.page_number,
      page_type: page.page_type as PreviewPage["page_type"],
      layout_type: layoutType,
      text_content: text || null,
      text_size: textSize,
      image_url:
        page.images.find((i) => i.slot === 1)?.image_url ??
        null,
      images,
    };
  }

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

  async function handleLayoutChange(newLayout: LayoutType) {
    setLayoutType(newLayout);
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout_type: newLayout }),
    });
    onSaved();
  }

  async function handleTextSizeChange(newSize: TextSize) {
    setTextSize(newSize);
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_size: newSize }),
    });
    onSaved();
  }

  async function handleSlotAssign(
    slot: 1 | 2,
    photo: PhotoForEditor | null
  ) {
    const photoId = photo?.id ?? null;
    const imageUrl = photo?.illustrationUrl ?? null;

    // Optimistic update
    const prevSlots = slots;
    setSlots((prev) => ({
      ...prev,
      [slot]: { photo_id: photoId, image_url: imageUrl, crop_x: 0, crop_y: 0, scale: 1 },
    }));

    const res = await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, photoId, crop_x: 0, crop_y: 0, scale: 1 }),
    });

    if (!res.ok) {
      // Roll back optimistic update
      setSlots(prevSlots);
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
    setSlots((prev) => ({
      ...prev,
      [slot]: { ...(prev[slot] ?? { photo_id: null, image_url: null }), crop_x, crop_y, scale },
    }));

    // Skip API call if slot has no image (works for both photo and manual)
    const currentSlot = slots[slot];
    if (!currentSlot?.image_url) return;

    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, crop_x, crop_y, scale }),
    });
    onSaved();
  }

  function handleManualUpload(slot: 1 | 2, imageUrl: string) {
    setSlots((prev) => ({
      ...prev,
      [slot]: { photo_id: null, image_url: imageUrl, crop_x: 0, crop_y: 0, scale: 1 },
    }));
    onSaved();
  }

  const activeSlots = LAYOUT_SLOTS[layoutType] ?? [];
  const previewPage = buildPreviewPage();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 pt-1">
      {/* Live mini-preview */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">
          תצוגה מקדימה — עמוד {page.page_number}
        </p>
        <div className="w-full max-w-[240px]">
          <AlbumPageView page={previewPage} personName={personName} />
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-6">
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
        </div>

        {/* Text size */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">גודל טקסט</p>
          <div className="flex gap-1.5">
            {TEXT_SIZES.map((sz) => (
              <button
                key={sz}
                onClick={() => handleTextSizeChange(sz)}
                className={`rounded-md px-3 py-1.5 text-xs border transition-colors ${
                  textSize === sz
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {TEXT_SIZE_LABELS[sz]}
              </button>
            ))}
          </div>
        </div>

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

        {/* Image slot editors */}
        {activeSlots.length > 0 && (
          <div className="space-y-4">
            <p className="text-xs font-medium text-muted-foreground">
              {activeSlots.length === 1 ? "איור" : "איורים"}
            </p>
            {activeSlots.map((slotNum) => (
              <ImageSlotEditor
                key={slotNum}
                slot={slotNum as 1 | 2}
                slotState={slots[slotNum] ?? null}
                completedPhotos={completedPhotos}
                orderId={orderId}
                pageId={page.id}
                onAssign={(photo) => handleSlotAssign(slotNum as 1 | 2, photo)}
                onCropSave={(crop_x, crop_y, scale) =>
                  handleCropSave(slotNum as 1 | 2, crop_x, crop_y, scale)
                }
                onManualUpload={(imageUrl) =>
                  handleManualUpload(slotNum as 1 | 2, imageUrl)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SpecialPagePanel ─────────────────────────────────────────────────────────
// Simplified editor for cover, dedication, back_cover, text_only pages.
// Supports text editing and manual image upload to slot 1.

function SpecialPagePanel({
  orderId,
  page,
  personName,
  onSaved,
}: {
  orderId: string;
  page: EditorPage;
  personName: string;
  onSaved: () => void;
}) {
  const [text, setText] = useState(page.text_content ?? "");
  const [textDirty, setTextDirty] = useState(false);
  const [savingText, setSavingText] = useState(false);
  const [slotState, setSlotState] = useState<SlotState>(() => {
    const img = page.images.find((i) => i.slot === 1);
    return img
      ? { photo_id: img.photo_id, image_url: img.image_url, crop_x: img.crop_x, crop_y: img.crop_y, scale: img.scale }
      : { photo_id: null, image_url: null, crop_x: 0, crop_y: 0, scale: 1 };
  });

  const pageLabel = SPECIAL_PAGE_LABELS[page.page_type] ?? page.page_type;

  function buildPreviewPage(): PreviewPage {
    const images: PageImageSlot[] = slotState.image_url
      ? [{ id: "local-slot-1", slot: 1, photo_id: slotState.photo_id, crop_x: slotState.crop_x, crop_y: slotState.crop_y, scale: slotState.scale, image_url: slotState.image_url }]
      : [];
    return {
      id: page.id,
      page_number: page.page_number,
      page_type: page.page_type as PreviewPage["page_type"],
      layout_type: (page.layout_type as LayoutType) ?? "FULL_IMAGE",
      text_content: text || null,
      image_url: page.images.find((i) => i.slot === 1)?.image_url ?? null,
      images,
    };
  }

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
  }

  async function handleRemove() {
    setSlotState({ photo_id: null, image_url: null, crop_x: 0, crop_y: 0, scale: 1 });
    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: 1, photoId: null }),
    });
    onSaved();
  }

  function handleManualUpload(imageUrl: string) {
    setSlotState({ photo_id: null, image_url: imageUrl, crop_x: 0, crop_y: 0, scale: 1 });
    onSaved();
  }

  const previewPage = buildPreviewPage();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 pt-1">
      {/* Live mini-preview */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">
          {pageLabel} — עמוד {page.page_number}
        </p>
        <div className="w-full max-w-[240px]">
          <AlbumPageView page={previewPage} personName={personName} />
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-6">
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
  // If photo_id is null but image_url is set, this slot has a manual upload
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
    // Reset file input so the same file can be re-selected later
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
          {/* Drag-to-pan frame — larger for easier positioning */}
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
                {/* Row 1 */}
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
                {/* Row 2 */}
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
                {/* Row 3 */}
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
