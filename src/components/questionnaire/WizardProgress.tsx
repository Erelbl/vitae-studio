"use client";

import { QUESTIONNAIRE_STEPS } from "@/types/questionnaire";

interface Props {
  currentStep: number; // 0-indexed
}

export function WizardProgress({ currentStep }: Props) {
  const total = QUESTIONNAIRE_STEPS.length;

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>{QUESTIONNAIRE_STEPS[currentStep].label}</span>
        <span>
          שלב {currentStep + 1} מתוך {total}
        </span>
      </div>
      <div className="flex gap-1">
        {QUESTIONNAIRE_STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= currentStep ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
