import { FadeIn } from "@/components/home/FadeIn";
import { GalleryCarousel } from "@/components/home/GalleryCarousel";
import { GALLERY } from "@/content/landing-content";

export function Gallery() {
  const mid = Math.floor(GALLERY.images.length / 2);

  return (
    <section className="overflow-hidden bg-background py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">

        <FadeIn>
          <div className="mb-14 px-4 text-center">
            <span className="mb-3 inline-block text-sm font-medium text-primary">
              {GALLERY.sectionLabel}
            </span>
            <h2 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">{GALLERY.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base lg:text-lg">
              {GALLERY.subtitle}
            </p>
          </div>
        </FadeIn>

        <FadeIn>
          <GalleryCarousel
            images={GALLERY.images}
            defaultIndex={mid}
            showDots
            showCaption
          />
        </FadeIn>

      </div>
    </section>
  );
}
