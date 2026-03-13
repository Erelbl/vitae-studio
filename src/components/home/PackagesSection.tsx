import { Check } from "lucide-react";
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
            <h2 className="text-3xl font-semibold sm:text-4xl">{PACKAGES.title}</h2>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              {PACKAGES.subtitle}
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {PACKAGES.items.map((pkg, i) => (
            <FadeIn key={i} delay={i * 80}>
              <div
                className={`relative flex h-full flex-col rounded-2xl transition-shadow ${
                  pkg.featured
                    ? "bg-primary/10 ring-2 ring-primary/35 shadow-xl"
                    : "border border-border/50 bg-secondary/30 shadow-sm"
                }`}
              >
                {/* Card header */}
                <div className={`px-7 pt-7 pb-5 ${pkg.featured ? "pb-5" : ""}`}>
                  {pkg.featured && (
                    <span className="mb-4 inline-block rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
                      הכי משתלם
                    </span>
                  )}
                  <h3 className="text-xl font-semibold leading-snug">{pkg.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {pkg.description}
                  </p>
                </div>

                {/* Divider */}
                <div className="mx-7 border-t border-border/40" />

                {/* Inclusions — placeholder rows for package details */}
                <div className="flex-1 px-7 py-5">
                  <ul className="space-y-2.5">
                    {pkg.inclusions.map((line, li) => (
                      <li key={li} className="flex items-start gap-2.5">
                        <Check
                          size={15}
                          className={`mt-0.5 shrink-0 ${
                            pkg.featured ? "text-primary" : "text-primary/50"
                          }`}
                          strokeWidth={2.5}
                        />
                        <span className="text-sm leading-relaxed text-foreground/80">
                          {line}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Price footer */}
                <div
                  className={`mx-7 mb-7 mt-2 border-t pt-5 ${
                    pkg.featured ? "border-primary/20" : "border-border/40"
                  }`}
                >
                  <p
                    className={`text-4xl font-bold tracking-tight ${
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
