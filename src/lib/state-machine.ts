import { OrderStatus } from "@/types/order";

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  created: ["questionnaire_complete"],
  // enrichment_complete is the single exit from questionnaire_complete.
  // The enrichment API route always lands here regardless of whether follow-up
  // generation succeeded, the customer skipped it, or it failed. No intermediate
  // generating_followup state is used in MVP.
  questionnaire_complete: ["enrichment_complete"],
  enrichment_complete: ["ready_for_payment", "photos_uploaded"],
  ready_for_payment: ["payment_pending", "photos_uploaded"],
  payment_pending: ["ready_for_payment", "photos_uploaded"],
  photos_uploaded: ["generating_text"],
  generating_text: ["text_ready", "error_generation"],
  text_ready: ["generating_illustrations"],
  generating_illustrations: ["preview_ready", "error_generation"],
  // Admin can publish directly from preview_ready (skipping explicit review step)
  // or after marking as admin_review first.
  // Admin can also trigger a new story generation directly from either state.
  preview_ready: ["admin_review", "approved", "generating_text"],
  admin_review: ["approved", "revision_requested", "generating_text"],
  revision_requested: [
    "generating_text",
    "generating_illustrations",
    "admin_review",
  ],
  approved: ["generating_pdf"],
  generating_pdf: ["delivered", "error_generation"],
  delivered: [],
  error_generation: [
    "generating_text",
    "generating_illustrations",
    "generating_pdf",
  ],
};

export function canTransition(
  from: OrderStatus,
  to: OrderStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getValidTransitions(status: OrderStatus): OrderStatus[] {
  return VALID_TRANSITIONS[status] ?? [];
}

export function assertTransition(
  from: OrderStatus,
  to: OrderStatus
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid status transition: ${from} -> ${to}. Valid transitions from ${from}: ${getValidTransitions(from).join(", ") || "none"}`
    );
  }
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return VALID_TRANSITIONS[status]?.length === 0;
}

export function isGeneratingStatus(status: OrderStatus): boolean {
  return (
    status === "generating_text" ||
    status === "generating_illustrations" ||
    status === "generating_pdf"
  );
}

export function isErrorStatus(status: OrderStatus): boolean {
  return status === "error_generation";
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  created: "נוצר",
  questionnaire_complete: "שאלון הושלם",
  enrichment_complete: "העשרה הושלמה",
  photos_uploaded: "תמונות הועלו",
  generating_text: "יוצר טקסט...",
  text_ready: "טקסט מוכן",
  generating_illustrations: "יוצר איורים...",
  preview_ready: "תצוגה מקדימה מוכנה",
  admin_review: "בבדיקת מנהל",
  approved: "אושר",
  revision_requested: "נדרשים תיקונים",
  generating_pdf: "יוצר PDF...",
  delivered: "נמסר",
  error_generation: "שגיאה ביצירה",
  ready_for_payment: "ממתין לתשלום",
  payment_pending: "בתהליך תשלום",
};
