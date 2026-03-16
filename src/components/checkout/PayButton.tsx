"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Lock, Loader2 } from "lucide-react";

interface Props {
  orderId: string;
  token: string;
}

export function PayButton({ orderId, token }: Props) {
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/pay?token=${token}`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "שגיאה ביצירת התשלום");
      }

      const { redirectUrl } = await res.json();

      if (!redirectUrl) {
        throw new Error("לא התקבל קישור לתשלום");
      }

      // Redirect to CardCom
      window.location.href = redirectUrl;
    } catch (err) {
      toast.error((err as Error).message || "שגיאה. נסו שוב.");
      setLoading(false);
    }
    // Don't setLoading(false) on success — page is navigating away
  }

  return (
    <Button
      size="lg"
      className="w-full gap-2 rounded-xl text-base"
      disabled={loading}
      onClick={handlePay}
    >
      {loading ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          מעבירים אותך לתשלום מאובטח...
        </>
      ) : (
        <>
          <Lock size={16} />
          המשך לתשלום מאובטח
        </>
      )}
    </Button>
  );
}
