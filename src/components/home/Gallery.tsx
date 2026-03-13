"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FadeIn } from "@/components/home/FadeIn";
import { GALLERY } from "@/content/landing-content";

export function Gallery() {
  const images = GALLERY.images;
  const [current, setCurrent] = useState(0);
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
    if (Math.abs(delta) > 50) {
      if (delta < 0) next(); // swipe left → next
      else prev();           // swipe right → prev
    }
  };

  return (
    <section className="overflow-hidden bg-background py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">

        <FadeIn>
          <div className="mb-14 px-4 text-center">
            <span className="mb-3 inline-block text-sm font-medium text-primary">
              {GALLERY.sectionLabel}
            </span>
            <h2 className="text-2xl font-semibold sm:text-3xl">{GALLERY.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {GALLERY.subtitle}
            </p>
          </div>
        </FadeIn>

        <FadeIn>
          {/*
            Carousel: three images shown at once.
            Center = current (large, 68% wide, full height).
            Left/right = adjacent images (22% wide, centered vertically).
            Height = 68% of width so center image renders as a square.
            All transitions are CSS (no JS position tracking needed).
            Touch swipe supported.
          */}
          <div
            className="relative w-full select-none"
            style={{ paddingTop: "68%" }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {images.map((img, i) => {
              const pos = i - current; // -1, 0, +1; ±2+ = hidden

              let style: React.CSSProperties;

              if (pos === 0) {
                // Center — large, prominent
                style = {
                  left: "16%",
                  width: "68%",
                  height: "100%",
                  top: 0,
                  opacity: 1,
                  zIndex: 10,
                  boxShadow: "0 20px 60px -10px rgba(0,0,0,0.18)",
                };
              } else if (pos === -1) {
                // Physically left (previous)
                style = {
                  left: "1%",
                  width: "22%",
                  height: "34%",
                  top: "33%",
                  opacity: 0.5,
                  zIndex: 5,
                };
              } else if (pos === 1) {
                // Physically right (next)
                style = {
                  right: "1%",
                  width: "22%",
                  height: "34%",
                  top: "33%",
                  opacity: 0.5,
                  zIndex: 5,
                };
              } else {
                // Off-screen — parked out of view, ready to animate in
                style = {
                  left: pos < 0 ? "-35%" : "113%",
                  width: "22%",
                  height: "34%",
                  top: "33%",
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
                    sizes="(max-width: 640px) 70vw, 68vw"
                    className="object-contain"
                  />
                </div>
              );
            })}

            {/* Previous arrow — physically left */}
            <button
              onClick={prev}
              disabled={current === 0}
              className="absolute left-2 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-background/90 shadow-md backdrop-blur-sm transition-all hover:bg-background hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-20 sm:left-3 sm:h-10 sm:w-10"
              aria-label="תמונה קודמת"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Next arrow — physically right */}
            <button
              onClick={next}
              disabled={current === images.length - 1}
              className="absolute right-2 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-background/90 shadow-md backdrop-blur-sm transition-all hover:bg-background hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-20 sm:right-3 sm:h-10 sm:w-10"
              aria-label="תמונה הבאה"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Dot indicators */}
          <div className="mt-6 flex justify-center gap-2 px-4">
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

          <p className="mt-4 px-4 text-center text-xs text-muted-foreground/60 sm:text-sm">
            דוגמאות מאלבומים אמיתיים — כל אלבום נוצר מאפס עבור לקוח אחד
          </p>
        </FadeIn>

      </div>
    </section>
  );
}
