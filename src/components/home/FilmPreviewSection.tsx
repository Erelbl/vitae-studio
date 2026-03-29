"use client";

import { FadeIn } from "@/components/home/FadeIn";
import { GalleryCarousel } from "@/components/home/GalleryCarousel";
import { GALLERY } from "@/content/landing-content";

export function FilmPreviewSection() {
  return (
    <section className="bg-secondary/30 px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl">

        <FadeIn>
          <GalleryCarousel
            images={GALLERY.images}
            defaultIndex={Math.floor(GALLERY.images.length / 2)}
            showDots
            showCaption
          />
        </FadeIn>

      </div>
    </section>
  );
}
