"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/home/FadeIn";
import { PACKAGES } from "@/content/landing-content";

type Size = "25" | "30";

const GROW_LINKS = {
  video: "https://pay.grow.link/3124b214459eaf03d8c8fe0fea30af52-MzIwNDQxNg",
  album_25: "https://pay.grow.link/edbae41148bcea53b9220052c2c657d7-MzIwNDQxNA",
  album_30: "https://pay.grow.link/1c899426bbe840a727903f48557fb570-MzIwNDQxNQ",
  combo_25: "https://pay.grow.link/edbe3fab6cb50f2b4dc9c9e67daa253d-MzIwNDQxOA",
  combo_30: "https://pay.grow.link/9f22c34647fc749b1c6b0f9c90c170ba-MzIwNDQxOQ",
};

const ITEMS = [
  {
    id: "video" as const,
    title: "סרטון סיפור חיים בחרוזים",
    description: "הסיפור שלכם מתעורר לחיים עם קריינות מקצועית, מוזיקת רגע והנפשות עדינות",
    price: { "25": "₪2,000", "30": "₪2,000" },
    featured: false,
    hasSize: false,
    inclusions: [
      "שאלון אישי מעמיק",
      "התמונות שלכם הופכות לאיור ומקבלות הנפשה עדינה",
      "קריינות מקצועית",
      "קובץ להקרנה ולשיתוף ברשתות",
    ],
  },
  {
    id: "combo" as const,
    title: "חבילה משולבת",
    description: "אלבום + סרט — הכל בחבילה אחת",
    price: { "25": "₪3,780", "30": "₪4,050" },
    featured: true,
    hasSize: true,
    discountNote: "כולל 10% הנחה",
    inclusions: [
      'כל מה שב"אלבום" +',
      "עריכת וידאו עם הנפשות עדינות",
      "קריינות מקצועית",
      "קובץ וידאו להורדה ולשיתוף",
    ],
  },
  {
    id: "album" as const,
    title: "אלבום סיפור חיים בחרוזים",
    description: "החל מ-₪2,200",
    price: { "25": "₪2,200", "30": "₪2,500" },
    featured: false,
    hasSize: true,
    inclusions: [
      "שאלון אישי מעמיק",
      "כתיבת טקסט בחרוזים עבריים",
      "עד 40 עמודי איור בצבעי מים",
      "אישור גרסה לפני הדפסה",
      "משלוח עד הבית",
    ],
  },
];

function getGrowLink(id: "video" | "album" | "combo", size: Size): string {
  if (id === "video") return GROW_LINKS.video;
  if (id === "album") return size === "25" ? GROW_LINKS.album_25 : GROW_LINKS.album_30;
  return size === "25" ? GROW_LINKS.combo_25 : GROW_LINKS.combo_30;
}

export function PackagesSection() {
  const [albumSize, setAlbumSize] = useState<Size>("25");
  const [comboSize, setComboSize] = useState<Size>("25");

  function getSize(id: "video" | "album" | "combo"): Size {
    if (id === "album") return albumSize;
    if (id === "combo") return comboSize;
    return "25";
  }

  function setSize(id: "video" | "album" | "combo", size: Size) {
    if (id === "album") setAlbumSize(size);
    if (id === "combo") setComboSize(size);
  }

  function handlePay(id: "video" | "album" | "combo") {
    const size = getSize(id);
    window.location.href = getGrowLink(id, size);
  }

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
          {ITEMS.map((pkg, i) => {
            const size = getSize(pkg.id);
            return (
              <FadeIn key={pkg.id} delay={i * 80}>
                <div
                  className={`relative flex h-full flex-col rounded-2xl transition-shadow ${
                    pkg.featured
                      ? "bg-primary/10 ring-2 ring-primary/35 shadow-xl"
                      : "border border-border/50 bg-secondary/30 shadow-sm"
                  }`}
                >
                  {/* Card header */}
                  <div className="px-7 pt-7 pb-5">
                    {pkg.featured && (
                      <span className="mb-4 inline-block rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
                        הכי משתלם
                      </span>
                    )}
                    <h3 className="text-xl font-semibold leading-snug">{pkg.title}</h3>
                    <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                      {pkg.description}
                    </p>
                  </div>

                  {/* Divider */}
                  <div className="mx-7 border-t border-border/40" />

                  {/* Inclusions */}
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
                          <span className="text-base leading-relaxed text-foreground/80">
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
                    {/* Size selector */}
                    {pkg.hasSize && (
                      <div className="mb-4 flex gap-2">
                        {(["25", "30"] as Size[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => setSize(pkg.id, s)}
                            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
                              size === s
                                ? pkg.featured
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-foreground/10 text-foreground"
                                : "border border-border/50 text-muted-foreground hover:border-primary/40"
                            }`}
                          >
                            {s}×{s}
                          </button>
                        ))}
                      </div>
                    )}

                    <p
                      className={`text-4xl font-bold tracking-tight ${
                        pkg.featured ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {pkg.price[size]}
                    </p>

                    {"discountNote" in pkg && (
                      <p className="mt-1 text-sm text-primary/70">{pkg.discountNote}</p>
                    )}

                    <Button
                      className="mt-4 w-full"
                      variant={pkg.featured ? "default" : "outline"}
                      onClick={() => handlePay(pkg.id)}
                    >
                      לתשלום
                    </Button>
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
