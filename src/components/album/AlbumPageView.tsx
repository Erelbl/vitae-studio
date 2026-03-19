import type { LayoutType, PageImageSlot, PreviewPage, TextAlign, TextColor, TextSize } from "@/types/page";

interface AlbumPageViewProps {
  page: PreviewPage;
  personName: string;
  /** When true, removes overflow:hidden so an image can bleed across the spread gutter. */
  editMode?: boolean;
}

export function AlbumPageView({ page, personName, editMode = false }: AlbumPageViewProps) {
  switch (page.page_type) {
    case "cover":
      return <CoverPage page={page} personName={personName} editMode={editMode} />;
    case "dedication":
      return <DedicationPage page={page} editMode={editMode} />;
    case "back_cover":
      return <BackCoverPage page={page} editMode={editMode} />;
    case "text_only":
      return <TextOnlyPage page={page} />;
    case "illustration_and_text":
    default:
      return <ContentPage page={page} editMode={editMode} />;
  }
}

// ─── Shared page shell ─────────────────────────────────────────────────────────

/** Every album page is a perfect 1:1 square — mirrors a real 25×25 cm album page. */
function PageShell({
  children,
  className = "",
  editMode = false,
}: {
  children: React.ReactNode;
  className?: string;
  editMode?: boolean;
}) {
  return (
    <div
      className={`relative aspect-square w-full shadow-md ${editMode ? "" : "overflow-hidden"} ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Helpers for resolving slot images ────────────────────────────────────────

interface CropParams {
  crop_x: number;
  crop_y: number;
  scale: number;
}

// ─── Frame style SVG mask presets ─────────────────────────────────────────────
// Applied to the image container div when frame_style is set on a slot.
// Uses CSS mask-image with an inline SVG containing cubic-bezier paths for
// organic torn-paper edges. Far more natural than CSS clip-path polygons.

const svgMask = (d: string) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cpath d='${d}' fill='white'/%3E%3C/svg%3E")`;

const FRAME_MASKS: Record<string, string> = {
  // Tear along the top edge; rest of image is fully visible
  torn_top: svgMask(
    "M0,100 L100,100 L100,10 C93,5 87,14 80,8 C73,2 67,13 60,6 C53,1 47,12 40,5 C33,0 27,11 20,4 C13,1 7,13 0,6 Z"
  ),
  // Tear along the bottom edge
  torn_bottom: svgMask(
    "M0,0 L100,0 L100,90 C93,95 87,86 80,92 C73,98 67,87 60,94 C53,99 47,88 40,95 C33,100 27,89 20,96 C13,99 7,87 0,94 Z"
  ),
  // Tear along the left edge
  torn_left: svgMask(
    "M100,0 L100,100 L10,100 C5,93 14,87 8,80 C2,73 13,67 6,60 C1,53 12,47 5,40 C0,33 11,27 4,20 C1,13 13,7 6,0 Z"
  ),
  // Tear along the right edge
  torn_right: svgMask(
    "M0,0 L0,100 L90,100 C95,93 86,87 92,80 C98,73 87,67 94,60 C99,53 88,47 95,40 C100,33 89,27 96,20 C99,13 87,7 94,0 Z"
  ),
};

/** Resolve a slot's image URL + crop params + frame style, falling back to legacy image_url for slot 1. */
function resolveSlot(
  page: PreviewPage,
  slot: 1 | 2
): { url: string | null; crop: CropParams; frameStyle: string | null } {
  const slotData = (page.images ?? []).find((i) => i.slot === slot);
  if (slotData) {
    // Legacy compatibility: old DB rows stored (0, 0) as "no crop" before the centered model.
    // In the new model (0, 0) would place the image at top-left corner, not centered.
    const isLegacyZero = slotData.crop_x === 0 && slotData.crop_y === 0;
    return {
      url: slotData.image_url,
      crop: {
        crop_x: isLegacyZero ? 0.5 : slotData.crop_x,
        crop_y: isLegacyZero ? 0.5 : slotData.crop_y,
        scale: slotData.scale,
      },
      frameStyle: slotData.frame_style ?? null,
    };
  }
  // Legacy fallback: use pages.illustration_storage_path URL for slot 1 only
  if (slot === 1) {
    return { url: page.image_url, crop: { crop_x: 0.5, crop_y: 0.5, scale: 1 }, frameStyle: null };
  }
  return { url: null, crop: { crop_x: 0.5, crop_y: 0.5, scale: 1 }, frameStyle: null };
}

// ─── Cover ────────────────────────────────────────────────────────────────────

function CoverPage({
  page,
  personName,
  editMode,
}: {
  page: PreviewPage;
  personName: string;
  editMode?: boolean;
}) {
  const slot1 = resolveSlot(page, 1);
  return (
    <PageShell className="bg-secondary" editMode={editMode}>
      {/* Optional manually-uploaded background image */}
      {slot1.url && <ImageFill url={slot1.url} crop={slot1.crop} frameStyle={slot1.frameStyle} editMode={editMode} />}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/18" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center p-8">
        <div className={`border-2 border-primary/20 rounded-xl p-6 w-full max-w-[80%] ${slot1.url ? "bg-black/40 backdrop-blur-sm" : ""}`}>
          <Ornament className="mb-5" size="lg" />
          <p className={`text-[0.6rem] uppercase tracking-[0.22em] mb-4 font-semibold ${slot1.url ? "text-white/70" : "text-primary/60"}`}>
            סיפור חיים בחרוזים
          </p>
          <h1 className={`text-3xl font-semibold leading-tight ${slot1.url ? "text-white" : "text-foreground"}`}>
            {personName}
          </h1>
          {page.text_content && (
            <p
              className={`mt-4 text-xs italic leading-relaxed ${slot1.url ? "text-white/80" : "text-muted-foreground"}`}
              style={{ fontFamily: "YardenAlbum, serif" }}
            >
              {page.text_content}
            </p>
          )}
          <Ornament className="mt-5" />
        </div>
      </div>
      <PageNumber number={page.page_number} light />
    </PageShell>
  );
}

// ─── Dedication ───────────────────────────────────────────────────────────────

function DedicationPage({ page, editMode }: { page: PreviewPage; editMode?: boolean }) {
  const slot1 = resolveSlot(page, 1);
  return (
    <PageShell className="bg-secondary/50 border border-border/40" editMode={editMode}>
      {/* Optional manually-uploaded background image */}
      {slot1.url && <ImageFill url={slot1.url} crop={slot1.crop} frameStyle={slot1.frameStyle} editMode={editMode} />}
      <div className={`flex h-full flex-col items-center justify-center text-center p-10 relative z-10`}>
        <Ornament className="mb-6" />
        {page.text_content ? (
          <p
            className={`leading-loose italic whitespace-pre-line max-w-[260px] ${slot1.url ? "text-white" : "text-muted-foreground"}`}
            style={{ fontFamily: "YardenAlbum, serif", fontSize: "18px", textShadow: slot1.url ? "0 1px 3px rgba(0,0,0,0.7)" : undefined }}
          >
            {page.text_content}
          </p>
        ) : (
          <PlaceholderText label="ההקדשה תופיע כאן" />
        )}
        <Ornament className="mt-6" />
      </div>
      <PageNumber number={page.page_number} />
    </PageShell>
  );
}

// ─── Content (illustration + text) — layout-aware ────────────────────────────

function ContentPage({ page, editMode }: { page: PreviewPage; editMode?: boolean }) {
  const layout: LayoutType = page.layout_type ?? "FULL_IMAGE";
  const slot1 = resolveSlot(page, 1);
  const slot2 = resolveSlot(page, 2);
  // Short aliases used at call sites below
  const fs1 = slot1.frameStyle;
  const fs2 = slot2.frameStyle;
  const ts = page.text_size;
  const fspx = page.font_size_px ?? null;
  const align = (page.text_align ?? "center") as TextAlign;
  const tx = page.text_x ?? null;
  const ty = page.text_y ?? null;
  const tc = (page.text_color ?? null) as TextColor | null;

  switch (layout) {
    case "TEXT_ONLY":
      return (
        <PageShell className="bg-card border border-border/60" editMode={editMode}>
          <TextCenter content={page.text_content} textSize={ts} fontSizePx={fspx} textAlign={align} textColor={tc} />
          <PageNumber number={page.page_number} />
        </PageShell>
      );

    case "IMAGE_TOP_TEXT_BOTTOM":
      return (
        <PageShell className="bg-card border border-border/60" editMode={editMode}>
          <div className="flex flex-col h-full">
            <div className="relative h-[60%]">
              <ImageFill url={slot1.url} crop={slot1.crop} frameStyle={fs1} />
            </div>
            <div className="flex items-center justify-center flex-1 px-5 py-4">
              <AlbumTextBlock content={page.text_content} textSize={ts} fontSizePx={fspx} textAlign={align} textColor={tc} />
            </div>
          </div>
          <PageNumber number={page.page_number} />
        </PageShell>
      );

    case "TEXT_TOP_IMAGE_BOTTOM":
      return (
        <PageShell className="bg-card border border-border/60" editMode={editMode}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-center h-[40%] px-5 py-4">
              <AlbumTextBlock content={page.text_content} textSize={ts} fontSizePx={fspx} textAlign={align} textColor={tc} />
            </div>
            <div className="relative flex-1">
              <ImageFill url={slot1.url} crop={slot1.crop} frameStyle={fs1} />
            </div>
          </div>
          <PageNumber number={page.page_number} />
        </PageShell>
      );

    case "IMAGE_LEFT_TEXT_RIGHT":
      return (
        <PageShell className="bg-card border border-border/60" editMode={editMode}>
          {/* Force LTR so "left" is always physical-left regardless of page dir */}
          <div className="flex h-full" style={{ direction: "ltr" }}>
            <div className="relative w-[55%]">
              <ImageFill url={slot1.url} crop={slot1.crop} frameStyle={fs1} />
            </div>
            <div className="flex items-center justify-center flex-1 px-4 py-4">
              <AlbumTextBlock content={page.text_content} textSize={ts} fontSizePx={fspx} textAlign={align} textColor={tc} />
            </div>
          </div>
          <PageNumber number={page.page_number} />
        </PageShell>
      );

    case "IMAGE_RIGHT_TEXT_LEFT":
      return (
        <PageShell className="bg-card border border-border/60" editMode={editMode}>
          <div className="flex h-full" style={{ direction: "ltr" }}>
            <div className="flex items-center justify-center flex-1 px-4 py-4">
              <AlbumTextBlock content={page.text_content} textSize={ts} fontSizePx={fspx} textAlign={align} textColor={tc} />
            </div>
            <div className="relative w-[55%]">
              <ImageFill url={slot1.url} crop={slot1.crop} frameStyle={fs1} />
            </div>
          </div>
          <PageNumber number={page.page_number} />
        </PageShell>
      );

    case "TWO_IMAGES":
      return (
        <PageShell className="bg-card border border-border/60" editMode={editMode}>
          <div className="flex h-full" style={{ direction: "ltr" }}>
            <div className="relative w-1/2">
              <ImageFill url={slot1.url} crop={slot1.crop} frameStyle={fs1} />
            </div>
            <div className="relative w-1/2">
              <ImageFill url={slot2.url} crop={slot2.crop} frameStyle={fs2} />
            </div>
          </div>
          {/* Optional caption at bottom */}
          {page.text_content && (
            <div
              className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-1"
              style={{
                fontFamily: "YardenAlbum, serif",
                fontSize: resolveTextSize(ts, fspx),
                color: tc === "black" ? "#1a1a1a" : "white",
                textShadow: tc === "black" ? "0 1px 2px rgba(255,255,255,0.6)" : "0 1px 2px rgba(0,0,0,0.8)",
                textAlign: align,
              }}
            >
              {page.text_content}
            </div>
          )}
          <PageNumber number={page.page_number} light />
        </PageShell>
      );

    case "FULL_IMAGE_TEXT_TOP":
      return (
        <PageShell className="bg-secondary" editMode={editMode}>
          <ImageFill url={slot1.url} crop={slot1.crop} frameStyle={fs1} editMode={editMode} />
          {page.text_content && (
            <TextOverlayTop
              text={page.text_content}
              textSize={ts}
              fontSizePx={fspx}
              textAlign={align}
              textX={tx}
              textY={ty}
              textColor={tc}
            />
          )}
          <PageNumber number={page.page_number} light />
        </PageShell>
      );

    case "FULL_IMAGE_TEXT_CENTER":
      return (
        <PageShell className="bg-secondary" editMode={editMode}>
          <ImageFill url={slot1.url} crop={slot1.crop} frameStyle={fs1} editMode={editMode} />
          {page.text_content && (
            <TextOverlayCenter
              text={page.text_content}
              textSize={ts}
              fontSizePx={fspx}
              textAlign={align}
              textX={tx}
              textY={ty}
              textColor={tc}
            />
          )}
          <PageNumber number={page.page_number} light />
        </PageShell>
      );

    case "FULL_IMAGE":
    default:
      return (
        <PageShell className="bg-secondary" editMode={editMode}>
          <ImageFill url={slot1.url} crop={slot1.crop} frameStyle={fs1} editMode={editMode} />
          {page.text_content && (
            <TextOverlay
              text={page.text_content}
              textSize={ts}
              fontSizePx={fspx}
              textAlign={align}
              textX={tx}
              textY={ty}
              textColor={tc}
            />
          )}
          <PageNumber number={page.page_number} light />
        </PageShell>
      );
  }
}

// ─── Text only page type ──────────────────────────────────────────────────────

function TextOnlyPage({ page, editMode }: { page: PreviewPage; editMode?: boolean }) {
  return (
    <PageShell className="bg-card border border-border/60" editMode={editMode}>
      <div className="flex h-full flex-col items-center justify-center p-10">
        <Ornament className="mb-7" />
        {page.text_content ? (
          <p
            className="leading-loose text-foreground text-center whitespace-pre-line"
            style={{ fontFamily: "YardenAlbum, serif", fontSize: "18px" }}
          >
            {page.text_content}
          </p>
        ) : (
          <PlaceholderText label="הטקסט יווצר בקרוב" />
        )}
        <Ornament className="mt-7" />
      </div>
      <PageNumber number={page.page_number} />
    </PageShell>
  );
}

// ─── Back cover ───────────────────────────────────────────────────────────────

function BackCoverPage({ page, editMode }: { page: PreviewPage; editMode?: boolean }) {
  const slot1 = resolveSlot(page, 1);
  return (
    <PageShell className="bg-secondary" editMode={editMode}>
      {/* Optional manually-uploaded background image */}
      {slot1.url && <ImageFill url={slot1.url} crop={slot1.crop} frameStyle={slot1.frameStyle} editMode={editMode} />}
      <div className="absolute inset-0 bg-gradient-to-tl from-primary/10 via-transparent to-primary/16" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center p-8 gap-5">
        <Ornament size="lg" />
        {page.text_content && (
          <p
            className={`leading-loose italic max-w-[240px] whitespace-pre-line ${slot1.url ? "text-white" : "text-muted-foreground"}`}
            style={{ fontFamily: "YardenAlbum, serif", fontSize: "18px", textShadow: slot1.url ? "0 1px 3px rgba(0,0,0,0.7)" : undefined }}
          >
            {page.text_content}
          </p>
        )}
        <div className="mt-2 pt-4 border-t border-primary/20 w-24 flex flex-col items-center gap-1">
          <span className={`text-sm font-semibold tracking-wide ${slot1.url ? "text-white" : "text-primary"}`}>
            Vitae Studio
          </span>
          <span className={`text-[0.6rem] ${slot1.url ? "text-white/70" : "text-muted-foreground"}`}>
            סיפור חיים בחרוזים
          </span>
        </div>
      </div>
      <PageNumber number={page.page_number} light />
    </PageShell>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

/**
 * Full-bleed image with crop/zoom applied via CSS positioning.
 *
 * Model:
 *   scale ≥ 1  → the image is rendered at scale × 100% of the container
 *   crop_x 0-1 → horizontal pan (0 = left edge visible, 1 = right edge visible)
 *   crop_y 0-1 → vertical pan   (0 = top  edge visible, 1 = bottom edge visible)
 *
 * When scale = 1, the image fills the container and crop has no effect.
 * frameStyle applies a CSS clip-path preset to the container for decorative torn-paper edges.
 */
function ImageFill({
  url,
  crop,
  frameStyle,
  editMode = false,
}: {
  url: string | null;
  crop: CropParams;
  frameStyle?: string | null;
  /** When true, removes overflow:hidden so the image can bleed across the spread gutter. */
  editMode?: boolean;
}) {
  if (!url) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-secondary via-secondary/80 to-primary/10">
        <span className="text-primary/25 text-3xl select-none">✦</span>
        <p className="text-xs text-muted-foreground/40">האיור יווצר בקרוב</p>
      </div>
    );
  }

  const { crop_x, crop_y, scale } = crop;
  const s = Math.max(0.1, scale);
  const maskUrl = frameStyle ? (FRAME_MASKS[frameStyle] ?? undefined) : undefined;
  const maskStyle = maskUrl
    ? { maskImage: maskUrl, maskSize: "100% 100%" }
    : undefined;

  // Centered-position model:
  //   crop_x, crop_y = center of the image as a fraction of the container (default 0.5)
  //   scale          = image size as a fraction of the container (1 = fills container)
  // Formula: left = (crop_x - scale/2) × 100%, top = (crop_y - scale/2) × 100%
  // This allows the image to be freely positioned and sized, including cross-spread overflow.

  return (
    <div
      className={`absolute inset-0 ${editMode ? "" : "overflow-hidden"}`}
      style={maskStyle}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        style={{
          position: "absolute",
          width: `${s * 100}%`,
          height: `${s * 100}%`,
          maxWidth: "none",    // Override Tailwind preflight max-width:100% which caps zoom
          left: `${(crop_x - s / 2) * 100}%`,
          top: `${(crop_y - s / 2) * 100}%`,
          objectFit: "cover",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ─── Text-size helper ─────────────────────────────────────────────────────────

/**
 * Resolve the final CSS font-size string.
 * fontSizePx (numeric, from migration 00028) takes priority over the legacy enum.
 */
function resolveTextSize(textSize?: TextSize | null, fontSizePx?: number | null): string {
  if (fontSizePx != null && fontSizePx > 0) return `${fontSizePx}px`;
  switch (textSize) {
    case "sm": return "12px";
    case "lg": return "18px";
    case "xl": return "22px";
    case "md":
    default:   return "15px";
  }
}

// ─── Free-position text (no background) ──────────────────────────────────────

/**
 * Renders text at an absolute position (0–1 coords) without any background/gradient.
 * Used when the admin has dragged the text to a custom position.
 */
function PositionedText({
  text,
  fontSize,
  textAlign,
  textColor,
}: {
  text: string;
  fontSize: string;
  textAlign: TextAlign;
  textColor?: TextColor | null;
}) {
  const color = textColor === "black" ? "#1a1a1a" : "white";
  const shadow = textColor === "black"
    ? "0 1px 3px rgba(255,255,255,0.9), 0 2px 8px rgba(255,255,255,0.6)"
    : "0 1px 6px rgba(0,0,0,0.95), 0 2px 12px rgba(0,0,0,0.8)";
  return (
    <p
      style={{
        fontFamily: "YardenAlbum, serif",
        fontSize,
        textAlign,
        color,
        textShadow: shadow,
        whiteSpace: "pre-line",
        lineHeight: 1.6,
        maxWidth: "84%",
      }}
    >
      {text}
    </p>
  );
}

// ─── Overlay text components ──────────────────────────────────────────────────

interface OverlayTextProps {
  text: string;
  textSize?: TextSize | null;
  fontSizePx?: number | null;
  textAlign?: TextAlign;
  textX?: number | null;
  textY?: number | null;
  textColor?: TextColor | null;
}

/** Gradient text overlay at bottom — no opaque background box. */
function TextOverlay({ text, textSize, fontSizePx, textAlign, textX, textY, textColor }: OverlayTextProps) {
  const fontSize = resolveTextSize(textSize, fontSizePx);
  const align = textAlign ?? "center";
  const color = textColor === "black" ? "#1a1a1a" : "white";
  const shadow = textColor === "black"
    ? "0 1px 2px rgba(255,255,255,0.7)"
    : "0 1px 4px rgba(0,0,0,0.6)";

  if (textX != null && textY != null) {
    return (
      <div
        className="absolute inset-0 pointer-events-none flex items-center justify-center"
        style={{ zIndex: 10 }}
      >
        <div
          style={{
            position: "absolute",
            left: `${textX * 100}%`,
            top: `${textY * 100}%`,
            transform: "translate(-50%, -50%)",
            width: "84%",
            textAlign: align,
          }}
        >
          <PositionedText text={text} fontSize={fontSize} textAlign={align} textColor={textColor} />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/72 via-black/40 to-transparent px-5 pb-6 pt-16" style={{ zIndex: 10 }}>
      <p
        className="leading-relaxed whitespace-pre-line"
        style={{
          fontFamily: "YardenAlbum, serif",
          fontSize,
          textAlign: align,
          color,
          textShadow: shadow,
        }}
      >
        {text}
      </p>
    </div>
  );
}

/** Gradient text overlay at top. */
function TextOverlayTop({ text, textSize, fontSizePx, textAlign, textX, textY, textColor }: OverlayTextProps) {
  const fontSize = resolveTextSize(textSize, fontSizePx);
  const align = textAlign ?? "center";
  const color = textColor === "black" ? "#1a1a1a" : "white";
  const shadow = textColor === "black"
    ? "0 1px 2px rgba(255,255,255,0.7)"
    : "0 1px 4px rgba(0,0,0,0.6)";

  if (textX != null && textY != null) {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 10 }}
      >
        <div
          style={{
            position: "absolute",
            left: `${textX * 100}%`,
            top: `${textY * 100}%`,
            transform: "translate(-50%, -50%)",
            width: "84%",
            textAlign: align,
          }}
        >
          <PositionedText text={text} fontSize={fontSize} textAlign={align} textColor={textColor} />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/72 via-black/40 to-transparent px-5 pt-6 pb-16" style={{ zIndex: 10 }}>
      <p
        className="leading-relaxed whitespace-pre-line"
        style={{
          fontFamily: "YardenAlbum, serif",
          fontSize,
          textAlign: align,
          color,
          textShadow: shadow,
        }}
      >
        {text}
      </p>
    </div>
  );
}

/** Centered text overlay with a frosted-glass pill — elegant for long verses. */
function TextOverlayCenter({ text, textSize, fontSizePx, textAlign, textX, textY, textColor }: OverlayTextProps) {
  const fontSize = resolveTextSize(textSize, fontSizePx);
  const align = textAlign ?? "center";
  const color = textColor === "black" ? "#1a1a1a" : "white";
  const shadow = textColor === "black"
    ? "0 1px 2px rgba(255,255,255,0.7)"
    : "0 1px 4px rgba(0,0,0,0.8)";

  if (textX != null && textY != null) {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 10 }}
      >
        <div
          style={{
            position: "absolute",
            left: `${textX * 100}%`,
            top: `${textY * 100}%`,
            transform: "translate(-50%, -50%)",
            width: "84%",
            textAlign: align,
          }}
        >
          <PositionedText text={text} fontSize={fontSize} textAlign={align} textColor={textColor} />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none" style={{ zIndex: 10 }}>
      <div
        className="rounded-2xl px-5 py-4 max-w-[86%]"
        style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", textAlign: align }}
      >
        <p
          className="leading-relaxed whitespace-pre-line"
          style={{
            fontFamily: "YardenAlbum, serif",
            fontSize,
            color,
            textShadow: shadow,
          }}
        >
          {text}
        </p>
      </div>
    </div>
  );
}

/** Centered text block used in split layouts. */
function AlbumTextBlock({
  content,
  textSize,
  fontSizePx,
  textAlign,
  textColor,
}: {
  content: string | null;
  textSize?: TextSize | null;
  fontSizePx?: number | null;
  textAlign?: TextAlign;
  textColor?: TextColor | null;
}) {
  if (!content)
    return <PlaceholderText label="הטקסט יווצר בקרוב" />;
  const color = textColor === "white" ? "white" : textColor === "black" ? "#1a1a1a" : undefined;
  return (
    <p
      className={color ? "" : "text-foreground"}
      style={{
        fontFamily: "YardenAlbum, serif",
        fontSize: resolveTextSize(textSize, fontSizePx),
        textAlign: textAlign ?? "center",
        lineHeight: 1.6,
        whiteSpace: "pre-line",
        ...(color ? { color } : {}),
      }}
    >
      {content}
    </p>
  );
}

/** Text-only centered layout (for TEXT_ONLY layout type on content pages). */
function TextCenter({
  content,
  textSize,
  fontSizePx,
  textAlign,
  textColor,
}: {
  content: string | null;
  textSize?: TextSize | null;
  fontSizePx?: number | null;
  textAlign?: TextAlign;
  textColor?: TextColor | null;
}) {
  const color = textColor === "white" ? "white" : textColor === "black" ? "#1a1a1a" : undefined;
  return (
    <div className="flex h-full flex-col items-center justify-center p-10">
      <Ornament className="mb-7" />
      {content ? (
        <p
          className={color ? "" : "text-foreground"}
          style={{
            fontFamily: "YardenAlbum, serif",
            fontSize: resolveTextSize(textSize ?? "lg", fontSizePx),
            textAlign: textAlign ?? "center",
            lineHeight: 1.6,
            whiteSpace: "pre-line",
            ...(color ? { color } : {}),
          }}
        >
          {content}
        </p>
      ) : (
        <PlaceholderText label="הטקסט יווצר בקרוב" />
      )}
      <Ornament className="mt-7" />
    </div>
  );
}

function PageNumber({
  number,
  light,
}: {
  number: number;
  light?: boolean;
}) {
  return (
    <div
      className={`absolute bottom-2 start-3 text-[10px] select-none ${
        light ? "text-white/40" : "text-muted-foreground/35"
      }`}
    >
      {number}
    </div>
  );
}

function Ornament({
  className = "",
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "lg";
}) {
  return (
    <div
      className={`text-primary/35 select-none ${
        size === "lg" ? "text-xl" : "text-base"
      } ${className}`}
    >
      ✦
    </div>
  );
}

function PlaceholderText({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground/40 italic">{label}</p>;
}

// Export types for AlbumPageEditor to build local PreviewPage objects
export type { PageImageSlot };
