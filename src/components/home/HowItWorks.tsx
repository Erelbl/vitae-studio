import { HOW_IT_WORKS } from "@/content/landing-content";

export function HowItWorks() {
  return (
    <section className="bg-card px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-4xl">

        <div className="mb-14 text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">{HOW_IT_WORKS.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {HOW_IT_WORKS.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.steps.map((step) => (
            <div
              key={step.num}
              className="group rounded-2xl border border-border/60 bg-background p-6 text-center shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/18">
                <span className="text-base font-bold text-primary">{step.num}</span>
              </div>
              <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
