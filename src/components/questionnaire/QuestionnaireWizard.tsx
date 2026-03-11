"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WizardProgress } from "./WizardProgress";
import { StepAbout } from "./steps/StepAbout";
import { StepChildhood } from "./steps/StepChildhood";
import { StepYouth } from "./steps/StepYouth";
import { StepCareer } from "./steps/StepCareer";
import { StepFamily } from "./steps/StepFamily";
import { StepCharacter } from "./steps/StepCharacter";
import { StepSpecial } from "./steps/StepSpecial";
import { StepBuyer } from "./steps/StepBuyer";

interface Props {
  orderId: string;
  token: string;
  initialData?: Record<string, unknown>;
}

const TOTAL_STEPS = 8;

export function QuestionnaireWizard({ orderId, token, initialData = {} }: Props) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [allData, setAllData] = useState<Record<string, unknown>>(initialData);
  const [submitting, setSubmitting] = useState(false);

  async function saveStep(
    stepData: Record<string, unknown>,
    isComplete: boolean
  ) {
    const merged = { ...allData, ...stepData };
    setAllData(merged);

    const res = await fetch(`/api/orders/${orderId}/questionnaire`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responses: merged, isComplete }),
    });

    if (!res.ok) {
      throw new Error("שגיאה בשמירה");
    }

    return merged;
  }

  async function handleStepSubmit(stepData: Record<string, unknown>) {
    const isLast = currentStep === TOTAL_STEPS - 1;
    setSubmitting(true);
    try {
      await saveStep(stepData, isLast);
      if (isLast) {
        router.push(`/order/${orderId}/followup?token=${token}`);
      } else {
        setCurrentStep((s) => s + 1);
      }
    } catch {
      toast.error("שגיאה בשמירת הנתונים. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    setCurrentStep((s) => s - 1);
  }

  // Each step receives the accumulated data as defaultValues so navigating
  // back shows previously entered values.
  const stepProps = {
    defaultValues: allData,
    onSubmit: handleStepSubmit,
    onBack: handleBack,
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:py-10">
      <WizardProgress currentStep={currentStep} />

      {/* Form card */}
      <div
        key={currentStep}
        className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8"
      >
        {currentStep === 0 && (
          <StepAbout
            defaultValues={allData}
            onSubmit={handleStepSubmit}
          />
        )}
        {currentStep === 1 && <StepChildhood {...stepProps} />}
        {currentStep === 2 && <StepYouth {...stepProps} />}
        {currentStep === 3 && <StepCareer {...stepProps} />}
        {currentStep === 4 && <StepFamily {...stepProps} />}
        {currentStep === 5 && <StepCharacter {...stepProps} />}
        {currentStep === 6 && <StepSpecial {...stepProps} />}
        {currentStep === 7 && (
          <StepBuyer
            defaultValues={allData}
            onSubmit={handleStepSubmit}
            onBack={handleBack}
            submitting={submitting}
          />
        )}
      </div>
    </div>
  );
}
