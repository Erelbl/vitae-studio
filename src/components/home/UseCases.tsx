import { USE_CASES } from "@/content/landing-content";

export function UseCases() {
  return (
    <section className="bg-secondary/30 px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-4xl">

        <div className="mb-14 text-center">
          <span className="mb-3 inline-block text-sm font-medium text-primary">
            {USE_CASES.sectionLabel}
          </span>
          <h2 className="text-2xl font-semibold sm:text-3xl">{USE_CASES.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {USE_CASES.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.cases.map((c, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm"
            >
              <div className="mb-3 text-3xl">{c.icon}</div>
              <h3 className="mb-2 text-base font-semibold">{c.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{c.desc}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
