"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { HERO } from "@/content/landing-content";

interface Props {
  onStartOrder: () => void;
  loading: boolean;
}

export function HeroSection({ onStartOrder, loading }: Props) {
  return (
    <section className="relative overflow-hidden bg-background px-4 py-20 sm:py-28">
      {/* Ambient blobs */}
      <div className="pointer-events-none absolute -end-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-primary/8 blur-3xl" />
      <div className="pointer-events-none absolute -start-24 bottom-0 h-80 w-80 rounded-full bg-secondary blur-2xl" />

      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">

          {/* Text — start side (right in RTL). Staggered load animation via CSS. */}
          <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-start">
            <span
              className="mb-5 inline-flex animate-fade-up items-center rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-sm font-medium text-primary"
              style={{ animationDelay: "0ms", animationFillMode: "both" }}
            >
              {HERO.badge}
            </span>

            <h1
              className="mb-5 max-w-lg animate-fade-up text-5xl font-bold leading-[1.15] tracking-tight sm:text-6xl lg:text-7xl"
              style={{ animationDelay: "100ms", animationFillMode: "both" }}
            >
              {HERO.title}
              <br />
              <span className="text-primary">{HERO.titleHighlight}</span>
            </h1>

            <p
              className="mb-8 max-w-md animate-fade-up text-base leading-relaxed text-muted-foreground sm:text-lg"
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
                className="w-full max-w-xs rounded-full px-8 py-5 text-base font-semibold shadow-md transition-all hover:shadow-lg sm:w-auto sm:px-12 sm:py-6 sm:text-lg"
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

          {/* Hero visual — end side (left in RTL).
              Uses w-full h-auto to show the image at natural proportions — no forced cropping.
              Replace HERO.heroImage.src with a final mockup when ready. */}
          <div
            className="relative w-full max-w-sm shrink-0 animate-fade-up lg:w-[420px]"
            style={{ animationDelay: "150ms", animationFillMode: "both" }}
          >
            <div className="overflow-hidden rounded-3xl border border-border/30 bg-secondary/50 shadow-2xl">
              <Image
                src={HERO.heroImage.src}
                alt={HERO.heroImage.alt}
                width={840}
                height={840}
                priority
                sizes="(max-width: 640px) 90vw, (max-width: 1024px) 384px, 420px"
                className="w-full h-auto object-contain"
              />
            </div>
            {/* Subtle decorative ring */}
            <div className="pointer-events-none absolute -inset-2 -z-10 rounded-[2rem] border border-primary/12" />
          </div>

        </div>
      </div>
    </section>
  );
}
