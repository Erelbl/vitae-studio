"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface Props {
  orderId: string;
  token: string;
  personName: string;
  initialPaymentStatus: string;
  initialOrderStatus: string;
  providerReturnedFailure: boolean;
}

type ViewState = "checking" | "success" | "failed";

export function PaymentReturnClient({
  orderId,
  token,
  personName,
  initialPaymentStatus,
  providerReturnedFailure,
}: Props) {
  const router = useRouter();

  const [viewState, setViewState] = useState<ViewState>(() => {
    if (initialPaymentStatus === "paid") return "success";
    if (providerReturnedFailure) return "failed";
    return "checking";
  });

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/orders/${orderId}/payment-status?token=${token}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.payment_status === "paid") {
        setViewState("success");
        return true; // stop polling
      }
      // If order went back to ready_for_payment (webhook reported failure)
      if (data.order_status === "ready_for_payment") {
        setViewState("failed");
        return true;
      }
    } catch {
      // Continue polling
    }
    return false;
  }, [orderId, token]);

  useEffect(() => {
    if (viewState !== "checking") return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30; // ~60 seconds

    const poll = async () => {
      while (!cancelled && attempts < maxAttempts) {
        attempts++;
        const done = await pollStatus();
        if (done || cancelled) return;
        await new Promise((r) => setTimeout(r, 2000));
      }
      // Timed out — show failure
      if (!cancelled) setViewState("failed");
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [viewState, pollStatus]);

  useEffect(() => {
    if (viewState === "success") trackEvent("order_completed");
  }, [viewState]);

  if (viewState === "checking") {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <Loader2 size={40} className="mx-auto mb-4 animate-spin text-primary" />
        <h1 className="text-2xl font-semibold">בודקים את התשלום שלך...</h1>
        <p className="mt-3 text-base text-muted-foreground">
          אנחנו מאמתים שהתשלום התקבל. זה ייקח כמה שניות.
        </p>
      </div>
    );
  }

  if (viewState === "success") {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="mb-4 inline-flex items-center justify-center rounded-full bg-green-100 p-3">
          <CheckCircle2 size={40} className="text-green-600" />
        </div>
        <h1 className="text-2xl font-semibold sm:text-3xl">
          התשלום התקבל בהצלחה
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          הסיפור של {personName || "היקר/ה שלכם"} בדרך. התחלנו ליצור את האלבום
          שלכם.
        </p>
        <Button
          size="lg"
          className="mt-8 rounded-xl text-base"
          onClick={() =>
            router.push(`/order/${orderId}/status?token=${token}`)
          }
        >
          מעבר למעקב הזמנה
        </Button>
      </div>
    );
  }

  // Failed state
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <div className="mb-4 inline-flex items-center justify-center rounded-full bg-red-100 p-3">
        <XCircle size={40} className="text-red-600" />
      </div>
      <h1 className="text-2xl font-semibold">התשלום לא הושלם</h1>
      <p className="mt-3 text-base text-muted-foreground">
        התשלום לא עבר. אפשר לנסות שוב.
      </p>
      <Button
        size="lg"
        className="mt-8 rounded-xl text-base"
        onClick={() =>
          router.push(`/order/${orderId}/ready?token=${token}`)
        }
      >
        חזרה לתשלום
      </Button>
    </div>
  );
}
