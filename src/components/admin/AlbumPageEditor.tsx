"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlbumPageView } from "@/components/album/AlbumPageView";
import type { LayoutType, PageImageSlot, PreviewPage } from "@/types/page";
import { LAYOUT_TYPES } from "@/types/page";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditorPage = {
  id: string;
  page_number: number;
  page_type: string;
  layout_type: string;
  text_content: string | null;
  text_version: number;
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
  FULL_IMAGE: "תמונה מלאה",
  TEXT_ONLY: "טקסט בלבד",
  IMAGE_TOP_TEXT_BOTTOM: "תמונה עליונה",
  TEXT_TOP_IMAGE_BOTTOM: "תמונה תחתונה",
  IMAGE_LEFT_TEXT_RIGHT: "תמונה ימין / טקסט שמאל",
  TWO_IMAGES: "שתי תמונות",
};

/** How many image slots each layout uses */
const LAYOUT_SLOTS: Record<LayoutType, number[]> = {
  FULL_IMAGE: [1],
  TEXT_ONLY: [],
  IMAGE_TOP_TEXT_BOTTOM: [1],
  TEXT_TOP_IMAGE_BOTTOM: [1],
  IMAGE_LEFT_TEXT_RIGHT: [1],
  TWO_IMAGES: [1, 2],
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
}: {
  orderId: string;
  pages: EditorPage[];
  completedPhotos: PhotoForEditor[];
  personName: string;
}) {
  const router = useRouter();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const selectedPage = pages.find((p) => p.id === selectedPageId) ?? null;

  if (pages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        אין עמודי תוכן לעריכה. יש לייצר את הסיפור תחילה.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page selector */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">
          בחר עמוד לעריכה ({pages.length} עמודי תוכן)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {pages.map((page) => (
            <button
              key={page.id}
              onClick={() =>
                setSelectedPageId(
                  page.id === selectedPageId ? null : page.id
                )
              }
              className={`h-8 min-w-[2.5rem] px-2 rounded-md text-xs font-mono transition-colors ${
                page.id === selectedPageId
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {page.page_number}
            </button>
          ))}
        </div>
      </div>

      {/* Editor panel */}
      {selectedPage && (
        <PageEditorPanel
          key={selectedPage.id}
          orderId={orderId}
          page={selectedPage}
          completedPhotos={completedPhotos}
          personName={personName}
          onSaved={() => router.refresh()}
        />
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
      .filter(([, s]) => s.photo_id !== null)
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

  async function handleSlotAssign(
    slot: 1 | 2,
    photo: PhotoForEditor | null
  ) {
    const photoId = photo?.id ?? null;
    const imageUrl = photo?.illustrationUrl ?? null;

    setSlots((prev) => ({
      ...prev,
      [slot]: { photo_id: photoId, image_url: imageUrl, crop_x: 0, crop_y: 0, scale: 1 },
    }));

    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, photoId, crop_x: 0, crop_y: 0, scale: 1 }),
    });
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

    const currentSlot = slots[slot];
    if (!currentSlot?.photo_id) return;

    await fetch(`/api/admin/orders/${orderId}/pages/${page.id}/images`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, crop_x, crop_y, scale }),
    });
    onSaved();
  }

  const activeSlots = LAYOUT_SLOTS[layoutType] ?? [];
  const previewPage = buildPreviewPage();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6 pt-1">
      {/* Live mini-preview */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">
          תצוגה מקדימה — עמוד {page.page_number}
        </p>
        <div className="w-full max-w-[180px]">
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
                onAssign={(photo) => handleSlotAssign(slotNum as 1 | 2, photo)}
                onCropSave={(crop_x, crop_y, scale) =>
                  handleCropSave(slotNum as 1 | 2, crop_x, crop_y, scale)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ImageSlotEditor ──────────────────────────────────────────────────────────

function ImageSlotEditor({
  slot,
  slotState,
  completedPhotos,
  onAssign,
  onCropSave,
}: {
  slot: 1 | 2;
  slotState: SlotState | null;
  completedPhotos: PhotoForEditor[];
  onAssign: (photo: PhotoForEditor | null) => void;
  onCropSave: (crop_x: number, crop_y: number, scale: number) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [cropX, setCropX] = useState(slotState?.crop_x ?? 0);
  const [cropY, setCropY] = useState(slotState?.crop_y ?? 0);
  const [scale, setScale] = useState(slotState?.scale ?? 1);

  const frameRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragOriginRef = useRef({ px: 0, py: 0, cx: 0, cy: 0 });
  const latestCropRef = useRef({ crop_x: cropX, crop_y: cropY });

  const imageUrl = slotState?.image_url ?? null;
  const hasImage = Boolean(imageUrl);

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

  const slotLabel = slot === 1 ? "איור 1 (ראשי)" : "איור 2 (משני)";
  const s = Math.max(1, scale);

  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium">{slotLabel}</p>
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
            className="relative aspect-square w-32 overflow-hidden rounded-lg border border-border bg-muted"
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
              <div className="absolute inset-0 flex items-end justify-center pb-1 pointer-events-none">
                <span className="text-white/60 text-[9px] bg-black/30 rounded px-1">
                  גרור להזזה
                </span>
              </div>
            )}
          </div>

          {/* Zoom slider */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground w-10 shrink-0">
              זום {scale.toFixed(1)}×
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={scale}
              onChange={(e) => handleScaleChange(Number(e.target.value))}
              className="flex-1 h-1 appearance-none bg-border rounded accent-primary"
            />
          </div>

          {/* Change photo button */}
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            {showPicker ? "סגור בחירה" : "החלף תמונה"}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowPicker((v) => !v)}
          className="w-full rounded-lg border-2 border-dashed border-border hover:border-primary/40 aspect-video flex items-center justify-center text-xs text-muted-foreground transition-colors"
        >
          {showPicker ? "סגור ▲" : "+ בחר איור"}
        </button>
      )}

      {/* Photo picker */}
      {showPicker && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground">
            {completedPhotos.length === 0
              ? "אין איורים מוכנים"
              : "בחר איור מהרשימה:"}
          </p>
          {completedPhotos.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto">
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
                    className={`relative rounded-md overflow-hidden aspect-square border-2 transition-all hover:scale-[1.04] ${
                      isSelected
                        ? "border-primary"
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
                      <div className="w-full h-full bg-muted" />
                    )}
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">✓</span>
                      </div>
                    )}
                    {photo.life_stage && (
                      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[8px] text-center py-0.5 truncate">
                        {LIFE_STAGE_LABELS[photo.life_stage] ?? photo.life_stage}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
