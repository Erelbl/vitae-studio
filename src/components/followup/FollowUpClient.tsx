"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { FollowUpQA } from "@/types/questionnaire";

interface Props {
  orderId: string;
  token: string;
  initialQuestions: FollowUpQA[];
  needsGeneration: boolean;
}

export function FollowUpClient({
  orderId,
  token,
  initialQuestions,
  needsGeneration,
}: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState<FollowUpQA[]>(initialQuestions);
  const [generating, setGenerating] = useState(needsGeneration);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // If we need generation, trigger it on mount
  useEffect(() => {
    if (!needsGeneration) return;

    async function generate() {
      try {
        const res = await fetch(
          `/api/orders/${orderId}/followup?token=${token}`,
          { method: "POST" }
        );
        const data = await res.json();
        if (res.ok) {
          setQuestions(data.questions ?? []);
          if (data.generation_error) {
            setGenerationError(data.generation_error);
          }
        } else if (res.status === 409) {
          // Already enrichment_complete — questions were loaded server-side
        } else {
          setGenerationError("שגיאה ביצירת השאלות");
        }
      } catch {
        setGenerationError("שגיאת רשת");
      } finally {
        setGenerating(false);
      }
    }

    generate();
  }, [needsGeneration, orderId, token]);

  function handleAnswerChange(index: number, answer: string) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, answer } : q))
    );
  }

  async function handleContinue() {
    // Save answers before navigating (best-effort — never blocks the flow)
    try {
      await fetch(`/api/orders/${orderId}/followup?token=${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: questions }),
      });
    } catch {
      // Non-blocking
    }
    router.push(`/order/${orderId}/photos?token=${token}`);
  }

  if (generating) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:py-24">
        <div className="mx-auto mb-4 h-1.5 w-24 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/50" />
        </div>
        <p className="text-sm text-muted-foreground sm:text-base">
          מכינים שאלות המשך מותאמות אישית...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:py-10">

      {/* Page header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-semibold sm:text-3xl">שאלות המשך</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
          על בסיס מה שסיפרתם, הכנו כמה שאלות שיעזרו לנו להכיר טוב יותר.
          כל התשובות אופציונליות — ניתן לדלג ולהמשיך.
        </p>
      </div>

      {generationError && (
        <div className="mb-6 rounded-xl border border-border/50 bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          לא הצלחנו לייצר שאלות הפעם — תוכלו להמשיך ישירות להעלאת תמונות.
        </div>
      )}

      {questions.length > 0 ? (
        <div className="space-y-4">
          {questions.map((qa, i) => (
            <div
              key={i}
              className="rounded-xl border border-border/60 bg-card p-5 shadow-sm"
            >
              <Label
                htmlFor={`q-${i}`}
                className="mb-3 block text-sm font-medium leading-relaxed text-foreground"
              >
                {qa.question}
              </Label>
              <Textarea
                id={`q-${i}`}
                value={qa.answer}
                onChange={(e) => handleAnswerChange(i, e.target.value)}
                placeholder="תשובתכם כאן (אופציונלי)..."
                rows={3}
                className="resize-none"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
          אין שאלות המשך כרגע.
        </div>
      )}

      <div className="mt-8">
        <Button
          onClick={handleContinue}
          className="w-full rounded-full sm:w-auto sm:px-8"
        >
          המשיכו להעלאת תמונות
        </Button>
      </div>
    </div>
  );
}
