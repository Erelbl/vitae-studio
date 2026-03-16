import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";
import { redirect } from "next/navigation";
import { PaymentReturnClient } from "@/components/checkout/PaymentReturnClient";

export default async function PaymentReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { orderId } = await params;
  const { token = "", status: returnStatus } = await searchParams;

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, status, payment_status, person_name, access_token, access_token_expires_at"
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

  // If already paid, redirect to status page (story generation starts after payment)
  if (order.payment_status === "paid") {
    redirect(`/order/${orderId}/status?token=${token}`);
  }

  // If provider returned failure, go back to ready page
  const providerFailed = returnStatus === "failed" || returnStatus === "cancelled";

  return (
    <PaymentReturnClient
      orderId={orderId}
      token={token}
      personName={(order.person_name as string) || ""}
      initialPaymentStatus={(order.payment_status as string) || "pending"}
      initialOrderStatus={(order.status as string) || ""}
      providerReturnedFailure={providerFailed}
    />
  );
}
