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

// ─── Shared page shell ────────────────────────────────────────────────────────

/** Every album page is a perfect square — mirrors a real 25×25 cm album page. */
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

// ─── Cover ───────────────────────────────────────────────────────────────────

function CoverPage({
  page,
  personName,
}: {
  page: PreviewPage;
  personName: string;
}) {
  return (
    <PageShell className="bg-secondary">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/18" />

      {/* Centered content */}
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

// ─── Content (illustration + text overlay) ───────────────────────────────────

function ContentPage({ page }: { page: PreviewPage }) {
  return (
    <PageShell className="bg-secondary">
      {/* Illustration fills the full page */}
      {page.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={page.image_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-secondary via-secondary/80 to-primary/10">
          <span className="text-primary/25 text-3xl select-none">✦</span>
          <p className="text-xs text-muted-foreground/40">האיור יווצר בקרוב</p>
        </div>
      )}

      {/* Text overlay — gradient fade from bottom */}
      {page.text_content && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/72 via-black/40 to-transparent px-5 pb-6 pt-16">
          <p
            className="text-white text-center leading-relaxed whitespace-pre-line"
            style={{
              fontFamily: "YardenAlbum, serif",
              fontSize: "15px",
              textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}
          >
            {page.text_content}
          </p>
        </div>
      )}

      <PageNumber number={page.page_number} light />
    </PageShell>
  );
}

// ─── Text only ────────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
      className={`text-primary/35 select-none ${size === "lg" ? "text-xl" : "text-base"} ${className}`}
    >
      ✦
    </div>
  );
}

function PlaceholderText({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground/40 italic">{label}</p>;
}
