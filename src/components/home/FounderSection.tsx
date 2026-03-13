import Image from "next/image";
import { FadeIn } from "@/components/home/FadeIn";
import { FOUNDER } from "@/content/landing-content";

export function FounderSection() {
  return (
    <section className="bg-secondary/20 px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-4xl">

        <FadeIn>
          <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-start lg:gap-16">

            {/* Photo — start side (right in RTL).
                Uses w-full h-auto on the image so the photo is never harshly cropped. */}
            <div className="shrink-0">
              <div className="h-56 w-56 overflow-hidden rounded-full border-4 border-primary/20 shadow-xl bg-secondary/50">
                <Image
                  src={FOUNDER.image.src}
                  alt={FOUNDER.image.alt}
                  width={224}
                  height={224}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>

            {/* Text — end side (left in RTL) */}
            <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-start">
              <span className="mb-4 inline-block text-sm font-medium text-primary">
                {FOUNDER.sectionLabel}
              </span>

              <blockquote className="mb-6 text-xl font-medium leading-relaxed text-foreground sm:text-2xl">
                {FOUNDER.quote}
              </blockquote>

              <p className="mb-5 leading-relaxed text-muted-foreground">{FOUNDER.bio}</p>

              <div className="my-2 h-px w-12 bg-primary/30" />

              <p className="mt-3 font-semibold">{FOUNDER.name}</p>
              <p className="text-sm text-muted-foreground">{FOUNDER.title}</p>
            </div>

          </div>
        </FadeIn>

      </div>
    </section>
  );
}
