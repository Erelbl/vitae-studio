"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WizardProgress } from "./WizardProgress";
import { QuestionnaireStep } from "./QuestionnaireStep";
import { getQuestionnaireConfig, buildAllSchemas } from "@/questionnaires";
import type { AlbumType } from "@/questionnaires/types";

interface Props {
  orderId: string;
  token: string;
  albumType: AlbumType;
  initialData?: Record<string, unknown>;
  initialStep?: number;
}

const DRAFT_STORAGE_KEY = "vitae_draft";

export function QuestionnaireWizard({
  orderId,
  token,
  albumType,
  initialData = {},
  initialStep = 0,
}: Props) {
  const router = useRouter();

  const config = useMemo(() => getQuestionnaireConfig(albumType), [albumType]);
  const { stepSchemas, fullSchema } = useMemo(() => buildAllSchemas(config.steps), [config]);
  const totalSteps = config.steps.length;

  const [currentStep, setCurrentStep] = useState(initialStep);
  const [allData, setAllData] = useState<Record<string, unknown>>(initialData);
  const [submitting, setSubmitting] = useState(false);

  // Store draft pointer in localStorage for resume from same browser
  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({ orderId, token, updatedAt: new Date().toISOString() })
      );
    } catch { /* localStorage unavailable */ }
  }, [orderId, token]);

  // Compute per-step validity against stored allData
  const stepCompletion = stepSchemas.map((schema) => schema.safeParse(allData).success);

  const persist = useCallback(async (merged: Record<string, unknown>, isComplete: boolean, step?: number) => {
    const res = await fetch(`/api/orders/${orderId}/questionnaire?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responses: merged, isComplete, currentStep: step }),
    });
    if (!res.ok) throw new Error("שגיאה בשמירה");
  }, [orderId, token]);

  // Free navigation: save current step data and advance — no validation gate
  async function handleNavigate(stepData: Record<string, unknown>) {
    const merged = { ...allData, ...stepData };
    setAllData(merged);
    setSubmitting(true);
    try {
      const nextStep = currentStep + 1;
      await persist(merged, false, nextStep);
      setCurrentStep(nextStep);
    } catch {
      toast.error("שגיאה בשמירת הנתונים. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  // Final submission: validate the full dataset to catch missing required fields from earlier steps.
  async function handleFinalSubmit(stepData: Record<string, unknown>) {
    const merged = { ...allData, ...stepData };
    setAllData(merged);

    const result = fullSchema.safeParse(merged);
    if (!result.success) {
      // Find the first incomplete step and navigate there
      const firstIncomplete = stepCompletion.findIndex((ok) => !ok);
      const targetStep = firstIncomplete >= 0 ? firstIncomplete : 0;
      toast.error("יש שדות חובה חסרים בשלבים קודמים. אנא השלימו אותם לפני שליחה.", {
        duration: 5000,
      });
      setCurrentStep(targetStep);
      return;
    }

    setSubmitting(true);
    try {
      await persist(merged, true, totalSteps);
      // Clear draft pointer — questionnaire is complete
      try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* ok */ }
      router.push(`/order/${orderId}/review?token=${token}`);
    } catch {
      toast.error("שגיאה בשמירת הנתונים. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    setCurrentStep((s) => s - 1);
  }

  function handleStepClick(step: number) {
    setCurrentStep(step);
  }

  const currentStepConfig = config.steps[currentStep];
  const currentSchema = stepSchemas[currentStep];
  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:max-w-2xl sm:px-8 sm:py-10">
      {/* Intro notice – visible on first step */}
      {currentStep === 0 && (
        <div className="mb-5 rounded-xl border border-border/50 bg-muted/40 px-4 py-3 text-sm text-muted-foreground leading-relaxed sm:text-base">
          ניתן לנוע בין השלבים בחופשיות, ככל שתספרו לנו יותר פרטים, אנחנו נוכל לכתוב את הסיפור שלכם כך שיהיה אישי ומרגש
        </div>
      )}

      {/* Autosave indicator */}
      <div className="mb-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500/60" />
        ההתקדמות שלך נשמרת אוטומטית
      </div>

      <WizardProgress
        currentStep={currentStep}
        stepCompletion={stepCompletion}
        onStepClick={handleStepClick}
        stepLabels={config.steps.map((s) => s.label)}
      />

      {/* Form card */}
      <div
        key={currentStep}
        className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-10 sm:text-lg"
      >
        <QuestionnaireStep
          config={currentStepConfig}
          schema={currentSchema}
          defaultValues={allData}
          onNavigate={handleNavigate}
          onBack={currentStep > 0 ? handleBack : undefined}
          isLast={isLastStep}
          onSubmit={handleFinalSubmit}
          submitting={submitting}
        />
      </div>
    </div>
  );
}
