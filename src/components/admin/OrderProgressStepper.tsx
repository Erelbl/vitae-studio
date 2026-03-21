"use client";

interface ProgressStep {
  label: string;
  completed: boolean;
  timestamp?: string | null;
}

function fmtDate(ts: string) {
  return new Date(ts).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderProgressStepper({
  paymentStatus,
  previewStatus,
  previewApprovedAt,
  paymentDate,
  sentToPrintAt,
  shippedToCustomerAt,
  completedAt,
}: {
  paymentStatus?: string | null;
  previewStatus?: string | null;
  previewApprovedAt?: string | null;
  paymentDate?: string | null;
  sentToPrintAt?: string | null;
  shippedToCustomerAt?: string | null;
  completedAt?: string | null;
}) {
  const steps: ProgressStep[] = [
    {
      label: "התקבל תשלום",
      completed: paymentStatus === "paid",
      timestamp: paymentDate,
    },
    {
      label: "אושר על ידי הלקוח",
      completed: previewStatus === "approved",
      timestamp: previewApprovedAt,
    },
    {
      label: "נשלח להדפסה",
      completed: !!sentToPrintAt,
      timestamp: sentToPrintAt,
    },
    {
      label: "נשלח ללקוח",
      completed: !!shippedToCustomerAt,
      timestamp: shippedToCustomerAt,
    },
    {
      label: "הושלם",
      completed: !!completedAt,
      timestamp: completedAt,
    },
  ];

  return (
    <div className="flex items-start gap-0 overflow-x-auto py-1">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <div key={step.label} className="flex items-start shrink-0">
            {/* Step */}
            <div className="flex flex-col items-center gap-1 min-w-[80px]">
              {/* Circle */}
              <div
                className={`h-7 w-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                  step.completed
                    ? "border-green-500 bg-green-500 text-white"
                    : "border-gray-300 bg-white text-gray-400"
                }`}
              >
                {step.completed ? "✓" : i + 1}
              </div>
              {/* Label */}
              <span
                className={`text-[11px] text-center leading-tight max-w-[90px] ${
                  step.completed
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
              {/* Timestamp */}
              {step.completed && step.timestamp && (
                <span className="text-[10px] text-muted-foreground">
                  {fmtDate(step.timestamp)}
                </span>
              )}
            </div>
            {/* Connector */}
            {!isLast && (
              <div className="flex items-center pt-3 px-1">
                <div
                  className={`h-0.5 w-6 ${
                    step.completed ? "bg-green-400" : "bg-gray-200"
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
