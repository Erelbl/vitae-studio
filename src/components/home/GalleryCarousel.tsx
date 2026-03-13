"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface CarouselImage {
  src: string;
  alt: string;
}

interface Props {
  images: CarouselImage[];
  /** Which index to start on. Defaults to the middle image. */
  defaultIndex?: number;
  showDots?: boolean;
  showCaption?: boolean;
}

export function GalleryCarousel({
  images,
  defaultIndex,
  showDots = true,
  showCaption = false,
}: Props) {
  const mid = defaultIndex ?? Math.floor(images.length / 2);
  const [current, setCurrent] = useState(mid);
  const touchStartX = useRef(0);

  const prev = useCallback(() => setCurrent((c) => Math.max(0, c - 1)), []);
  const next = useCallback(
    () => setCurrent((c) => Math.min(images.length - 1, c + 1)),
    [images.length]
  );

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) delta < 0 ? next() : prev();
  };

  return (
    <div className="w-full">
      {/*
        Carousel layout — three images visible at once.
        Center = current (72% wide, full padded height).
        Sides = adjacent (20% wide, vertically centered at 38%).
        Off-screen items animate in smoothly from the edge.
      */}
      <div
        className="relative w-full select-none"
        style={{ paddingTop: "70%" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {images.map((img, i) => {
          const pos = i - current; // -1 = left, 0 = center, 1 = right

          let style: React.CSSProperties;

          if (pos === 0) {
            style = {
              left: "14%",
              width: "72%",
              height: "100%",
              top: 0,
              opacity: 1,
              zIndex: 10,
              boxShadow: "0 28px 72px -16px rgba(0,0,0,0.24)",
            };
          } else if (pos === -1) {
            style = {
              left: "0%",
              width: "20%",
              height: "40%",
              top: "30%",
              opacity: 0.42,
              zIndex: 5,
            };
          } else if (pos === 1) {
            style = {
              right: "0%",
              width: "20%",
              height: "40%",
              top: "30%",
              opacity: 0.42,
              zIndex: 5,
            };
          } else {
            style = {
              left: pos < 0 ? "-28%" : "108%",
              width: "20%",
              height: "40%",
              top: "30%",
              opacity: 0,
              zIndex: 0,
            };
          }

          return (
            <div
              key={i}
              className="absolute overflow-hidden rounded-2xl bg-secondary/40 transition-all duration-500 ease-in-out"
              style={style}
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="(max-width: 640px) 70vw, 72vw"
                className="object-contain"
              />
            </div>
          );
        })}

        {/* Previous arrow — physically left */}
        <button
          onClick={prev}
          disabled={current === 0}
          className="absolute left-2 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-background/90 shadow-md backdrop-blur-sm transition-all hover:bg-background hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-20 sm:left-5 sm:h-11 sm:w-11"
          aria-label="תמונה קודמת"
        >
          <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        {/* Next arrow — physically right */}
        <button
          onClick={next}
          disabled={current === images.length - 1}
          className="absolute right-2 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-background/90 shadow-md backdrop-blur-sm transition-all hover:bg-background hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-20 sm:right-5 sm:h-11 sm:w-11"
          aria-label="תמונה הבאה"
        >
          <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      </div>

      {showDots && (
        <div className="mt-5 flex justify-center gap-2">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === current
                  ? "w-6 bg-primary"
                  : "w-1.5 bg-border hover:bg-primary/40"
              }`}
              aria-label={`תמונה ${i + 1}`}
            />
          ))}
        </div>
      )}

      {showCaption && (
        <p className="mt-3 text-center text-xs text-muted-foreground/60 sm:text-sm">
          דוגמאות מאלבומים אמיתיים — כל אלבום נוצר מאפס עבור לקוח אחד
        </p>
      )}
    </div>
  );
}
