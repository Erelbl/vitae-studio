"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { FadeIn } from "@/components/home/FadeIn";
import { IMAGE_COMPARISON } from "@/content/landing-content";

export function ImageComparisonSection() {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Track load errors so we can show a graceful fallback
  const [beforeError, setBeforeError] = useState(false);
  const [afterError, setAfterError] = useState(false);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging.current) updatePosition(e.clientX);
    };
    const onMouseUp = () => {
      isDragging.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [updatePosition]);

  const showFallback = beforeError && afterError;

  return (
    <section className="bg-secondary/20 px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-4xl">

        <FadeIn>
          <div className="mb-10 text-center">
            <span className="mb-3 inline-block text-sm font-medium text-primary">
              {IMAGE_COMPARISON.sectionLabel}
            </span>
            <h2 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">
              {IMAGE_COMPARISON.title}
            </h2>
            <p className="mt-2 text-base text-muted-foreground sm:text-lg">
              {IMAGE_COMPARISON.subtitle}
            </p>
          </div>
        </FadeIn>

        <FadeIn>
          {/*
            Images must be committed to git so Vercel can serve them.
            Place files at:
              public/examples/original.jpg     ← original photo
              public/examples/illustrated.jpg  ← watercolor illustration

            The component uses physical LTR positioning (dir=ltr) since
            this is a visual before/after tool — original always on the left.
          */}
          {showFallback ? (
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/30 text-center text-muted-foreground">
              <div>
                <p className="mb-1 text-base font-medium">תמונות לדוגמה לא נמצאו</p>
                <p className="text-sm">הוסיפו תמונות לתיקייה <code className="rounded bg-border/50 px-1">public/examples/</code></p>
              </div>
            </div>
          ) : (
            <div
              ref={containerRef}
              dir="ltr"
              className="relative aspect-[4/3] w-full cursor-col-resize select-none overflow-hidden rounded-2xl border border-border/30 shadow-xl"
              onMouseDown={() => { isDragging.current = true; }}
              onTouchMove={(e) => updatePosition(e.touches[0].clientX)}
            >
              {/* Before — original photo (full width, underneath) */}
              <div className="absolute inset-0">
                <Image
                  src={IMAGE_COMPARISON.beforeImage.src}
                  alt={IMAGE_COMPARISON.beforeImage.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 896px"
                  className="object-cover"
                  onError={() => setBeforeError(true)}
                />
              </div>

              {/* After — illustration (clipped to the right of the divider) */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 0 0 ${position}%)` }}
              >
                <Image
                  src={IMAGE_COMPARISON.afterImage.src}
                  alt={IMAGE_COMPARISON.afterImage.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 896px"
                  className="object-cover"
                  onError={() => setAfterError(true)}
                />
              </div>

              {/* Vertical divider + handle */}
              <div
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.3)]"
                style={{ left: `${position}%` }}
              >
                <div className="pointer-events-auto absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-xl ring-2 ring-white/60">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-gray-500">
                    <path
                      d="M6 8L3 10L6 12M14 8L17 10L14 12"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

              {/* Labels */}
              <div className="absolute bottom-3 left-3 rounded-full bg-black/50 px-3 py-1 text-sm text-white backdrop-blur-sm">
                {IMAGE_COMPARISON.beforeLabel}
              </div>
              <div className="absolute bottom-3 right-3 rounded-full bg-black/50 px-3 py-1 text-sm text-white backdrop-blur-sm">
                {IMAGE_COMPARISON.afterLabel}
              </div>
            </div>
          )}
        </FadeIn>

      </div>
    </section>
  );
}
