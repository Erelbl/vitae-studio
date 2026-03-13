import { FadeIn } from "@/components/home/FadeIn";
import { PREMIUM_VALUE } from "@/content/landing-content";

export function PremiumValue() {
  const { points } = PREMIUM_VALUE;

  return (
    <section className="bg-card px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">

        <FadeIn>
          <div className="mb-10 text-center">
            <span className="mb-3 inline-block text-sm font-medium text-primary">
              {PREMIUM_VALUE.sectionLabel}
            </span>
            <h2 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">{PREMIUM_VALUE.title}</h2>
            <p className="mt-2 text-base text-muted-foreground sm:text-lg">
              {PREMIUM_VALUE.subtitle}
            </p>
          </div>
        </FadeIn>

        {/* 6 items = clean 2-col grid (3 rows × 2 cols on desktop) */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-16 sm:gap-y-10">
          {points.map((point, i) => (
            <FadeIn key={i} delay={i * 80}>
              <div className="border-s-2 border-primary/25 ps-5">
                <h3 className="mb-2 font-semibold leading-snug">{point.title}</h3>
                <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{point.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>

      </div>
    </section>
  );
}
