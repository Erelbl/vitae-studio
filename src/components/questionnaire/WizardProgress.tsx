"use client";

import { QUESTIONNAIRE_STEPS } from "@/types/questionnaire";

interface Props {
  currentStep: number; // 0-indexed
  stepCompletion?: boolean[]; // per-step validity
  onStepClick?: (step: number) => void;
}

export function WizardProgress({ currentStep, stepCompletion, onStepClick }: Props) {
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
        {QUESTIONNAIRE_STEPS.map((_, i) => {
          const isComplete = stepCompletion?.[i] ?? false;
          const isCurrent = i === currentStep;
          const isPast = i < currentStep;
          const clickable = onStepClick && i !== currentStep;

          let segmentColor: string;
          if (isCurrent) {
            segmentColor = "bg-primary/50";
          } else if (isPast && !isComplete) {
            segmentColor = "bg-amber-400";
          } else if (isPast && isComplete) {
            segmentColor = "bg-primary";
          } else {
            segmentColor = "bg-border";
          }

          return (
            <div
              key={i}
              title={QUESTIONNAIRE_STEPS[i].label}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${segmentColor} ${
                clickable ? "cursor-pointer hover:opacity-70" : ""
              }`}
              onClick={() => clickable && onStepClick(i)}
            />
          );
        })}
      </div>

      {/* Incomplete steps warning */}
      {stepCompletion && currentStep > 0 && (
        (() => {
          const incompleteVisited = stepCompletion
            .slice(0, currentStep)
            .some((complete) => !complete);
          return incompleteVisited ? (
            <p className="mt-2 text-xs text-amber-600">
              יש שלבים קודמים עם שדות חובה חסרים (מסומנים בצהוב)
            </p>
          ) : null;
        })()
      )}
    </div>
  );
}
