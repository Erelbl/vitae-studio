"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface Props {
  orderId: string;
  token: string;
  personName: string;
  buyerName: string;
  responses: Record<string, unknown>;
}

const REVIEW_SECTIONS = [
  { key: "person_name", label: "שם" },
  { key: "nickname", label: "כינוי" },
  { key: "person_birth_date", label: "תאריך לידה" },
  { key: "person_birth_city", label: "עיר לידה" },
  { key: "childhood_city", label: "עיר ילדות" },
  { key: "profession", label: "מקצוע" },
  { key: "partner", label: "בן/בת זוג" },
  { key: "children", label: "ילדים" },
  { key: "personality_traits", label: "תכונות אופי" },
  { key: "blessing_wish", label: "ברכה" },
] as const;

export function ReviewScreen({ orderId, token, personName, responses }: Props) {
  const router = useRouter();

  const filledCount = REVIEW_SECTIONS.filter(
    (s) => responses[s.key] && String(responses[s.key]).trim().length > 0
  ).length;

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:max-w-2xl sm:px-8">
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-green-50 px-4 py-1.5 text-sm font-medium text-green-700">
          <Check size={16} />
          השאלון הושלם בהצלחה
        </div>
        <h1 className="text-2xl font-semibold sm:text-3xl">
          הסיפור של {personName || "היקר/ה שלכם"} בדרך
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          מילאתם {filledCount} מתוך {REVIEW_SECTIONS.length} שדות עיקריים.
          עכשיו בואו נבחר איך תרצו לקבל את הסיפור.
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-8 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-medium">תקציר הפרטים</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {REVIEW_SECTIONS.map((section) => {
            const value = responses[section.key];
            const text = value ? String(value).trim() : "";
            if (!text) return null;
            return (
              <div
                key={section.key}
                className="rounded-lg bg-muted/40 px-3 py-2"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {section.label}
                </span>
                <p className="mt-0.5 text-sm leading-relaxed line-clamp-2">
                  {text}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit / Continue */}
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button
          size="lg"
          className="flex-1 rounded-xl text-base"
          onClick={() =>
            router.push(`/order/${orderId}/select-product?token=${token}`)
          }
        >
          המשך לבחירת מוצר
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="flex-1 rounded-xl text-base"
          onClick={() =>
            router.push(`/order/${orderId}/questionnaire?token=${token}`)
          }
        >
          חזרה לעריכה
        </Button>
      </div>
    </div>
  );
}
