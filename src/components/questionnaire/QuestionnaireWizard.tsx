"use client";

import { useState } from "react";
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

interface Props {
  orderId: string;
  token: string;
  initialData?: Record<string, unknown>;
}

const TOTAL_STEPS = 9;

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
        router.push(`/order/${orderId}/photos?token=${token}`);
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

  const stepProps = {
    defaultValues: allData,
    onSubmit: handleStepSubmit,
    onBack: handleBack,
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:py-10">
      {/* Intro notice – visible on first step */}
      {currentStep === 0 && (
        <div className="mb-5 rounded-xl border border-border/50 bg-muted/40 px-4 py-3 text-sm text-muted-foreground leading-relaxed">
          השאלון כולל מספר שאלות חובה וכמה שאלות רשות.
          <br />
          ככל שתשתפו יותר פרטים – כך נוכל ליצור סיפור אישי ומרגש יותר.
        </div>
      )}

      <WizardProgress currentStep={currentStep} />

      {/* Form card */}
      <div
        key={currentStep}
        className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8"
      >
        {currentStep === 0 && (
          <Step1Introduction
            defaultValues={allData}
            onSubmit={handleStepSubmit}
          />
        )}
        {currentStep === 1 && <Step2ChildhoodRoots {...stepProps} />}
        {currentStep === 2 && <Step3Milestones {...stepProps} />}
        {currentStep === 3 && <Step4FamilyLove {...stepProps} />}
        {currentStep === 4 && <Step5Personality {...stepProps} />}
        {currentStep === 5 && <Step6SpecialMoments {...stepProps} />}
        {currentStep === 6 && <Step7Legacy {...stepProps} />}
        {currentStep === 7 && <Step8Blessing {...stepProps} />}
        {currentStep === 8 && (
          <Step9BuyerDetails
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
