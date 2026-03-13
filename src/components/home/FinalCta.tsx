"use client";

import { Button } from "@/components/ui/button";
import { FINAL_CTA } from "@/content/landing-content";

interface Props {
  onStartOrder: () => void;
  loading: boolean;
}

export function FinalCta({ onStartOrder, loading }: Props) {
  return (
    <section className="bg-primary px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">

        <h2 className="mb-5 text-3xl font-bold text-white sm:text-4xl">
          {FINAL_CTA.title}
        </h2>

        <p className="mb-10 text-base leading-relaxed text-white/75 sm:text-lg">
          {FINAL_CTA.subtitle}
        </p>

        <Button
          size="lg"
          onClick={onStartOrder}
          disabled={loading}
          className="rounded-full bg-white px-10 py-5 text-base font-semibold text-primary shadow-md hover:bg-white/90 hover:shadow-lg sm:px-14 sm:py-6 sm:text-lg"
        >
          {loading ? "טוען..." : FINAL_CTA.ctaLabel}
        </Button>

        <p className="mt-5 text-xs text-white/50">{FINAL_CTA.trustNote}</p>

      </div>
    </section>
  );
}
