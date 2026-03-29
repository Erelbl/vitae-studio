"use client";

import { FadeIn } from "@/components/home/FadeIn";
import { GalleryCarousel } from "@/components/home/GalleryCarousel";
import { GALLERY } from "@/content/landing-content";

export function FilmPreviewSection() {
  return (
    <section className="bg-secondary/30 px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <FadeIn>
          <div className="mb-12 text-center">
            <span className="mb-3 inline-block text-xs font-semibold tracking-widest text-primary uppercase">
              גלריית איורים
            </span>
            <h2 className="text-3xl font-semibold sm:text-4xl">
              כל אלבום — עולם איורים משלו
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg mx-auto max-w-xl">
              כל סיפור מקבל סגנון ייחודי של איורי צבעי מים, מותאם לאישיות ולרגשות של הגיבור.
            </p>
          </div>
        </FadeIn>

        {/* Gallery carousel */}
        <FadeIn delay={120}>
          <GalleryCarousel
            images={GALLERY.images}
            defaultIndex={Math.floor(GALLERY.images.length / 2)}
            showDots
            showCaption
          />
        </FadeIn>

        {/* Footnote */}
        <FadeIn delay={400}>
          <p className="mt-10 text-center text-xs text-muted-foreground/50">
            ✦ &nbsp; מתוך אלבומים אמיתיים שנוצרו בוויטה סטודיו
          </p>
        </FadeIn>

      </div>
    </section>
  );
}
