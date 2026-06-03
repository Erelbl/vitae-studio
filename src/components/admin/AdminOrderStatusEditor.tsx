"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrderStatus, PaymentStatus } from "@/types/order";

const ADMIN_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "enrichment_complete", label: "העשרה הושלמה" },
  { value: "photos_uploaded", label: "תמונות הועלו" },
  { value: "ready_for_payment", label: "ממתין לתשלום" },
  { value: "payment_pending", label: "בתהליך תשלום" },
  { value: "admin_review", label: "בבדיקת מנהל" },
  { value: "preview_ready", label: "תצוגה מקדימה מוכנה" },
  { value: "revision_requested", label: "נדרשים תיקונים" },
  { value: "delivered", label: "הושלם" },
];

const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: "pending", label: "ממתין" },
  { value: "paid", label: "שולם" },
  { value: "refunded", label: "הוחזר" },
  { value: "cancelled", label: "בוטל" },
];

const ADMIN_STATUS_VALUES = new Set(ADMIN_STATUS_OPTIONS.map((o) => o.value));

interface Props {
  orderId: string;
  currentStatus: OrderStatus;
  currentPaymentStatus: PaymentStatus;
}

export function AdminOrderStatusEditor({
  orderId,
  currentStatus,
  currentPaymentStatus,
}: Props) {
  const router = useRouter();

  const [status, setStatus] = useState<OrderStatus | "">(
    ADMIN_STATUS_VALUES.has(currentStatus) ? currentStatus : ""
  );
  const [paymentStatus, setPaymentStatus] =
    useState<PaymentStatus>(currentPaymentStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const statusChanged = status !== "" && status !== currentStatus;
  const paymentChanged = paymentStatus !== currentPaymentStatus;
  const isDirty = statusChanged || paymentChanged;

  async function handleSave() {
    if (!isDirty) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    const body: Record<string, string> = {};
    if (statusChanged) body.status = status as string;
    if (paymentChanged) body.payment_status = paymentStatus;

    const res = await fetch(`/api/admin/orders/${orderId}/update-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? "שגיאה בשמירה");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <section className="rounded-xl border bg-card p-5 space-y-4">
      <h2 className="text-base font-semibold">עריכת סטטוס (אדמין)</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">סטטוס הזמנה</label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as OrderStatus);
              setSaved(false);
            }}
          >
            <SelectTrigger className="w-full text-sm">
              <SelectValue placeholder="— בחר סטטוס —" />
            </SelectTrigger>
            <SelectContent>
              {ADMIN_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!ADMIN_STATUS_VALUES.has(currentStatus) && (
            <p className="text-xs text-muted-foreground">
              סטטוס נוכחי: <span className="font-mono">{currentStatus}</span>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">סטטוס תשלום</label>
          <Select
            value={paymentStatus}
            onValueChange={(v) => {
              setPaymentStatus(v as PaymentStatus);
              setSaved(false);
            }}
          >
            <SelectTrigger className="w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="rounded-full px-5"
        >
          {saving ? "שומר..." : saved ? "✓ נשמר" : "שמור"}
        </Button>
        {saved && !isDirty && (
          <span className="text-xs text-green-600">השינויים נשמרו</span>
        )}
      </div>
    </section>
  );
}
