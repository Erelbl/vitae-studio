"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Lock, Truck } from "lucide-react";
import { calculateOrderPricing, requiresShipping, requiresAlbumSize } from "@/lib/pricing";
import type { DeliveryMode, AlbumSize } from "@/types/order";

const GROW_LINKS: Record<string, string> = {
  film: "https://pay.grow.link/3124b214459eaf03d8c8fe0fea30af52-MzIwNDQxNg",
  "print-25x25": "https://pay.grow.link/edbae41148bcea53b9220052c2c657d7-MzIwNDQxNA",
  "print-30x30": "https://pay.grow.link/1c899426bbe840a727903f48557fb570-MzIwNDQxNQ",
  "bundle-25x25": "https://pay.grow.link/edbe3fab6cb50f2b4dc9c9e67daa253d-MzIwNDQxOA",
  "bundle-30x30": "https://pay.grow.link/9f22c34647fc749b1c6b0f9c90c170ba-MzIwNDQxOQ",
};

function getGrowLink(mode: DeliveryMode, size: AlbumSize | null): string | null {
  const key = mode === "film" ? "film" : size ? `${mode}-${size}` : null;
  return key ? (GROW_LINKS[key] ?? null) : null;
}

interface Props {
  orderId: string;
  token: string;
  deliveryMode: DeliveryMode;
  initialAlbumSize?: AlbumSize | null;
  initialShipping?: ShippingFields;
}

interface ShippingFields {
  shipping_full_name: string;
  shipping_phone: string;
  shipping_city: string;
  shipping_street: string;
  shipping_apartment: string;
  shipping_postal_code: string;
  shipping_notes: string;
}

const EMPTY_SHIPPING: ShippingFields = {
  shipping_full_name: "",
  shipping_phone: "",
  shipping_city: "",
  shipping_street: "",
  shipping_apartment: "",
  shipping_postal_code: "",
  shipping_notes: "",
};

const DELIVERY_LABELS: Record<DeliveryMode, string> = {
  film: "סרט עם קריינות",
  print: "אלבום פיזי מודפס",
  bundle: "אלבום פיזי + סרט",
};

const SIZE_LABELS: Record<AlbumSize, string> = {
  "25x25": '25×25 ס"מ',
  "30x30": '30×30 ס"מ',
};

export function OrderConfiguration({
  orderId,
  token,
  deliveryMode,
  initialAlbumSize,
  initialShipping,
}: Props) {
  const router = useRouter();
  const needsAlbum = requiresAlbumSize(deliveryMode);
  const needsShipping = requiresShipping(deliveryMode);

  const [albumSize, setAlbumSize] = useState<AlbumSize | null>(
    initialAlbumSize ?? (needsAlbum ? "25x25" : null)
  );
  const [shipping, setShipping] = useState<ShippingFields>(
    initialShipping ?? EMPTY_SHIPPING
  );
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Compute price for display (server is source of truth)
  let displayPrice = 0;
  try {
    const pricing = calculateOrderPricing({
      deliveryMode,
      albumSize: needsAlbum ? albumSize : null,
    });
    displayPrice = pricing.totalPriceIls;
  } catch {
    // Will be caught on submit
  }

  function updateShipping(field: keyof ShippingFields, value: string) {
    setShipping((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};

    if (needsAlbum && !albumSize) {
      newErrors.album_size = "יש לבחור גודל אלבום";
    }

    if (needsShipping) {
      if (!shipping.shipping_full_name.trim() || shipping.shipping_full_name.trim().length < 2) {
        newErrors.shipping_full_name = "נדרש שם מלא";
      }
      if (!shipping.shipping_phone.trim() || shipping.shipping_phone.trim().length < 9) {
        newErrors.shipping_phone = "מספר טלפון לא תקין";
      }
      if (!shipping.shipping_city.trim() || shipping.shipping_city.trim().length < 2) {
        newErrors.shipping_city = "נדרשת עיר";
      }
      if (!shipping.shipping_street.trim() || shipping.shipping_street.trim().length < 2) {
        newErrors.shipping_street = "נדרשת כתובת רחוב ומספר בית";
      }
      if (!shipping.shipping_apartment.trim()) {
        newErrors.shipping_apartment = "נדרש קומה/דירה";
      }
      if (!shipping.shipping_postal_code.trim() || shipping.shipping_postal_code.trim().length < 5) {
        newErrors.shipping_postal_code = "מיקוד לא תקין";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validateForm()) {
      toast.error("יש למלא את כל השדות הנדרשים");
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        delivery_mode: deliveryMode,
        album_size: needsAlbum ? albumSize : null,
        shipping: needsShipping ? shipping : null,
      };

      const res = await fetch(
        `/api/orders/${orderId}/checkout?token=${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "שגיאה בשמירת ההזמנה");
      }

      const growUrl = getGrowLink(deliveryMode, needsAlbum ? albumSize : null);
      if (growUrl) {
        window.location.href = growUrl;
      } else {
        router.push(`/order/${orderId}/ready?token=${token}`);
      }
    } catch (err) {
      toast.error((err as Error).message || "שגיאה. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:max-w-2xl sm:px-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">סיכום הזמנה</h1>
        <p className="mt-2 text-base text-muted-foreground">
          {DELIVERY_LABELS[deliveryMode]}
        </p>
      </div>

      <div className="space-y-6">
        {/* Album Size Selection */}
        {needsAlbum && (
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-medium">גודל האלבום</h2>
            <div className="grid grid-cols-2 gap-3">
              {(["25x25", "30x30"] as const).map((size) => {
                const isSelected = albumSize === size;
                let price: number;
                try {
                  price = calculateOrderPricing({
                    deliveryMode,
                    albumSize: size,
                  }).totalPriceIls;
                } catch {
                  price = 0;
                }

                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setAlbumSize(size)}
                    className={`relative flex flex-col items-center rounded-xl p-4 transition-all ${
                      isSelected
                        ? "bg-primary/10 ring-2 ring-primary"
                        : "border border-border/50 bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-lg font-semibold">{SIZE_LABELS[size]}</span>
                    <span className="mt-1 text-sm text-muted-foreground">
                      ₪{price.toLocaleString()}
                    </span>
                    {isSelected && (
                      <div className="absolute top-2 end-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {errors.album_size && (
              <p className="mt-2 text-sm text-red-600">{errors.album_size}</p>
            )}
          </div>
        )}

        {/* Shipping Form */}
        {needsShipping && (
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Truck size={18} className="text-muted-foreground" />
              <h2 className="text-lg font-medium">פרטי משלוח</h2>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              המשלוח זמין כרגע לכתובות בישראל בלבד
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="shipping_full_name">שם מלא *</Label>
                  <Input
                    id="shipping_full_name"
                    value={shipping.shipping_full_name}
                    onChange={(e) => updateShipping("shipping_full_name", e.target.value)}
                    className={errors.shipping_full_name ? "border-red-400" : ""}
                  />
                  {errors.shipping_full_name && (
                    <p className="mt-1 text-xs text-red-600">{errors.shipping_full_name}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="shipping_phone">טלפון *</Label>
                  <Input
                    id="shipping_phone"
                    type="tel"
                    dir="ltr"
                    value={shipping.shipping_phone}
                    onChange={(e) => updateShipping("shipping_phone", e.target.value)}
                    className={errors.shipping_phone ? "border-red-400" : ""}
                  />
                  {errors.shipping_phone && (
                    <p className="mt-1 text-xs text-red-600">{errors.shipping_phone}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="shipping_city">עיר *</Label>
                <Input
                  id="shipping_city"
                  value={shipping.shipping_city}
                  onChange={(e) => updateShipping("shipping_city", e.target.value)}
                  className={errors.shipping_city ? "border-red-400" : ""}
                />
                {errors.shipping_city && (
                  <p className="mt-1 text-xs text-red-600">{errors.shipping_city}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="shipping_street">רחוב ומספר בית *</Label>
                  <Input
                    id="shipping_street"
                    value={shipping.shipping_street}
                    onChange={(e) => updateShipping("shipping_street", e.target.value)}
                    className={errors.shipping_street ? "border-red-400" : ""}
                  />
                  {errors.shipping_street && (
                    <p className="mt-1 text-xs text-red-600">{errors.shipping_street}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="shipping_apartment">דירה / קומה *</Label>
                  <Input
                    id="shipping_apartment"
                    value={shipping.shipping_apartment}
                    onChange={(e) => updateShipping("shipping_apartment", e.target.value)}
                    className={errors.shipping_apartment ? "border-red-400" : ""}
                  />
                  {errors.shipping_apartment && (
                    <p className="mt-1 text-xs text-red-600">{errors.shipping_apartment}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="shipping_postal_code">מיקוד *</Label>
                  <Input
                    id="shipping_postal_code"
                    dir="ltr"
                    value={shipping.shipping_postal_code}
                    onChange={(e) => updateShipping("shipping_postal_code", e.target.value)}
                    className={errors.shipping_postal_code ? "border-red-400" : ""}
                  />
                  {errors.shipping_postal_code && (
                    <p className="mt-1 text-xs text-red-600">{errors.shipping_postal_code}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="shipping_notes">הערות למשלוח</Label>
                  <Input
                    id="shipping_notes"
                    value={shipping.shipping_notes}
                    onChange={(e) => updateShipping("shipping_notes", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Order Summary */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">סיכום</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{DELIVERY_LABELS[deliveryMode]}</span>
              {needsAlbum && albumSize && (
                <span className="text-muted-foreground">{SIZE_LABELS[albumSize]}</span>
              )}
            </div>
            {needsShipping && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">משלוח</span>
                <span className="text-muted-foreground">כלול במחיר</span>
              </div>
            )}
            <div className="border-t border-border/40 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">סה״כ לתשלום</span>
                <span className="text-2xl font-bold text-primary">
                  ₪{displayPrice.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button
            size="lg"
            className="flex-1 gap-2 rounded-xl text-base"
            disabled={submitting}
            onClick={handleSubmit}
          >
            <Lock size={16} />
            {submitting ? "שומר..." : "המשך לתשלום מאובטח"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 rounded-xl text-base"
            onClick={() =>
              router.push(`/order/${orderId}/select-product?token=${token}`)
            }
          >
            חזרה
          </Button>
        </div>
      </div>
    </div>
  );
}
