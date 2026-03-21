"use client";

import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { getGrowLinkByMode } from "@/content/packages";
import type { DeliveryMode, AlbumSize } from "@/types/order";

interface Props {
  orderId: string;
  token: string;
  deliveryMode?: DeliveryMode | null;
  albumSize?: AlbumSize | null;
}

export function PayButton({ orderId, token, deliveryMode, albumSize }: Props) {
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
    <Button size="lg" className="w-full gap-2 rounded-xl text-base" onClick={handlePay}>
      לתשלום
    </Button>
  );
}
