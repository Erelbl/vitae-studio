import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";
import { FollowUpClient } from "@/components/followup/FollowUpClient";
import type { FollowUpQA } from "@/types/questionnaire";

export default async function FollowUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { orderId } = await params;
  const { token = "" } = await searchParams;

  const supabase = createAdminClient();

  // Fetch order for token validation
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, access_token, access_token_expires_at")
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

  // Fetch existing follow-up questions (if enrichment already done)
  let existingQuestions: FollowUpQA[] = [];
  if (order.status !== "questionnaire_complete") {
    const { data: qResponse } = await supabase
      .from("questionnaire_responses")
      .select("followup_questions")
      .eq("order_id", orderId)
      .single();

    existingQuestions =
      (qResponse?.followup_questions as FollowUpQA[] | null) ?? [];
  }

  const needsGeneration = order.status === "questionnaire_complete";

  return (
    <FollowUpClient
      orderId={orderId}
      token={token}
      initialQuestions={existingQuestions}
      needsGeneration={needsGeneration}
    />
  );
}
