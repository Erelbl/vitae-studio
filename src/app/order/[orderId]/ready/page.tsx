import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";
import { redirect } from "next/navigation";
import type { PricingSnapshot } from "@/types/order";
import { PayButton } from "@/components/checkout/PayButton";
import { Shield } from "lucide-react";

export default async function ReadyForPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { orderId } = await params;
  const { token = "" } = await searchParams;

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, status, payment_status, delivery_mode, album_size, pricing_snapshot, person_name, access_token, access_token_expires_at"
    )
    .eq("id", orderId)
    .single();

  if (!order) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center text-muted-foreground">
        הזמנה לא נמצאה.
      </div>
    );
  }

  const tokenResult = validateAccessToken(
    token,
    order.access_token as string | null,
    order.access_token_expires_at as string | null
  );

  if (!tokenResult.valid) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center text-muted-foreground">
        קישור לא תקין או שפג תוקפו.
      </div>
    );
  }

  // If already paid, redirect to photos
  if (order.payment_status === "paid") {
    redirect(`/order/${orderId}/photos?token=${token}`);
  }

  // Allow payment from ready_for_payment or payment_pending (retry)
  if (order.status !== "ready_for_payment" && order.status !== "payment_pending") {
    redirect(`/order/${orderId}/review?token=${token}`);
  }

  const pricing = order.pricing_snapshot as PricingSnapshot | null;

  const DELIVERY_LABELS: Record<string, string> = {
    film: "סרט עם קריינות",
    print: "אלבום פיזי מודפס",
    bundle: "אלבום פיזי + סרט",
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:max-w-2xl sm:px-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">
          הסיפור של {(order.person_name as string) || "היקר/ה שלכם"} בדרך
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          בדקו את פרטי ההזמנה והמשיכו לתשלום
        </p>
      </div>

      {/* Order summary card */}
      {pricing && (
        <div className="mb-6 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">פרטי ההזמנה</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">מוצר</span>
              <span>{DELIVERY_LABELS[pricing.delivery_mode] ?? pricing.delivery_mode}</span>
            </div>
            {pricing.album_size && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">גודל אלבום</span>
                <span>{pricing.album_size === "25x25" ? '25×25 ס"מ' : '30×30 ס"מ'}</span>
              </div>
            )}
            {pricing.includes_printed_album && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">משלוח</span>
                <span>כלול במחיר</span>
              </div>
            )}
            <div className="border-t border-border/40 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">סה״כ לתשלום</span>
                <span className="text-2xl font-bold text-primary">
                  ₪{pricing.total_price_ils.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pay button */}
      <PayButton orderId={orderId} token={token} />

      {/* Security note */}
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground/70">
        <Shield size={14} />
        <span>התשלום מאובטח ומעובד באמצעות CardCom</span>
      </div>
    </div>
  );
}
