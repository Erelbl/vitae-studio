import { FadeIn } from "@/components/home/FadeIn";
import { HOW_IT_WORKS } from "@/content/landing-content";

export function HowItWorks() {
  return (
    <section className="bg-card px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl">

        <FadeIn>
          <div className="mb-14 text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">{HOW_IT_WORKS.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base lg:text-lg">
              {HOW_IT_WORKS.subtitle}
            </p>
          </div>
        </FadeIn>

        {/* Equal-height grid: each card is a flex column so content can grow */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.steps.map((step, i) => (
            <FadeIn key={step.num} delay={i * 100}>
              <div className="flex h-full flex-col rounded-2xl bg-secondary/40 p-6 text-center">
                <div className="mx-auto mb-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/12">
                  <span className="text-base font-bold text-primary">{step.num}</span>
                </div>
                <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                <p className="mt-auto text-sm leading-relaxed text-muted-foreground sm:text-base">
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
