import Link from "next/link";
import { Check } from "lucide-react";

const TIMELINE = [
  { label: "השאלון נשלח", done: true },
  { label: "התשלום התקבל", done: true },
  { label: "אנחנו מתחילים לבנות את הסיפור שלך", done: false },
  { label: "ניצור איתך קשר להמשך התהליך", done: false },
];

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16">
      <div className="mx-auto w-full max-w-md">

        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
            <Check size={30} className="text-primary" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            הזמנתך נקלטה בהצלחה
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            תודה רבה! אנחנו שמחים להתחיל לעבוד על הסיפור שלך.
          </p>
        </div>

        {/* Timeline */}
        <div className="mt-10 rounded-2xl border border-border/50 bg-card px-7 py-6 shadow-sm">
          <p className="mb-6 text-sm font-medium text-muted-foreground">המסע שלנו יחד</p>
          <div className="space-y-0">
            {TIMELINE.map((step, i) => {
              const isLast = i === TIMELINE.length - 1;
              return (
                <div key={i} className="flex gap-4">
                  {/* Icon + connector */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm transition-colors ${
                        step.done
                          ? "bg-primary text-primary-foreground"
                          : "border border-border/60 bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      {step.done ? (
                        <Check size={13} strokeWidth={2.5} />
                      ) : (
                        <span className="text-xs">{i + 1}</span>
                      )}
                    </div>
                    {!isLast && (
                      <div
                        className={`my-1 w-px flex-1 ${
                          step.done ? "bg-primary/30" : "bg-border/40"
                        }`}
                        style={{ minHeight: "1.5rem" }}
                      />
                    )}
                  </div>

                  {/* Label */}
                  <p
                    className={`pb-6 pt-0.5 text-base leading-snug last:pb-0 ${
                      step.done ? "font-medium text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-3 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            חזרה לאתר
          </Link>
          {orderId && (
            <p className="mt-4 text-xs text-muted-foreground/50">
              מספר הזמנה: {orderId}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
