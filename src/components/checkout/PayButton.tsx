"use client";

import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import type { DeliveryMode, AlbumSize } from "@/types/order";

const GROW_LINKS: Record<string, string> = {
  film: "https://pay.grow.link/3124b214459eaf03d8c8fe0fea30af52-MzIwNDQxNg",
  "print-25x25": "https://pay.grow.link/edbae41148bcea53b9220052c2c657d7-MzIwNDQxNA",
  "print-30x30": "https://pay.grow.link/1c899426bbe840a727903f48557fb570-MzIwNDQxNQ",
  "bundle-25x25": "https://pay.grow.link/edbe3fab6cb50f2b4dc9c9e67daa253d-MzIwNDQxOA",
  "bundle-30x30": "https://pay.grow.link/9f22c34647fc749b1c6b0f9c90c170ba-MzIwNDQxOQ",
};

interface Props {
  orderId: string;
  token: string;
  deliveryMode?: DeliveryMode | null;
  albumSize?: AlbumSize | null;
}

export function PayButton({ orderId, token, deliveryMode, albumSize }: Props) {
  const key =
    deliveryMode === "film"
      ? "film"
      : deliveryMode && albumSize
      ? `${deliveryMode}-${albumSize}`
      : null;

  const url = key ? GROW_LINKS[key] : null;

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
