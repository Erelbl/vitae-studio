"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { FadeIn } from "@/components/home/FadeIn";
import { IMAGE_COMPARISON } from "@/content/landing-content";

/** Draggable before/after comparison — each instance is fully independent */
function DraggableComparisonPair({
  before,
  after,
  beforeLabel,
  afterLabel,
}: {
  before: { src: string; alt: string };
  after: { src: string; alt: string };
  beforeLabel: string;
  afterLabel: string;
}) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

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

  return (
    <div
      ref={containerRef}
      dir="ltr"
      className="relative aspect-[3/4] w-full cursor-col-resize select-none overflow-hidden rounded-2xl border border-border/30 shadow-xl"
      onMouseDown={() => { isDragging.current = true; }}
      onTouchMove={(e) => updatePosition(e.touches[0].clientX)}
    >
      {/* Before — original photo (full width, underneath) */}
      <div className="absolute inset-0">
        <Image
          src={before.src}
          alt={before.alt}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover"
        />
      </div>

      {/* After — illustration (clipped to the right of the divider) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
      >
        <Image
          src={after.src}
          alt={after.alt}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover"
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
        {beforeLabel}
      </div>
      <div className="absolute bottom-3 right-3 rounded-full bg-black/50 px-3 py-1 text-sm text-white backdrop-blur-sm">
        {afterLabel}
      </div>
    </div>
  );
}

export function ImageComparisonSection() {
  const allPairs = [
    { before: IMAGE_COMPARISON.beforeImage, after: IMAGE_COMPARISON.afterImage },
  ];

  return (
    <section className="bg-secondary/20 px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">

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
          <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
            {allPairs.map((pair, i) => (
              <DraggableComparisonPair
                key={i}
                before={pair.before}
                after={pair.after}
                beforeLabel={IMAGE_COMPARISON.beforeLabel}
                afterLabel={IMAGE_COMPARISON.afterLabel}
              />
            ))}
          </div>
        </FadeIn>

      </div>
    </section>
  );
}
