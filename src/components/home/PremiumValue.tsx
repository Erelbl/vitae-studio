import { FadeIn } from "@/components/home/FadeIn";
import { PREMIUM_VALUE } from "@/content/landing-content";

export function PremiumValue() {
  return (
    <section className="bg-card px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl">

        <FadeIn>
          <div className="mb-14 text-center">
            <span className="mb-3 inline-block text-sm font-medium text-primary">
              {PREMIUM_VALUE.sectionLabel}
            </span>
            <h2 className="text-2xl font-semibold sm:text-3xl">{PREMIUM_VALUE.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {PREMIUM_VALUE.subtitle}
            </p>
          </div>
        </FadeIn>

        {/* Editorial layout — olive border-start accent, no boxed cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-x-14 sm:gap-y-8">
          {PREMIUM_VALUE.points.map((point, i) => (
            <FadeIn key={i} delay={i * 80}>
              <div className="border-s-2 border-primary/25 ps-5">
                <div className="mb-1.5 flex items-center gap-2.5">
                  <span className="text-base leading-none">{point.icon}</span>
                  <h3 className="font-semibold leading-snug">{point.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{point.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>

      </div>
    </section>
  );
}
