import Image from "next/image";
import { FadeIn } from "@/components/home/FadeIn";
import { FOUNDER } from "@/content/landing-content";

export function FounderSection() {
  return (
    <section className="bg-secondary/20 px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl">

        <FadeIn>
          <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-start lg:gap-16">

            {/* Photo — start side (right in RTL) */}
            <div className="shrink-0">
              <div className="h-56 w-56 overflow-hidden rounded-full border-4 border-primary/20 shadow-xl bg-secondary/50">
                <Image
                  src={FOUNDER.image.src}
                  alt={FOUNDER.image.alt}
                  width={224}
                  height={224}
                  className="h-full w-full object-cover"
                  /* Image path is set in landing-content.ts → FOUNDER.image.src
                     File must be at: public/assets/founder.jpeg */
                />
              </div>
            </div>

            {/* Text — end side (left in RTL) */}
            <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-start">
              <h2 className="mb-4 text-2xl font-semibold sm:text-3xl">
                {FOUNDER.sectionLabel}
              </h2>

              {/* Opening greeting — displayed prominently */}
              <p className="mb-5 text-xl font-semibold leading-relaxed text-foreground sm:text-2xl">
                {FOUNDER.quote}
              </p>

              {/* Body paragraphs — each rendered separately for clean line breaks */}
              <div className="mb-5 space-y-4">
                {FOUNDER.paragraphs.map((para, i) => (
                  <p
                    key={i}
                    className={`leading-relaxed ${
                      i === 0
                        ? "font-medium text-foreground/90"
                        : "text-muted-foreground"
                    }`}
                  >
                    {para}
                  </p>
                ))}
              </div>

              <Image
                src="/images/landing/signature-dor.png"
                alt="חתימת דור אלירז"
                width={120}
                height={48}
                className="mt-3 opacity-75"
              />
              <p className="mt-1 font-semibold">{FOUNDER.name}</p>
              <p className="text-sm text-muted-foreground">{FOUNDER.title}</p>
            </div>

          </div>
        </FadeIn>

      </div>
    </section>
  );
}
