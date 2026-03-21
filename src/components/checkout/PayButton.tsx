"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { getGrowLinkByMode } from "@/content/packages";
import type { DeliveryMode, AlbumSize } from "@/types/order";
import Link from "next/link";

interface Props {
  orderId: string;
  token: string;
  deliveryMode?: DeliveryMode | null;
  albumSize?: AlbumSize | null;
}

export function PayButton({ orderId, token, deliveryMode, albumSize }: Props) {
  const [agreed, setAgreed] = useState(false);
  const url = deliveryMode ? getGrowLinkByMode(deliveryMode, albumSize ?? null) : null;

  if (!url) {
    return (
      <Button size="lg" className="w-full gap-2 rounded-xl text-base" disabled>
        <Lock size={16} />
        תשלום לא זמין כרגע
      </Button>
    );
  }

  function handlePay() {
    window.location.href = url!;
  }

  return (
    <div className="space-y-4">
      {/* Consent checkbox */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
        />
        <span className="text-sm leading-relaxed text-muted-foreground">
          אני מאשר/ת שקראתי ואני מסכים/ה ל
          <Link
            href="/terms-of-service"
            target="_blank"
            className="text-foreground underline underline-offset-2 hover:text-primary"
          >
            תנאי השימוש
          </Link>
          {", "}
          <Link
            href="/privacy-policy"
            target="_blank"
            className="text-foreground underline underline-offset-2 hover:text-primary"
          >
            מדיניות הפרטיות
          </Link>
          {", "}
          <Link
            href="/shipping-policy"
            target="_blank"
            className="text-foreground underline underline-offset-2 hover:text-primary"
          >
            מדיניות המשלוחים
          </Link>
          {" ו"}
          <Link
            href="/refund-policy"
            target="_blank"
            className="text-foreground underline underline-offset-2 hover:text-primary"
          >
            מדיניות הביטולים וההחזרים
          </Link>
          .
        </span>
      </label>

      {/* Pay button */}
      <Button
        size="lg"
        className="w-full gap-2 rounded-xl text-base"
        onClick={handlePay}
        disabled={!agreed}
      >
        {!agreed ? <Lock size={16} /> : null}
        לתשלום
      </Button>
    </div>
  );
}
