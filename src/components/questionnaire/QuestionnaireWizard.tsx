"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WizardProgress } from "./WizardProgress";
import { Step1Introduction } from "./steps/Step1Introduction";
import { Step2ChildhoodRoots } from "./steps/Step2ChildhoodRoots";
import { Step3Milestones } from "./steps/Step3Milestones";
import { Step4FamilyLove } from "./steps/Step4FamilyLove";
import { Step5Personality } from "./steps/Step5Personality";
import { Step6SpecialMoments } from "./steps/Step6SpecialMoments";
import { Step7Legacy } from "./steps/Step7Legacy";
import { Step8Blessing } from "./steps/Step8Blessing";
import { Step9BuyerDetails } from "./steps/Step9BuyerDetails";
import { STEP_SCHEMAS, fullQuestionnaireSchema } from "@/lib/validation/questionnaire";

interface Props {
  orderId: string;
  token: string;
  initialData?: Record<string, unknown>;
  initialStep?: number;
}

const TOTAL_STEPS = 9;
const DRAFT_STORAGE_KEY = "vitae_draft";

export function QuestionnaireWizard({ orderId, token, initialData = {}, initialStep = 0 }: Props) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [allData, setAllData] = useState<Record<string, unknown>>(initialData);
  const [submitting, setSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

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
  const stepCompletion = STEP_SCHEMAS.map((schema) => schema.safeParse(allData).success);

  const persist = useCallback(async (merged: Record<string, unknown>, isComplete: boolean, step?: number) => {
    const res = await fetch(`/api/orders/${orderId}/questionnaire?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responses: merged, isComplete, currentStep: step }),
    });
    if (!res.ok) throw new Error("שגיאה בשמירה");
    setLastSaved(new Date());
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

  // Final submission: step 9 already validated its own fields via handleSubmit.
  // Here we also validate the full dataset to catch missing required fields from earlier steps.
  async function handleFinalSubmit(stepData: Record<string, unknown>) {
    const merged = { ...allData, ...stepData };
    setAllData(merged);

    const result = fullQuestionnaireSchema.safeParse(merged);
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
      await persist(merged, true, TOTAL_STEPS);
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

  const navProps = {
    defaultValues: allData,
    onBack: handleBack,
  };

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
      />

      {/* Form card */}
      <div
        key={currentStep}
        className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-10 sm:text-lg"
      >
        {currentStep === 0 && (
          <Step1Introduction
            defaultValues={allData}
            onNavigate={handleNavigate}
          />
        )}
        {currentStep === 1 && (
          <Step2ChildhoodRoots {...navProps} onNavigate={handleNavigate} />
        )}
        {currentStep === 2 && (
          <Step3Milestones {...navProps} onNavigate={handleNavigate} />
        )}
        {currentStep === 3 && (
          <Step4FamilyLove {...navProps} onNavigate={handleNavigate} />
        )}
        {currentStep === 4 && (
          <Step5Personality {...navProps} onNavigate={handleNavigate} />
        )}
        {currentStep === 5 && (
          <Step6SpecialMoments {...navProps} onNavigate={handleNavigate} />
        )}
        {currentStep === 6 && (
          <Step7Legacy {...navProps} onNavigate={handleNavigate} />
        )}
        {currentStep === 7 && (
          <Step8Blessing {...navProps} onNavigate={handleNavigate} />
        )}
        {currentStep === 8 && (
          <Step9BuyerDetails
            defaultValues={allData}
            onSubmit={handleFinalSubmit}
            onBack={handleBack}
            submitting={submitting}
          />
        )}
      </div>
    </div>
  );
}
