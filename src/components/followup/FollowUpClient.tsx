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
          // (shouldn't happen here since needsGeneration=false in that case)
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

  function handleContinue() {
    router.push(`/order/${orderId}/photos?token=${token}`);
  }

  if (generating) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-lg text-muted-foreground">
          מכינים שאלות המשך מותאמות אישית...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-2 font-serif text-3xl font-bold">שאלות המשך</h1>
      <p className="mb-8 text-muted-foreground">
        על בסיס מה שסיפרתם, הכנו כמה שאלות שיעזרו לנו להכיר טוב יותר.
        ניתן גם לדלג ולהמשיך.
      </p>

      {generationError && (
        <p className="mb-6 rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
          לא הצלחנו לייצר שאלות הפעם — תוכלו להמשיך ישירות להעלאת תמונות.
        </p>
      )}

      {questions.length > 0 ? (
        <div className="space-y-6">
          {questions.map((qa, i) => (
            <div key={i} className="space-y-2">
              <Label htmlFor={`q-${i}`} className="text-base font-medium">
                {qa.question}
              </Label>
              <Textarea
                id={`q-${i}`}
                value={qa.answer}
                onChange={(e) => handleAnswerChange(i, e.target.value)}
                placeholder="תשובתכם כאן (אופציונלי)..."
                rows={3}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md bg-muted px-4 py-8 text-center text-muted-foreground">
          אין שאלות המשך כרגע.
        </div>
      )}

      <div className="mt-8 flex justify-start">
        <Button onClick={handleContinue}>המשיכו להעלאת תמונות</Button>
      </div>
    </div>
  );
}
