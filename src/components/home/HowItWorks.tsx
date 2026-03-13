import { FadeIn } from "@/components/home/FadeIn";
import { HOW_IT_WORKS } from "@/content/landing-content";

export function HowItWorks() {
  return (
    <section className="bg-card px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">

        <FadeIn>
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold sm:text-4xl">{HOW_IT_WORKS.title}</h2>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              {HOW_IT_WORKS.subtitle}
            </p>
          </div>
        </FadeIn>

        {/*
          Equal-height cards. Structure:
            1. Number circle — always at top (fixed padding above it)
            2. Title — inside a min-h container so all titles occupy the same vertical
               space regardless of wrapping, pinning body text to the same Y position
            3. Body — flows naturally after the title block
        */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.steps.map((step, i) => (
            <FadeIn key={step.num} delay={i * 100}>
              <div className="flex h-full flex-col items-center rounded-2xl bg-secondary/40 px-6 py-8 text-center">
                {/* Number circle */}
                <div className="mb-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/12">
                  <span className="text-base font-bold text-primary">{step.num}</span>
                </div>

                {/* Title — min-h ensures consistent vertical anchor for body text */}
                <div className="mb-3 flex min-h-[3.5rem] items-center justify-center">
                  <h3 className="text-xl font-semibold leading-snug">{step.title}</h3>
                </div>

                {/* Body */}
                <p className="text-base leading-relaxed text-muted-foreground">
                  {step.desc}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>

      </div>
    </section>
  );
}
