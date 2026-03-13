import { FadeIn } from "@/components/home/FadeIn";
import { PACKAGES } from "@/content/landing-content";

export function PackagesSection() {
  return (
    <section className="bg-background px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">

        <FadeIn>
          <div className="mb-10 text-center">
            <span className="mb-3 inline-block text-sm font-medium text-primary">
              {PACKAGES.sectionLabel}
            </span>
            <h2 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">{PACKAGES.title}</h2>
            <p className="mt-2 text-base text-muted-foreground sm:text-lg">
              {PACKAGES.subtitle}
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {PACKAGES.items.map((pkg, i) => (
            <FadeIn key={i} delay={i * 80}>
              <div
                className={`relative flex h-full flex-col rounded-2xl p-8 transition-shadow ${
                  pkg.featured
                    ? "bg-primary/10 ring-2 ring-primary/40 shadow-lg"
                    : "border border-border/40 bg-secondary/40"
                }`}
              >
                {pkg.featured && (
                  <span className="mb-4 inline-block self-start rounded-full bg-primary/20 px-3 py-1 text-sm font-medium text-primary">
                    הכי משתלם
                  </span>
                )}

                <h3 className="mb-3 text-lg font-semibold leading-snug">{pkg.title}</h3>
                <p className="mb-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {pkg.description}
                </p>

                <div className="mt-auto">
                  <p
                    className={`text-3xl font-bold tracking-tight ${
                      pkg.featured ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {pkg.price}
                  </p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

      </div>
    </section>
  );
}
