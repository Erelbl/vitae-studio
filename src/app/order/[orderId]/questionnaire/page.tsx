import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";
import { QuestionnaireWizard } from "@/components/questionnaire/QuestionnaireWizard";

export default async function QuestionnairePage({
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

  // Fetch saved questionnaire data for pre-population on reload/back navigation
  const { data: qResponse } = await supabase
    .from("questionnaire_responses")
    .select("responses")
    .eq("order_id", orderId)
    .single();

  const initialData = (qResponse?.responses as Record<string, unknown>) ?? {};

  return (
    <QuestionnaireWizard orderId={orderId} token={token} initialData={initialData} />
  );
}
