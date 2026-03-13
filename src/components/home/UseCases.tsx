import { FadeIn } from "@/components/home/FadeIn";
import { USE_CASES } from "@/content/landing-content";

export function UseCases() {
  return (
    <section className="bg-secondary/30 px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl">

        <FadeIn>
          <div className="mb-14 text-center">
            <span className="mb-3 inline-block text-sm font-medium text-primary">
              {USE_CASES.sectionLabel}
            </span>
            <h2 className="text-2xl font-semibold sm:text-3xl">{USE_CASES.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {USE_CASES.subtitle}
            </p>
          </div>
        </FadeIn>

        {/* Editorial list — no cards, pure typography + separator */}
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-14">
          {USE_CASES.cases.map((c, i) => (
            <FadeIn key={i} delay={i * 80}>
              <div className="flex items-start gap-4 border-b border-border/40 py-7 last:border-0 sm:[&:nth-last-child(2)]:border-0">
                <span className="mt-0.5 shrink-0 text-xl opacity-70">{c.icon}</span>
                <div>
                  <h3 className="mb-1 font-semibold leading-snug">{c.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{c.desc}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

      </div>
    </section>
  );
}
