"use client";

import { useState } from "react";
import type { PreviewData } from "@/types/page";
import { AlbumPageView } from "./AlbumPageView";

interface AlbumPreviewProps {
  data: PreviewData;
}

export function AlbumPreview({ data }: AlbumPreviewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { pages, personName } = data;
  const total = pages.length;
  const currentPage = pages[currentIndex];

  const goPrev = () => setCurrentIndex((i) => Math.max(0, i - 1));
  const goNext = () => setCurrentIndex((i) => Math.min(total - 1, i + 1));

  return (
    <div className="flex flex-col gap-5">
      {/* Mock data notice */}
      {data.isMock && (
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-center text-xs text-amber-700/90 leading-relaxed">
          תצוגה לדוגמה — האלבום האמיתי יהיה מוכן לאחר יצירת הסיפור והאיורים
        </div>
      )}

      {/* Page */}
      <div key={currentIndex}>
        <AlbumPageView page={currentPage} personName={personName} />
      </div>

      {/* Navigation row */}
      <div className="flex items-center justify-between px-1 pt-1">
        <NavButton onClick={goPrev} disabled={currentIndex === 0}>
          הקודם
        </NavButton>

        <span className="text-sm tabular-nums text-muted-foreground select-none">
          {currentIndex + 1} / {total}
        </span>

        <NavButton onClick={goNext} disabled={currentIndex === total - 1}>
          הבא
        </NavButton>
      </div>

      {/* Dot indicators (up to 12 pages) */}
      {total <= 12 && (
        <div className="flex justify-center gap-2 pb-2">
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              aria-label={`עמוד ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === currentIndex
                  ? "w-5 bg-primary"
                  : "w-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/45"
              }`}
            />
          ))}
        </div>
      )}
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
