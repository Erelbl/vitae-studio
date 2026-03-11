import type { PreviewPage } from "@/types/page";

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

// ─── Cover ───────────────────────────────────────────────────────────────────

function CoverPage({
  page,
  personName,
}: {
  page: PreviewPage;
  personName: string;
}) {
  return (
    <div className="relative min-h-[500px] sm:min-h-[580px] rounded-2xl overflow-hidden bg-secondary flex flex-col items-center justify-center text-center p-8 shadow-md">
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-primary/14 pointer-events-none" />

      {/* Ornamental inner border */}
      <div className="relative z-10 border-2 border-primary/20 rounded-xl p-8 sm:p-12 w-full max-w-xs">
        <Ornament className="mb-6" size="lg" />

        <p className="text-[0.65rem] uppercase tracking-[0.22em] text-primary/60 mb-5 font-semibold">
          סיפור חיים בחרוזים
        </p>

        <h1 className="text-4xl sm:text-5xl font-semibold text-foreground leading-tight">
          {personName}
        </h1>

        {page.text_content && (
          <p
            className="mt-5 text-sm text-muted-foreground italic leading-relaxed"
            style={{ fontFamily: "YardenAlbum, serif" }}
          >
            {page.text_content}
          </p>
        )}

        <Ornament className="mt-6" />
      </div>
    </div>
  );
}

// ─── Dedication ───────────────────────────────────────────────────────────────

function DedicationPage({ page }: { page: PreviewPage }) {
  return (
    <div className="min-h-[380px] rounded-2xl bg-secondary/50 border border-border/40 flex flex-col items-center justify-center text-center p-10 sm:p-14 shadow-sm">
      <Ornament className="mb-7" />

      {page.text_content ? (
        <p
          className="leading-loose text-muted-foreground italic whitespace-pre-line max-w-[260px]"
          style={{ fontFamily: "YardenAlbum, serif", fontSize: "22px" }}
        >
          {page.text_content}
        </p>
      ) : (
        <PlaceholderText label="ההקדשה תופיע כאן" />
      )}

      <Ornament className="mt-7" />
    </div>
  );
}

// ─── Content (illustration + text) ───────────────────────────────────────────

function ContentPage({ page }: { page: PreviewPage }) {
  const position = page.text_position ?? "top";

  return (
    <div className="rounded-2xl bg-card border border-border/60 overflow-hidden shadow-sm">
      {position === "overlay" ? (
        <OverlayLayout page={page} />
      ) : (
        <>
          <IllustrationArea imageUrl={page.image_url} />
          <div className="px-7 pt-6 pb-4 sm:px-9 sm:pt-7">
            <AlbumText content={page.text_content} />
          </div>
        </>
      )}
      <PageNumber number={page.page_number} />
    </div>
  );
}

function OverlayLayout({ page }: { page: PreviewPage }) {
  return (
    <div className="relative">
      <IllustrationArea imageUrl={page.image_url} />
      {page.text_content && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-6 pb-6 pt-10">
          <p
            className="text-white text-center leading-loose whitespace-pre-line"
            style={{ fontFamily: "YardenAlbum, serif", fontSize: "22px" }}
          >
            {page.text_content}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Text only ────────────────────────────────────────────────────────────────

function TextOnlyPage({ page }: { page: PreviewPage }) {
  return (
    <div className="min-h-[380px] rounded-2xl bg-card border border-border/60 flex flex-col items-center justify-center p-10 sm:p-14 shadow-sm">
      <Ornament className="mb-8" />

      {page.text_content ? (
        <p
          className="leading-loose text-foreground text-center whitespace-pre-line"
          style={{ fontFamily: "YardenAlbum, serif", fontSize: "22px" }}
        >
          {page.text_content}
        </p>
      ) : (
        <PlaceholderText label="הטקסט יווצר בקרוב" />
      )}

      <Ornament className="mt-8" />
      <PageNumber number={page.page_number} />
    </div>
  );
}

// ─── Back cover ───────────────────────────────────────────────────────────────

function BackCoverPage({ page }: { page: PreviewPage }) {
  return (
    <div className="relative min-h-[400px] sm:min-h-[480px] rounded-2xl overflow-hidden bg-secondary flex flex-col items-center justify-center text-center p-8 shadow-md">
      <div className="absolute inset-0 bg-gradient-to-tl from-primary/8 via-transparent to-primary/14 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-5">
        <Ornament size="lg" />

        {page.text_content && (
          <p
            className="leading-loose text-muted-foreground italic max-w-[240px] whitespace-pre-line"
            style={{ fontFamily: "YardenAlbum, serif", fontSize: "22px" }}
          >
            {page.text_content}
          </p>
        )}

        <div className="mt-3 pt-5 border-t border-primary/20 w-28 flex flex-col items-center gap-1">
          <span className="text-sm font-semibold text-primary tracking-wide">
            Vitae Studio
          </span>
          <span className="text-[0.65rem] text-muted-foreground">
            סיפור חיים בחרוזים
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AlbumText({ content }: { content: string | null }) {
  if (!content) return <PlaceholderText label="הטקסט יווצר בקרוב" />;
  return (
    <p
      className="text-center leading-loose whitespace-pre-line text-foreground"
      style={{ fontFamily: "YardenAlbum, serif", fontSize: "22px" }}
    >
      {content}
    </p>
  );
}

function IllustrationArea({ imageUrl }: { imageUrl: string | null }) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <div className="aspect-[4/3] overflow-hidden">
        <img
          src={imageUrl}
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="aspect-[4/3] bg-gradient-to-br from-secondary via-secondary/80 to-primary/10 flex flex-col items-center justify-center gap-2">
      <span className="text-primary/25 text-4xl select-none">✦</span>
      <p className="text-xs text-muted-foreground/40">האיור יווצר בקרוב</p>
    </div>
  );
}

function PageNumber({ number }: { number: number }) {
  return (
    <div className="py-3 text-center text-xs text-muted-foreground/40 border-t border-border/25 select-none">
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
      className={`text-primary/35 select-none ${size === "lg" ? "text-xl" : "text-base"} ${className}`}
    >
      ✦
    </div>
  );
}

function PlaceholderText({ label }: { label: string }) {
  return (
    <p className="text-sm text-muted-foreground/40 italic">{label}</p>
  );
}
