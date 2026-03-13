import Image from "next/image";
import { GALLERY } from "@/content/landing-content";

export function Gallery() {
  const [first, second, third] = GALLERY.images;

  return (
    <section className="bg-background px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl">

        <div className="mb-14 text-center">
          <span className="mb-3 inline-block text-sm font-medium text-primary">
            {GALLERY.sectionLabel}
          </span>
          <h2 className="text-2xl font-semibold sm:text-3xl">{GALLERY.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {GALLERY.subtitle}
          </p>
        </div>

        {/* Gallery grid — staggered for visual depth */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {first && (
            <div className="relative aspect-square overflow-hidden rounded-2xl shadow-lg">
              <Image
                src={first.src}
                alt={first.alt}
                fill
                sizes="(max-width: 640px) 90vw, 33vw"
                className="object-cover transition-transform duration-500 hover:scale-105"
              />
            </div>
          )}
          {/* Middle image offset downward for depth */}
          {second && (
            <div className="relative aspect-square overflow-hidden rounded-2xl shadow-lg sm:mt-8">
              <Image
                src={second.src}
                alt={second.alt}
                fill
                sizes="(max-width: 640px) 90vw, 33vw"
                className="object-cover transition-transform duration-500 hover:scale-105"
              />
            </div>
          )}
          {third && (
            <div className="relative aspect-square overflow-hidden rounded-2xl shadow-lg">
              <Image
                src={third.src}
                alt={third.alt}
                fill
                sizes="(max-width: 640px) 90vw, 33vw"
                className="object-cover transition-transform duration-500 hover:scale-105"
              />
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          דוגמאות מאלבומים אמיתיים — כל אלבום נוצר מאפס עבור לקוח אחד
        </p>

      </div>
    </section>
  );
}
