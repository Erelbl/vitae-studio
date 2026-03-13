import { FadeIn } from "@/components/home/FadeIn";
import { PREMIUM_VALUE } from "@/content/landing-content";

export function PremiumValue() {
  const { points } = PREMIUM_VALUE;

  return (
    <section className="bg-card px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl">

        <FadeIn>
          <div className="mb-14 text-center">
            <span className="mb-3 inline-block text-sm font-medium text-primary">
              {PREMIUM_VALUE.sectionLabel}
            </span>
            <h2 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">{PREMIUM_VALUE.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base lg:text-lg">
              {PREMIUM_VALUE.subtitle}
            </p>
          </div>
        </FadeIn>

        {/* 2-col editorial layout. Odd last item spans full width and centers. */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-16 sm:gap-y-10">
          {points.map((point, i) => {
            const isLastOdd = i === points.length - 1 && points.length % 2 === 1;

            return (
              <FadeIn key={i} delay={i * 80}>
                <div
                  className={`border-s-2 border-primary/25 ps-5 ${
                    isLastOdd ? "sm:col-span-2 sm:mx-auto sm:max-w-lg" : ""
                  }`}
                >
                  <h3 className="mb-2 font-semibold leading-snug">{point.title}</h3>
                  <p className="text-base leading-relaxed text-muted-foreground">{point.desc}</p>
                </div>
              </FadeIn>
            );
          })}
        </div>

      </div>
    </section>
  );
}
