import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";
import { redirect } from "next/navigation";
import type { PricingSnapshot } from "@/types/order";
import { Check, Clock } from "lucide-react";

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
      "id, status, delivery_mode, album_size, pricing_snapshot, person_name, access_token, access_token_expires_at"
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

  if (order.status !== "ready_for_payment") {
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
      <div className="text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-green-50 px-5 py-2 text-sm font-medium text-green-700">
          <Check size={18} />
          ההזמנה שלך מוכנה
        </div>

        <h1 className="text-2xl font-semibold sm:text-3xl">
          הסיפור של {(order.person_name as string) || "היקר/ה שלכם"} בדרך
        </h1>

        <p className="mt-3 text-base text-muted-foreground">
          פרטי ההזמנה נשמרו בהצלחה. בקרוב תוכלו להמשיך לתשלום מאובטח.
        </p>
      </div>

      {/* Order summary card */}
      {pricing && (
        <div className="mt-8 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
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
                <span className="text-lg font-semibold">סה״כ</span>
                <span className="text-2xl font-bold text-primary">
                  ₪{pricing.total_price_ils.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending payment notice */}
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <Clock size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">ממתין לתשלום</p>
          <p className="mt-0.5 text-amber-700">
            שלב התשלום יפתח בקרוב. נשלח אליכם עדכון כשהכל מוכן.
          </p>
        </div>
      </div>
    </div>
  );
}
