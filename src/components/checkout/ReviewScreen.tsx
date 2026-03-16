"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getQuestionnaireSections } from "@/lib/questionnaire-fields";
import type { AlbumType } from "@/questionnaires/types";

interface Props {
  orderId: string;
  token: string;
  personName: string;
  buyerName: string;
  responses: Record<string, unknown>;
  albumType?: AlbumType;
}

function resolveDisplay(value: unknown, displayValues?: Record<string, string>): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return displayValues?.[raw] ?? raw;
}

export function ReviewScreen({ orderId, token, personName, responses, albumType = "single" }: Props) {
  const router = useRouter();

  const sections = getQuestionnaireSections(albumType);

  // Only render sections that have at least one filled field
  const filledSections = sections.map((section) => ({
    ...section,
    fields: section.fields.filter((f) => {
      const val = responses[f.key];
      return val !== undefined && val !== null && String(val).trim().length > 0;
    }),
  })).filter((s) => s.fields.length > 0);

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:max-w-2xl sm:px-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">
          סיכום השאלון
          {personName ? ` — ${personName}` : ""}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          עיינו בתשובות לפני שממשיכים. לעריכה — חזרו לשאלון.
        </p>
      </div>

      {/* Read-only Q&A grouped by section */}
      <div className="space-y-6">
        {filledSections.map((section) => (
          <div
            key={section.title}
            className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
          >
            <h2 className="mb-4 text-base font-semibold text-foreground/90">
              {section.title}
            </h2>
            <dl className="space-y-3">
              {section.fields.map((field) => {
                const display = resolveDisplay(responses[field.key], field.displayValues);
                return (
                  <div key={field.key}>
                    <dt className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </dt>
                    <dd className="mt-0.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                      {display}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}

        {filledSections.length === 0 && (
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-8 text-center text-muted-foreground">
            לא נמצאו תשובות שמורות.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row-reverse">
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
          חזרה לשאלון
        </Button>
      </div>
    </div>
  );
}
