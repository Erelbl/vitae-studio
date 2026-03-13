import { PREMIUM_VALUE } from "@/content/landing-content";

export function PremiumValue() {
  return (
    <section className="bg-card px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-4xl">

        <div className="mb-14 text-center">
          <span className="mb-3 inline-block text-sm font-medium text-primary">
            {PREMIUM_VALUE.sectionLabel}
          </span>
          <h2 className="text-2xl font-semibold sm:text-3xl">{PREMIUM_VALUE.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {PREMIUM_VALUE.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PREMIUM_VALUE.points.map((point, i) => (
            <div
              key={i}
              className="flex gap-4 rounded-2xl border border-border/50 bg-background p-5 shadow-sm"
            >
              <div className="shrink-0 text-2xl">{point.icon}</div>
              <div>
                <h3 className="mb-1 text-sm font-semibold">{point.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{point.desc}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
