import { Cake, Leaf, Heart, Users, Flame } from "lucide-react";
import { FadeIn } from "@/components/home/FadeIn";
import { USE_CASES } from "@/content/landing-content";

// Line-style icons mapped by index — color #757D65 per design spec
const ICONS = [Cake, Leaf, Heart, Users, Flame];
const ICON_COLOR = "#757D65";

export function UseCases() {
  const { cases } = USE_CASES;

  return (
    <section className="bg-secondary/30 px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl">

        <FadeIn>
          <div className="mb-14 text-center">
            <span className="mb-3 inline-block text-sm font-medium text-primary">
              {USE_CASES.sectionLabel}
            </span>
            <h2 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">{USE_CASES.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base lg:text-lg">
              {USE_CASES.subtitle}
            </p>
          </div>
        </FadeIn>

        {/* 2-col editorial list. Odd last item spans full width and centers. */}
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-16">
          {cases.map((c, i) => {
            const Icon = ICONS[i] ?? Cake;
            const isLastOdd = i === cases.length - 1 && cases.length % 2 === 1;

            return (
              <FadeIn key={i} delay={i * 80}>
                <div
                  className={`flex items-start gap-4 border-b border-border/40 py-7 last:border-0 sm:[&:nth-last-child(2)]:border-0 ${
                    isLastOdd ? "sm:col-span-2 sm:mx-auto sm:max-w-sm" : ""
                  }`}
                >
                  <Icon
                    size={22}
                    color={ICON_COLOR}
                    strokeWidth={1.5}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <h3 className="mb-1.5 font-semibold leading-snug">{c.title}</h3>
                    <p className="text-base leading-relaxed text-muted-foreground">{c.desc}</p>
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
