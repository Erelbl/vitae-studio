"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Check, BookOpen, Film, Sparkles } from "lucide-react";
import type { DeliveryMode } from "@/types/order";

interface Props {
  orderId: string;
  token: string;
  initialDeliveryMode?: DeliveryMode | null;
}

interface ProductOption {
  mode: DeliveryMode;
  title: string;
  description: string;
  priceLabel: string;
  icon: React.ReactNode;
  inclusions: string[];
  featured?: boolean;
  badge?: string;
}

const PRODUCTS: ProductOption[] = [
  {
    mode: "print",
    title: "אלבום פיזי מודפס",
    description: "אלבום מודפס על נייר צילום קשיח בכריכה קשיחה",
    priceLabel: "החל מ־₪2,500",
    icon: <BookOpen size={24} />,
    inclusions: [
      "שאלון אישי מעמיק",
      "כתיבת טקסט בחרוזים עבריים",
      "עד 40 עמודי איור בצבעי מים",
      "אישור גרסה לפני הדפסה",
      "משלוח עד הבית",
    ],
  },
  {
    mode: "bundle",
    title: "אלבום פיזי + סרט",
    description: "הכל בחבילה אחת — אלבום מודפס וסרט עם קריינות",
    priceLabel: "החל מ־₪3,750",
    icon: <Sparkles size={24} />,
    featured: true,
    badge: "הכי משתלם",
    inclusions: [
      "כל מה שבאלבום +",
      "עריכת וידאו עם הנפשות עדינות",
      "קריינות מקצועית",
      "קובץ וידאו להורדה ולשיתוף",
    ],
  },
  {
    mode: "film",
    title: "סרט עם קריינות",
    description: "סרטון מונפש עם קריינות מקצועית ואיורים בצבעי מים",
    priceLabel: "₪2,200",
    icon: <Film size={24} />,
    inclusions: [
      "שאלון אישי מעמיק",
      "כתיבת תסריט בחרוזים עבריים",
      "הנפשה עדינה של תמונות",
      "קריינות מקצועית",
      "קובץ לשיתוף ברשתות",
    ],
  },
];

export function ProductSelection({ orderId, token, initialDeliveryMode }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<DeliveryMode | null>(
    initialDeliveryMode ?? null
  );
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    if (!selected) {
      toast.error("יש לבחור מוצר");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/orders/${orderId}/checkout?token=${token}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            delivery_mode: selected,
            // Clear album_size when switching to film
            album_size: selected === "film" ? null : undefined,
          }),
        }
      );

      if (!res.ok) throw new Error("שגיאה בשמירה");

      router.push(`/order/${orderId}/configure?token=${token}`);
    } catch {
      toast.error("שגיאה בשמירת הבחירה. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:max-w-3xl sm:px-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">
          איך תרצו לקבל את הסיפור שלכם?
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          בחרו את הפורמט המועדף עליכם
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {PRODUCTS.map((product) => {
          const isSelected = selected === product.mode;

          return (
            <button
              key={product.mode}
              type="button"
              onClick={() => setSelected(product.mode)}
              className={`relative flex flex-col rounded-2xl text-start transition-all ${
                isSelected
                  ? "ring-2 ring-primary shadow-lg scale-[1.02]"
                  : product.featured
                    ? "ring-2 ring-primary/25 shadow-md"
                    : "border border-border/50 shadow-sm"
              } ${
                product.featured ? "bg-primary/5" : "bg-card"
              } hover:shadow-md`}
            >
              {/* Badge */}
              {product.badge && (
                <span className="absolute -top-3 start-4 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                  {product.badge}
                </span>
              )}

              {/* Header */}
              <div className="px-5 pt-6 pb-3">
                <div
                  className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {product.icon}
                </div>
                <h3 className="text-lg font-semibold leading-snug">
                  {product.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {product.description}
                </p>
              </div>

              {/* Divider */}
              <div className="mx-5 border-t border-border/40" />

              {/* Inclusions */}
              <div className="flex-1 px-5 py-4">
                <ul className="space-y-2">
                  {product.inclusions.map((line, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check
                        size={14}
                        className={`mt-0.5 shrink-0 ${
                          isSelected ? "text-primary" : "text-primary/50"
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

              {/* Price */}
              <div className="mx-5 mb-5 border-t border-border/30 pt-4">
                <p
                  className={`text-2xl font-bold tracking-tight ${
                    isSelected ? "text-primary" : "text-foreground"
                  }`}
                >
                  {product.priceLabel}
                </p>
              </div>

              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-3 end-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check size={14} strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Continue */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row-reverse">
        <Button
          size="lg"
          className="flex-1 rounded-xl text-base"
          disabled={!selected || saving}
          onClick={handleContinue}
        >
          {saving ? "שומר..." : "המשך"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="flex-1 rounded-xl text-base"
          onClick={() =>
            router.push(`/order/${orderId}/review?token=${token}`)
          }
        >
          חזרה
        </Button>
      </div>
    </div>
  );
}
