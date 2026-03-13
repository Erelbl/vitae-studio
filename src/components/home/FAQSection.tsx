"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FadeIn } from "@/components/home/FadeIn";
import { FAQ } from "@/content/landing-content";

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="bg-secondary/30 px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl">

        <FadeIn>
          <div className="mb-14 text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">{FAQ.title}</h2>
          </div>
        </FadeIn>

        <FadeIn>
          <div className="divide-y divide-border/50 rounded-2xl border border-border/50 bg-background">
            {FAQ.items.map((item, i) => {
              const isOpen = openIndex === i;
              return (
                <div key={i}>
                  <button
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-start transition-colors hover:bg-secondary/30"
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    aria-expanded={isOpen}
                  >
                    <span className="font-medium leading-snug sm:text-lg">{item.q}</span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-primary/70 transition-transform duration-300 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {/* Smooth height animation via max-height transition */}
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isOpen ? "max-h-64" : "max-h-0"
                    }`}
                  >
                    <p className="px-6 pb-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
                      {item.a}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </FadeIn>

      </div>
    </section>
  );
}
