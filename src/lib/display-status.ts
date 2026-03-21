import type { OrderStatus, PreviewStatus } from "@/types/order";

export interface DisplayStatus {
  label: string;
  color: string;
  dotColor: string;
}

/**
 * Pipeline stage keys used for dashboard grouping and filtering.
 */
export type PipelineStage =
  | "awaiting_payment"
  | "in_progress"
  | "published"
  | "feedback"
  | "customer_approved"
  | "in_print"
  | "shipped"
  | "completed";

export interface PipelineStageInfo {
  key: PipelineStage;
  label: string;
  subLabel?: string;
  color: string; // border/accent color for card
  bg: string;
  dotColor: string;
}

export const PIPELINE_STAGES: PipelineStageInfo[] = [
  {
    key: "awaiting_payment",
    label: "ממתינות לתשלום",
    color: "border-yellow-200",
    bg: "bg-yellow-50/60",
    dotColor: "bg-yellow-500",
  },
  {
    key: "in_progress",
    label: "בתהליך עבודה",
    subLabel: "שאלון / טקסט / איורים",
    color: "border-blue-200",
    bg: "bg-blue-50/60",
    dotColor: "bg-blue-500",
  },
  {
    key: "published",
    label: "פורסם ללקוח",
    color: "border-sky-200",
    bg: "bg-sky-50/60",
    dotColor: "bg-sky-500",
  },
  {
    key: "feedback",
    label: "התקבלו הערות",
    color: "border-orange-200",
    bg: "bg-orange-50/60",
    dotColor: "bg-orange-500",
  },
  {
    key: "customer_approved",
    label: "אושר על ידי הלקוח",
    color: "border-green-200",
    bg: "bg-green-50/60",
    dotColor: "bg-green-500",
  },
  {
    key: "in_print",
    label: "בהדפסה",
    color: "border-purple-200",
    bg: "bg-purple-50/60",
    dotColor: "bg-purple-500",
  },
  {
    key: "shipped",
    label: "נשלח ללקוח",
    color: "border-indigo-200",
    bg: "bg-indigo-50/60",
    dotColor: "bg-indigo-500",
  },
  {
    key: "completed",
    label: "הושלם",
    color: "border-emerald-200",
    bg: "bg-emerald-50/60",
    dotColor: "bg-emerald-500",
  },
];

/**
 * Derive the pipeline stage for an order based on its combined state.
 */
export function getPipelineStage(order: {
  status: string;
  payment_status?: string | null;
  preview_status?: string | null;
  preview_round?: number | null;
  sent_to_print_at?: string | null;
  shipped_to_customer_at?: string | null;
  completed_at?: string | null;
}): PipelineStage {
  const status = order.status as OrderStatus;

  // Fulfillment stages (check timestamps, highest priority)
  if (order.completed_at) return "completed";
  if (order.shipped_to_customer_at) return "shipped";
  if (order.sent_to_print_at) return "in_print";

  // Preview loop stages
  if (status === "approved") {
    const previewStatus = (order.preview_status as PreviewStatus | null) || "draft";
    if (previewStatus === "approved") return "customer_approved";
    if (previewStatus === "changes_requested") return "feedback";
    if (previewStatus === "sent_to_customer") return "published";
    return "customer_approved"; // approved but no preview sent yet
  }

  // Awaiting payment
  if (
    order.payment_status !== "paid" &&
    ["created", "questionnaire_complete", "enrichment_complete", "photos_uploaded", "ready_for_payment", "payment_pending"].includes(status)
  ) {
    return "awaiting_payment";
  }

  // Everything else is "in progress"
  return "in_progress";
}

/**
 * Derive a human-readable Hebrew display status from the order's
 * combined state: order status + payment status + preview status + round + fulfillment timestamps.
 *
 * This is purely a display concern — no data mutation.
 */
export function getDisplayStatus(order: {
  status: string;
  payment_status?: string | null;
  preview_status?: string | null;
  preview_round?: number | null;
  sent_to_print_at?: string | null;
  shipped_to_customer_at?: string | null;
  completed_at?: string | null;
}): DisplayStatus {
  const status = order.status as OrderStatus;
  const paymentStatus = order.payment_status as string | null;
  const previewStatus = (order.preview_status as PreviewStatus | null) || "draft";
  const round = (order.preview_round as number) || 0;

  // Fulfillment stages (highest priority — check timestamps)
  if (order.completed_at) {
    return {
      label: "הושלם",
      color: "bg-emerald-100 text-emerald-700 border-emerald-300",
      dotColor: "bg-emerald-500",
    };
  }

  if (order.shipped_to_customer_at) {
    return {
      label: "נשלח ללקוח",
      color: "bg-indigo-100 text-indigo-700 border-indigo-300",
      dotColor: "bg-indigo-500",
    };
  }

  if (order.sent_to_print_at) {
    return {
      label: "בהדפסה",
      color: "bg-purple-100 text-purple-700 border-purple-300",
      dotColor: "bg-purple-500",
    };
  }

  // Customer approved the preview
  if (status === "approved" && previewStatus === "approved") {
    return {
      label: "אושר על ידי הלקוח",
      color: "bg-green-200 text-green-800 border-green-400",
      dotColor: "bg-green-600",
    };
  }

  // Customer sent feedback
  if (status === "approved" && previewStatus === "changes_requested") {
    const roundLabel = round > 0 ? ` - סבב ${round}` : "";
    return {
      label: `התקבלו הערות לקוח${roundLabel}`,
      color: "bg-orange-100 text-orange-700 border-orange-300",
      dotColor: "bg-orange-500",
    };
  }

  // Published to customer (sent_to_customer)
  if (status === "approved" && previewStatus === "sent_to_customer") {
    const roundLabel = round > 0 ? ` - סבב ${round}` : "";
    return {
      label: `פורסם ללקוח${roundLabel}`,
      color: "bg-blue-100 text-blue-700 border-blue-300",
      dotColor: "bg-blue-500",
    };
  }

  // Just marked approved (preview not yet sent)
  if (status === "approved") {
    return {
      label: "אושר",
      color: "bg-green-200 text-green-800 border-green-400",
      dotColor: "bg-green-600",
    };
  }

  // Payment received but still in early flow
  if (
    paymentStatus === "paid" &&
    ["photos_uploaded", "ready_for_payment", "payment_pending"].includes(status)
  ) {
    return {
      label: "התקבל תשלום",
      color: "bg-green-100 text-green-700 border-green-300",
      dotColor: "bg-green-500",
    };
  }

  // Fall back to the static status labels for all other states
  return {
    label: DISPLAY_LABELS[status] || status,
    color: DISPLAY_COLORS[status] || "bg-gray-50 text-gray-600 border-gray-200",
    dotColor: DISPLAY_DOT_COLORS[status] || "bg-gray-400",
  };
}

const DISPLAY_LABELS: Record<OrderStatus, string> = {
  created: "נוצר",
  questionnaire_complete: "שאלון הושלם",
  enrichment_complete: "העשרה הושלמה",
  photos_uploaded: "תמונות הועלו",
  ready_for_payment: "ממתין לתשלום",
  payment_pending: "בתהליך תשלום",
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
};

const DISPLAY_COLORS: Partial<Record<OrderStatus, string>> = {
  created: "bg-gray-50 text-gray-600 border-gray-200",
  questionnaire_complete: "bg-gray-100 text-gray-700 border-gray-300",
  enrichment_complete: "bg-gray-100 text-gray-700 border-gray-300",
  photos_uploaded: "bg-gray-100 text-gray-700 border-gray-300",
  ready_for_payment: "bg-yellow-100 text-yellow-700 border-yellow-300",
  payment_pending: "bg-yellow-100 text-yellow-700 border-yellow-300",
  generating_text: "bg-blue-100 text-blue-700 border-blue-300",
  text_ready: "bg-blue-50 text-blue-600 border-blue-200",
  generating_illustrations: "bg-blue-100 text-blue-700 border-blue-300",
  preview_ready: "bg-green-100 text-green-700 border-green-300",
  admin_review: "bg-yellow-100 text-yellow-700 border-yellow-300",
  approved: "bg-green-200 text-green-800 border-green-400",
  revision_requested: "bg-orange-100 text-orange-700 border-orange-300",
  generating_pdf: "bg-blue-100 text-blue-700 border-blue-300",
  delivered: "bg-emerald-100 text-emerald-700 border-emerald-300",
  error_generation: "bg-red-100 text-red-700 border-red-300",
};

const DISPLAY_DOT_COLORS: Partial<Record<OrderStatus, string>> = {
  created: "bg-gray-400",
  questionnaire_complete: "bg-gray-400",
  enrichment_complete: "bg-gray-400",
  photos_uploaded: "bg-gray-400",
  ready_for_payment: "bg-yellow-500",
  payment_pending: "bg-yellow-500",
  generating_text: "bg-blue-500",
  text_ready: "bg-blue-400",
  generating_illustrations: "bg-blue-500",
  preview_ready: "bg-green-500",
  admin_review: "bg-yellow-500",
  approved: "bg-green-600",
  revision_requested: "bg-orange-500",
  generating_pdf: "bg-blue-500",
  delivered: "bg-emerald-500",
  error_generation: "bg-red-500",
};
