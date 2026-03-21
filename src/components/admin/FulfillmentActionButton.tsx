"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type FulfillmentAction = "sent_to_print" | "shipped" | "completed";

interface ActionConfig {
  action: FulfillmentAction;
  label: string;
  confirmLabel: string;
}

function getNextAction(order: {
  preview_status?: string | null;
  sent_to_print_at?: string | null;
  shipped_to_customer_at?: string | null;
  completed_at?: string | null;
}): ActionConfig | null {
  // Already completed — no more actions
  if (order.completed_at) return null;

  // Must be customer-approved to start fulfillment
  if (order.preview_status !== "approved") return null;

  if (order.shipped_to_customer_at) {
    return {
      action: "completed",
      label: "סמן כהושלם",
      confirmLabel: "לסמן הזמנה זו כהושלמה?",
    };
  }

  if (order.sent_to_print_at) {
    return {
      action: "shipped",
      label: "סמן כנשלח ללקוח",
      confirmLabel: "לסמן שההזמנה נשלחה ללקוח?",
    };
  }

  return {
    action: "sent_to_print",
    label: "סמן כנשלח להדפסה",
    confirmLabel: "לסמן שההזמנה נשלחה להדפסה?",
  };
}

export function FulfillmentActionButton({
  orderId,
  previewStatus,
  sentToPrintAt,
  shippedToCustomerAt,
  completedAt,
}: {
  orderId: string;
  previewStatus?: string | null;
  sentToPrintAt?: string | null;
  shippedToCustomerAt?: string | null;
  completedAt?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextAction = getNextAction({
    preview_status: previewStatus,
    sent_to_print_at: sentToPrintAt,
    shipped_to_customer_at: shippedToCustomerAt,
    completed_at: completedAt,
  });

  if (!nextAction) return null;

  async function handleAction() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/orders/${orderId}/fulfillment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: nextAction!.action }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "שגיאה בביצוע הפעולה");
        setConfirming(false);
        return;
      }

      router.refresh();
    } catch {
      setError("שגיאה בחיבור לשרת");
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {confirming ? (
        <>
          <span className="text-sm text-muted-foreground">
            {nextAction.confirmLabel}
          </span>
          <Button
            size="sm"
            onClick={handleAction}
            disabled={loading}
          >
            {loading ? "מעדכן..." : "אישור"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(false)}
            disabled={loading}
          >
            ביטול
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={handleAction}
          disabled={loading}
        >
          {nextAction.label}
        </Button>
      )}
      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}
