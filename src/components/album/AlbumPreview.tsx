"use client";

import { useEffect, useState } from "react";
import type { PreviewData, PreviewPage } from "@/types/page";
import { AlbumPageView } from "./AlbumPageView";

interface AlbumPreviewProps {
  data: PreviewData;
  /** When set by a parent, jump the preview to this spread index. */
  focusedSpreadIndex?: number;
}

/** Groups a flat page list into consecutive pairs (spreads). */
function buildSpreads(pages: PreviewPage[]): [PreviewPage, PreviewPage | null][] {
  const spreads: [PreviewPage, PreviewPage | null][] = [];
  for (let i = 0; i < pages.length; i += 2) {
    spreads.push([pages[i], pages[i + 1] ?? null]);
  }
  return spreads;
}

export function AlbumPreview({ data, focusedSpreadIndex }: AlbumPreviewProps) {
  const { pages, personName } = data;
  const spreads = buildSpreads(pages);
  const totalSpreads = spreads.length;

  const [spreadIndex, setSpreadIndex] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  // Sync with external navigation requests (e.g. editor page selection)
  useEffect(() => {
    if (focusedSpreadIndex === undefined) return;
    const clamped = Math.max(0, Math.min(focusedSpreadIndex, totalSpreads - 1));
    setSpreadIndex(clamped);
    setAnimKey((k) => k + 1);
  }, [focusedSpreadIndex, totalSpreads]);

  function navigate(next: number) {
    setSpreadIndex(next);
    setAnimKey((k) => k + 1);
  }

  const goPrev = () => navigate(Math.max(0, spreadIndex - 1));
  const goNext = () => navigate(Math.min(totalSpreads - 1, spreadIndex + 1));

  const [rightPage, leftPage] = spreads[spreadIndex];
  const firstPageNum = rightPage.page_number;
  const lastPageNum = leftPage?.page_number ?? firstPageNum;
  const pageLabel = leftPage ? `${firstPageNum}–${lastPageNum}` : `${firstPageNum}`;

  return (
    <div className="flex flex-col gap-5">
      {/* Mock data notice */}
      {data.isMock && (
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-center text-xs text-amber-700/90 leading-relaxed">
          תצוגה לדוגמה — האלבום האמיתי יהיה מוכן לאחר יצירת הסיפור והאיורים
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
          className="grid grid-cols-1 sm:grid-cols-2 rounded-sm overflow-hidden"
          style={{ animation: "albumSpreadIn 0.22s ease-out" }}
        >
          {/* Right page (first in RTL spread) */}
          <AlbumPageView page={rightPage} personName={personName} />

          {/* Left page (second in RTL spread) */}
          {leftPage ? (
            <AlbumPageView page={leftPage} personName={personName} />
          ) : (
            <div className="hidden sm:block aspect-square bg-secondary/40" />
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
