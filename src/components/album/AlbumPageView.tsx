import type { LayoutType, PageImageSlot, PreviewPage } from "@/types/page";

interface AlbumPageViewProps {
  page: PreviewPage;
  personName: string;
}

export function AlbumPageView({ page, personName }: AlbumPageViewProps) {
  switch (page.page_type) {
    case "cover":
      return <CoverPage page={page} personName={personName} />;
    case "dedication":
      return <DedicationPage page={page} />;
    case "back_cover":
      return <BackCoverPage page={page} />;
    case "text_only":
      return <TextOnlyPage page={page} />;
    case "illustration_and_text":
    default:
      return <ContentPage page={page} />;
  }
}

// ─── Shared page shell ─────────────────────────────────────────────────────────

/** Every album page is a perfect 1:1 square — mirrors a real 25×25 cm album page. */
function PageShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-square w-full overflow-hidden shadow-md ${className}`}
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

/** Resolve a slot's image URL + crop params, falling back to legacy image_url for slot 1. */
function resolveSlot(
  page: PreviewPage,
  slot: 1 | 2
): { url: string | null; crop: CropParams } {
  const slotData = (page.images ?? []).find((i) => i.slot === slot);
  if (slotData) {
    return {
      url: slotData.image_url,
      crop: {
        crop_x: slotData.crop_x,
        crop_y: slotData.crop_y,
        scale: slotData.scale,
      },
    };
  }
  // Legacy fallback: use pages.illustration_storage_path URL for slot 1 only
  if (slot === 1) {
    return { url: page.image_url, crop: { crop_x: 0, crop_y: 0, scale: 1 } };
  }
  return { url: null, crop: { crop_x: 0, crop_y: 0, scale: 1 } };
}

// ─── Cover ────────────────────────────────────────────────────────────────────

function CoverPage({
  page,
  personName,
}: {
  page: PreviewPage;
  personName: string;
}) {
  return (
    <PageShell className="bg-secondary">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/18" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center p-8">
        <div className="border-2 border-primary/20 rounded-xl p-6 w-full max-w-[80%]">
          <Ornament className="mb-5" size="lg" />
          <p className="text-[0.6rem] uppercase tracking-[0.22em] text-primary/60 mb-4 font-semibold">
            סיפור חיים בחרוזים
          </p>
          <h1 className="text-3xl font-semibold text-foreground leading-tight">
            {personName}
          </h1>
          {page.text_content && (
            <p
              className="mt-4 text-xs text-muted-foreground italic leading-relaxed"
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

function DedicationPage({ page }: { page: PreviewPage }) {
  return (
    <PageShell className="bg-secondary/50 border border-border/40">
      <div className="flex h-full flex-col items-center justify-center text-center p-10">
        <Ornament className="mb-6" />
        {page.text_content ? (
          <p
            className="leading-loose text-muted-foreground italic whitespace-pre-line max-w-[260px]"
            style={{ fontFamily: "YardenAlbum, serif", fontSize: "18px" }}
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

function ContentPage({ page }: { page: PreviewPage }) {
  const layout: LayoutType = page.layout_type ?? "FULL_IMAGE";
  const slot1 = resolveSlot(page, 1);
  const slot2 = resolveSlot(page, 2);

  switch (layout) {
    case "TEXT_ONLY":
      return (
        <PageShell className="bg-card border border-border/60">
          <TextCenter content={page.text_content} />
          <PageNumber number={page.page_number} />
        </PageShell>
      );

    case "IMAGE_TOP_TEXT_BOTTOM":
      return (
        <PageShell className="bg-card border border-border/60">
          <div className="flex flex-col h-full">
            <div className="relative h-[60%]">
              <ImageFill url={slot1.url} crop={slot1.crop} />
            </div>
            <div className="flex items-center justify-center flex-1 px-5 py-4">
              <AlbumTextBlock content={page.text_content} />
            </div>
          </div>
          <PageNumber number={page.page_number} />
        </PageShell>
      );

    case "TEXT_TOP_IMAGE_BOTTOM":
      return (
        <PageShell className="bg-card border border-border/60">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-center h-[40%] px-5 py-4">
              <AlbumTextBlock content={page.text_content} />
            </div>
            <div className="relative flex-1">
              <ImageFill url={slot1.url} crop={slot1.crop} />
            </div>
          </div>
          <PageNumber number={page.page_number} />
        </PageShell>
      );

    case "IMAGE_LEFT_TEXT_RIGHT":
      return (
        <PageShell className="bg-card border border-border/60">
          {/* Force LTR so "left" is always physical-left regardless of page dir */}
          <div className="flex h-full" style={{ direction: "ltr" }}>
            <div className="relative w-[55%]">
              <ImageFill url={slot1.url} crop={slot1.crop} />
            </div>
            <div className="flex items-center justify-center flex-1 px-4 py-4">
              <AlbumTextBlock content={page.text_content} />
            </div>
          </div>
          <PageNumber number={page.page_number} />
        </PageShell>
      );

    case "TWO_IMAGES":
      return (
        <PageShell className="bg-card border border-border/60">
          <div className="flex h-full" style={{ direction: "ltr" }}>
            <div className="relative w-1/2">
              <ImageFill url={slot1.url} crop={slot1.crop} />
            </div>
            <div className="relative w-1/2">
              <ImageFill url={slot2.url} crop={slot2.crop} />
            </div>
          </div>
          {/* Optional caption at bottom */}
          {page.text_content && (
            <div
              className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-center px-3 py-1"
              style={{
                fontFamily: "YardenAlbum, serif",
                fontSize: "12px",
                textShadow: "0 1px 2px rgba(0,0,0,0.8)",
              }}
            >
              {page.text_content}
            </div>
          )}
          <PageNumber number={page.page_number} light />
        </PageShell>
      );

    case "FULL_IMAGE":
    default:
      return (
        <PageShell className="bg-secondary">
          <ImageFill url={slot1.url} crop={slot1.crop} />
          {page.text_content && <TextOverlay text={page.text_content} />}
          <PageNumber number={page.page_number} light />
        </PageShell>
      );
  }
}

// ─── Text only page type ──────────────────────────────────────────────────────

function TextOnlyPage({ page }: { page: PreviewPage }) {
  return (
    <PageShell className="bg-card border border-border/60">
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

function BackCoverPage({ page }: { page: PreviewPage }) {
  return (
    <PageShell className="bg-secondary">
      <div className="absolute inset-0 bg-gradient-to-tl from-primary/10 via-transparent to-primary/16" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center p-8 gap-5">
        <Ornament size="lg" />
        {page.text_content && (
          <p
            className="leading-loose text-muted-foreground italic max-w-[240px] whitespace-pre-line"
            style={{ fontFamily: "YardenAlbum, serif", fontSize: "18px" }}
          >
            {page.text_content}
          </p>
        )}
        <div className="mt-2 pt-4 border-t border-primary/20 w-24 flex flex-col items-center gap-1">
          <span className="text-sm font-semibold text-primary tracking-wide">
            Vitae Studio
          </span>
          <span className="text-[0.6rem] text-muted-foreground">
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
 */
function ImageFill({
  url,
  crop,
}: {
  url: string | null;
  crop: CropParams;
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
  const s = Math.max(1, scale);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          width: `${s * 100}%`,
          height: `${s * 100}%`,
          // Pan: offset is fraction of the extra space (scale-1) × container size
          left: `${-crop_x * (s - 1) * 100}%`,
          top: `${-crop_y * (s - 1) * 100}%`,
          objectFit: "cover",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/** Gradient text overlay at bottom — no opaque background box. */
function TextOverlay({ text }: { text: string }) {
  return (
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/72 via-black/40 to-transparent px-5 pb-6 pt-16">
      <p
        className="text-white text-center leading-relaxed whitespace-pre-line"
        style={{
          fontFamily: "YardenAlbum, serif",
          fontSize: "15px",
          textShadow: "0 1px 4px rgba(0,0,0,0.6)",
        }}
      >
        {text}
      </p>
    </div>
  );
}

/** Centered text block used in split layouts. */
function AlbumTextBlock({ content }: { content: string | null }) {
  if (!content)
    return <PlaceholderText label="הטקסט יווצר בקרוב" />;
  return (
    <p
      className="text-foreground text-center leading-relaxed whitespace-pre-line"
      style={{ fontFamily: "YardenAlbum, serif", fontSize: "15px" }}
    >
      {content}
    </p>
  );
}

/** Text-only centered layout (for TEXT_ONLY layout type on content pages). */
function TextCenter({ content }: { content: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-10">
      <Ornament className="mb-7" />
      {content ? (
        <p
          className="leading-loose text-foreground text-center whitespace-pre-line"
          style={{ fontFamily: "YardenAlbum, serif", fontSize: "18px" }}
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
