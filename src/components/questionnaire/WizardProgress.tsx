"use client";

import { QUESTIONNAIRE_STEPS } from "@/types/questionnaire";

interface Props {
  currentStep: number; // 0-indexed
}

export function WizardProgress({ currentStep }: Props) {
  const total = QUESTIONNAIRE_STEPS.length;

  return (
    <div className="mb-6">
      {/* Step label and counter */}
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-base font-semibold text-foreground">
          {QUESTIONNAIRE_STEPS[currentStep].label}
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {currentStep + 1} / {total}
        </span>
      </div>

      {/* Progress segments */}
      <div className="flex gap-1">
        {QUESTIONNAIRE_STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < currentStep
                ? "bg-primary"
                : i === currentStep
                ? "bg-primary/50"
                : "bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
