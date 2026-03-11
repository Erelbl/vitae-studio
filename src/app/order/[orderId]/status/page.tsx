import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";
import type { OrderStatus } from "@/types/order";

// Customer can only view the album after admin explicitly publishes (approves) it.
const CUSTOMER_PREVIEW_VISIBLE_STATUSES: OrderStatus[] = [
  "approved",
  "generating_pdf",
  "delivered",
];

const CUSTOMER_STEPS: { statuses: OrderStatus[]; label: string; desc: string }[] = [
  {
    statuses: ["questionnaire_complete", "enrichment_complete"],
    label: "שאלון הושלם",
    desc: "קיבלנו את כל פרטי הסיפור",
  },
  {
    statuses: ["photos_uploaded"],
    label: "תמונות הועלו",
    desc: "התמונות שלכם הגיעו אלינו",
  },
  {
    statuses: [
      "generating_text",
      "text_ready",
      "generating_illustrations",
      "preview_ready",
      "admin_review",
      "approved",
      "revision_requested",
      "generating_pdf",
    ],
    label: "יוצרים את האלבום",
    desc: "הצוות שלנו עובד על הסיפור והאיורים",
  },
  {
    statuses: ["delivered"],
    label: "האלבום מוכן",
    desc: "האלבום שלכם מוכן לצפייה",
  },
];

function getCurrentMilestone(status: OrderStatus): number {
  for (let i = CUSTOMER_STEPS.length - 1; i >= 0; i--) {
    if ((CUSTOMER_STEPS[i].statuses as string[]).includes(status)) {
      return i;
    }
  }
  return 0;
}

export default async function StatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { orderId } = await params;
  const { token = "" } = await searchParams;

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, status, person_name, buyer_email, access_token, access_token_expires_at"
    )
    .eq("id", orderId)
    .single();

  if (!order) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center text-muted-foreground">
        הזמנה לא נמצאה.
      </div>
    );
  }

  const tokenResult = validateAccessToken(
    token,
    order.access_token as string | null,
    order.access_token_expires_at as string | null
  );

  if (!tokenResult.valid) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center text-muted-foreground">
        קישור לא תקין או שפג תוקפו.
      </div>
    );
  }

  const currentStatus = order.status as OrderStatus;
  const currentMilestone = getCurrentMilestone(currentStatus);
  const personName = (order.person_name as string) || "היקר/ה";
  const buyerEmail = order.buyer_email as string | null;

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:py-20">

      {/* Confirmation header */}
      <div className="mb-8 text-center">
        {/* Decorative check mark */}
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <span className="text-2xl text-primary">✓</span>
        </div>

        <h1 className="mb-3 text-3xl font-semibold sm:text-4xl">
          תודה רבה!
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
          קיבלנו את כל הפרטים עבור האלבום של{" "}
          <span className="font-semibold text-foreground">{personName}</span>.
        </p>
        {buyerEmail && (
          <p className="mt-2 text-sm text-muted-foreground">
            נעדכן אתכם בדוא&quot;ל ({buyerEmail}) כשהאלבום יהיה מוכן.
          </p>
        )}
      </div>

      {/* Step tracker card */}
      <div className="mb-8 rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-7">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          מצב הזמנה
        </h2>

        <div className="space-y-0">
          {CUSTOMER_STEPS.map((step, i) => {
            const isDone = i < currentMilestone;
            const isCurrent = i === currentMilestone;
            const isPending = i > currentMilestone;

            return (
              <div key={i} className="flex gap-4">
                {/* Connector column */}
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                      isDone
                        ? "border-primary bg-primary text-primary-foreground"
                        : isCurrent
                        ? "border-primary bg-background text-primary"
                        : "border-border bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    {isDone ? "✓" : i + 1}
                  </div>
                  {i < CUSTOMER_STEPS.length - 1 && (
                    <div
                      className={`mt-1 w-px flex-1 ${isDone ? "bg-primary/40" : "bg-border"}`}
                      style={{ minHeight: "1.75rem" }}
                    />
                  )}
                </div>

                {/* Step text */}
                <div className="pb-7 pt-1">
                  <p
                    className={`text-sm font-medium leading-tight ${
                      isPending ? "text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {isCurrent && (
                      <span className="me-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary align-middle" />
                    )}
                    {step.label}
                  </p>
                  {(isDone || isCurrent) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {step.desc}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview CTA — only shown after admin publishes the album */}
      {CUSTOMER_PREVIEW_VISIBLE_STATUSES.includes(currentStatus) && (
        <div className="mb-5 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <p className="mb-4 text-base font-medium">האלבום שלכם מוכן לצפייה!</p>
          <Link
            href={`/order/${orderId}/preview?token=${token}`}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-accent"
          >
            צפו באלבום
          </Link>
        </div>
      )}

      {/* Contact footer */}
      <div className="rounded-xl border border-border/50 bg-secondary/40 px-5 py-4 text-center text-sm text-muted-foreground">
        יש שאלות? נשמח לעזור —{" "}
        <a
          href="mailto:hello@vitaestudio.co"
          className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
        >
          hello@vitaestudio.co
        </a>
      </div>
    </div>
  );
}
