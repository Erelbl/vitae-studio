"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PackageCard } from "@/components/shared/PackageCard";
import {
  PACKAGES,
  PACKAGE_TO_DELIVERY_MODE,
  DELIVERY_MODE_TO_PACKAGE,
  type PackageKey,
  type Size,
} from "@/content/packages";
import type { DeliveryMode } from "@/types/order";

interface Props {
  orderId: string;
  token: string;
  initialDeliveryMode?: DeliveryMode | null;
}

export function ProductSelection({ orderId, token, initialDeliveryMode }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<PackageKey | null>(
    initialDeliveryMode ? DELIVERY_MODE_TO_PACKAGE[initialDeliveryMode] : null
  );
  const [saving, setSaving] = useState(false);
  const [albumSize, setAlbumSize] = useState<Size>("25");
  const [comboSize, setComboSize] = useState<Size>("25");

  function getSize(key: PackageKey): Size {
    if (key === "album") return albumSize;
    if (key === "combo") return comboSize;
    return "25";
  }

  function setSize(key: PackageKey, size: Size) {
    if (key === "album") setAlbumSize(size);
    if (key === "combo") setComboSize(size);
  }

  async function handleContinue() {
    if (!selected) {
      toast.error("יש לבחור מוצר");
      return;
    }

    const deliveryMode = PACKAGE_TO_DELIVERY_MODE[selected];

    setSaving(true);
    try {
      const res = await fetch(
        `/api/orders/${orderId}/checkout?token=${token}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            delivery_mode: deliveryMode,
            album_size: deliveryMode === "film" ? null : undefined,
          }),
        }
      );

      if (!res.ok) throw new Error("שגיאה בשמירה");

      router.push(`/order/${orderId}/configure?token=${token}`);
    } catch {
      toast.error("שגיאה בשמירת הבחירה. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:max-w-5xl sm:px-8">
      <div className="mb-10 text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">
          איך תרצו לקבל את הסיפור שלכם?
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          בחרו את הפורמט המועדף עליכם
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {PACKAGES.map((pkg) => {
          const size = getSize(pkg.key);
          const isSelected = selected === pkg.key;

          return (
            <PackageCard
              key={pkg.key}
              pkg={pkg}
              size={size}
              onSizeChange={(s) => setSize(pkg.key, s)}
              isSelected={isSelected}
              asButton
              onCardClick={() => setSelected(pkg.key)}
              ctaLabel="בחירה"
              ctaVariant={isSelected ? "default" : "outline"}
              onCtaClick={() => setSelected(pkg.key)}
            />
          );
        })}
      </div>

      {/* Continue */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row-reverse">
        <Button
          size="lg"
          className="flex-1 rounded-xl text-base"
          disabled={!selected || saving}
          onClick={handleContinue}
        >
          {saving ? "שומר..." : "המשך"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="flex-1 rounded-xl text-base"
          onClick={() =>
            router.push(`/order/${orderId}/review?token=${token}`)
          }
        >
          חזרה
        </Button>
      </div>
    </div>
  );
}
