import { FadeIn } from "@/components/home/FadeIn";
import { HOW_IT_WORKS } from "@/content/landing-content";

export function HowItWorks() {
  return (
    <section className="bg-card px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">

        <FadeIn>
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">{HOW_IT_WORKS.title}</h2>
            <p className="mt-2 text-base text-muted-foreground sm:text-lg">
              {HOW_IT_WORKS.subtitle}
            </p>
          </div>
        </FadeIn>

        {/*
          Equal-height grid. Cards use justify-center so title + desc
          are treated as one unit, centered vertically within the shared height.
          No mt-auto gap between title and desc.
        */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.steps.map((step, i) => (
            <FadeIn key={step.num} delay={i * 100}>
              <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl bg-secondary/40 px-6 py-8 text-center">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/12">
                  <span className="text-base font-bold text-primary">{step.num}</span>
                </div>
                <h3 className="text-lg font-semibold leading-snug">{step.title}</h3>
                <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
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
