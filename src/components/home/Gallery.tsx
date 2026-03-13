import Image from "next/image";
import { FadeIn } from "@/components/home/FadeIn";
import { GALLERY } from "@/content/landing-content";

export function Gallery() {
  const [first, second, third] = GALLERY.images;

  return (
    <section className="bg-background px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl">

        <FadeIn>
          <div className="mb-14 text-center">
            <span className="mb-3 inline-block text-sm font-medium text-primary">
              {GALLERY.sectionLabel}
            </span>
            <h2 className="text-2xl font-semibold sm:text-3xl">{GALLERY.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {GALLERY.subtitle}
            </p>
          </div>
        </FadeIn>

        {/* Gallery grid.
            Images use w-full h-auto (natural proportions) — no forced cropping.
            Background tint shows elegantly for any letterboxing on non-square images. */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {first && (
            <FadeIn delay={0}>
              <div className="overflow-hidden rounded-2xl bg-secondary/40 shadow-lg">
                <Image
                  src={first.src}
                  alt={first.alt}
                  width={800}
                  height={800}
                  sizes="(max-width: 640px) 90vw, 33vw"
                  className="w-full h-auto object-contain transition-transform duration-500 hover:scale-[1.03]"
                />
              </div>
            </FadeIn>
          )}
          {/* Middle image slightly elevated on desktop */}
          {second && (
            <FadeIn delay={120}>
              <div className="overflow-hidden rounded-2xl bg-secondary/40 shadow-lg sm:-mt-4 sm:shadow-xl">
                <Image
                  src={second.src}
                  alt={second.alt}
                  width={800}
                  height={800}
                  sizes="(max-width: 640px) 90vw, 33vw"
                  className="w-full h-auto object-contain transition-transform duration-500 hover:scale-[1.03]"
                />
              </div>
            </FadeIn>
          )}
          {third && (
            <FadeIn delay={240}>
              <div className="overflow-hidden rounded-2xl bg-secondary/40 shadow-lg">
                <Image
                  src={third.src}
                  alt={third.alt}
                  width={800}
                  height={800}
                  sizes="(max-width: 640px) 90vw, 33vw"
                  className="w-full h-auto object-contain transition-transform duration-500 hover:scale-[1.03]"
                />
              </div>
            </FadeIn>
          )}
        </div>

        <FadeIn delay={300}>
          <p className="mt-8 text-center text-xs text-muted-foreground/60">
            דוגמאות מאלבומים אמיתיים — כל אלבום נוצר מאפס עבור לקוח אחד
          </p>
        </FadeIn>

      </div>
    </section>
  );
}
