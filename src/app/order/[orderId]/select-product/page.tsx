import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";
import { ProductSelection } from "@/components/checkout/ProductSelection";
import { redirect } from "next/navigation";
import type { DeliveryMode } from "@/types/order";

export default async function SelectProductPage({
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
    .select("id, status, delivery_mode, access_token, access_token_expires_at")
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

  // Must have completed questionnaire
  if (order.status === "created") {
    redirect(`/order/${orderId}/questionnaire?token=${token}`);
  }

  return (
    <ProductSelection
      orderId={orderId}
      token={token}
      initialDeliveryMode={(order.delivery_mode as DeliveryMode) ?? null}
    />
  );
}
