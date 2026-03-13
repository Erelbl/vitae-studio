"use client";

import { Button } from "@/components/ui/button";
import { HERO, GALLERY } from "@/content/landing-content";
import { GalleryCarousel } from "@/components/home/GalleryCarousel";

interface Props {
  onStartOrder: () => void;
  loading: boolean;
}

export function HeroSection({ onStartOrder, loading }: Props) {
  return (
    <section className="relative overflow-hidden bg-background">
      {/* Ambient blobs */}
      <div className="pointer-events-none absolute -end-32 -top-32 h-[34rem] w-[34rem] rounded-full bg-primary/8 blur-3xl" />
      <div className="pointer-events-none absolute -start-24 bottom-0 h-80 w-80 rounded-full bg-secondary blur-2xl" />

      {/* Centered text block */}
      <div className="relative z-10 mx-auto max-w-4xl px-4 pb-10 pt-20 text-center sm:pb-12 sm:pt-28">
        <span
          className="mb-5 inline-flex animate-fade-up items-center rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-sm font-medium text-primary"
          style={{ animationDelay: "0ms", animationFillMode: "both" }}
        >
          {HERO.badge}
        </span>

        <h1
          className="mb-5 animate-fade-up text-5xl font-bold leading-[1.15] tracking-tight sm:text-6xl lg:text-7xl xl:text-8xl"
          style={{ animationDelay: "100ms", animationFillMode: "both" }}
        >
          {HERO.title}
          <br />
          <span className="text-primary">{HERO.titleHighlight}</span>
        </h1>

        <p
          className="mx-auto mb-8 max-w-xl animate-fade-up text-base leading-relaxed text-muted-foreground sm:text-lg lg:text-xl"
          style={{ animationDelay: "200ms", animationFillMode: "both" }}
        >
          {HERO.subtitle}
        </p>

        <div
          className="animate-fade-up"
          style={{ animationDelay: "300ms", animationFillMode: "both" }}
        >
          <Button
            size="lg"
            onClick={onStartOrder}
            disabled={loading}
            className="rounded-full px-8 py-5 text-base font-semibold shadow-md transition-all hover:shadow-lg sm:px-12 sm:py-6 sm:text-lg"
          >
            {loading ? "טוען..." : HERO.ctaLabel}
          </Button>
        </div>

        <p
          className="mt-4 animate-fade-up text-xs text-muted-foreground/60"
          style={{ animationDelay: "400ms", animationFillMode: "both" }}
        >
          {HERO.trustNote}
        </p>
      </div>

      {/* Full-width gallery carousel — replaces static hero image */}
      <div
        className="relative z-10 mx-auto max-w-6xl animate-fade-up px-0 pb-20 sm:pb-28"
        style={{ animationDelay: "200ms", animationFillMode: "both" }}
      >
        <GalleryCarousel
          images={GALLERY.images}
          defaultIndex={Math.floor(GALLERY.images.length / 2)}
          showDots
          showCaption
        />
      </div>
    </section>
  );
}
