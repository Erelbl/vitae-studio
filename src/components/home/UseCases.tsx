import { Cake, Leaf, Heart, Users, Flame, GraduationCap } from "lucide-react";
import { FadeIn } from "@/components/home/FadeIn";
import { USE_CASES } from "@/content/landing-content";

// Line-style icons mapped by index — color #757D65 per design spec
const ICONS = [Cake, Leaf, Heart, Users, Flame, GraduationCap];
const ICON_COLOR = "#757D65";

export function UseCases() {
  const { cases } = USE_CASES;

  return (
    <section className="bg-secondary/30 px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">

        <FadeIn>
          <div className="mb-10 text-center">
            <span className="mb-3 inline-block text-sm font-medium text-primary">
              {USE_CASES.sectionLabel}
            </span>
            <h2 className="text-3xl font-semibold sm:text-4xl">{USE_CASES.title}</h2>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              {USE_CASES.subtitle}
            </p>
          </div>
        </FadeIn>

        {/* 2-col editorial list — 6 items = clean 3 rows */}
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-16">
          {cases.map((c, i) => {
            const Icon = ICONS[i] ?? Cake;

            return (
              <FadeIn key={i} delay={i * 80}>
                <div className="flex items-start gap-4 border-b border-border/40 py-6 last:border-0 sm:[&:nth-last-child(2)]:border-0">
                  <Icon
                    size={22}
                    color={ICON_COLOR}
                    strokeWidth={1.5}
                    className="mt-1 shrink-0"
                  />
                  <div>
                    {/* h3 explicitly larger than body so hierarchy is clear */}
                    <h3 className="mb-1.5 text-lg font-semibold leading-snug">{c.title}</h3>
                    <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{c.desc}</p>
                  </div>
                </div>
              </FadeIn>
            );
          })}
        </div>

      </div>
    </section>
  );
}
