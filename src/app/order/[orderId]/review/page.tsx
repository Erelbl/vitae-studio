import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";
import { ReviewScreen } from "@/components/checkout/ReviewScreen";
import { redirect } from "next/navigation";

export default async function ReviewPage({
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
    .select("id, status, person_name, buyer_name, access_token, access_token_expires_at")
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

  // If questionnaire isn't complete yet, redirect back
  if (order.status === "created") {
    redirect(`/order/${orderId}/questionnaire?token=${token}`);
  }

  const { data: qResponse } = await supabase
    .from("questionnaire_responses")
    .select("responses")
    .eq("order_id", orderId)
    .single();

  const responses = (qResponse?.responses as Record<string, unknown>) ?? {};

  return (
    <ReviewScreen
      orderId={orderId}
      token={token}
      personName={(order.person_name as string) || ""}
      buyerName={(order.buyer_name as string) || ""}
      responses={responses}
    />
  );
}
