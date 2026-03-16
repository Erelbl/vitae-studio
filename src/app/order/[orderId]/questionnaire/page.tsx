import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";
import { redirect } from "next/navigation";
import { QuestionnaireWizard } from "@/components/questionnaire/QuestionnaireWizard";
import type { AlbumType } from "@/questionnaires/types";

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
    .select("id, status, access_token, access_token_expires_at, album_type")
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

  // If album_type hasn't been set yet (still default 'single' with no explicit selection),
  // and order is freshly created, redirect to album type selection
  const albumType = (order.album_type as string) || "single";
  const validAlbumTypes = ["single", "couple", "memorial"];
  if (!validAlbumTypes.includes(albumType)) {
    redirect(`/order/${orderId}/album-type?token=${token}`);
  }

  // Fetch saved questionnaire data for pre-population on reload/back navigation
  const { data: qResponse } = await supabase
    .from("questionnaire_responses")
    .select("responses, current_step")
    .eq("order_id", orderId)
    .single();

  const initialData = (qResponse?.responses as Record<string, unknown>) ?? {};
  const initialStep = (qResponse?.current_step as number) ?? 0;

  return (
    <QuestionnaireWizard
      orderId={orderId}
      token={token}
      albumType={albumType as AlbumType}
      initialData={initialData}
      initialStep={Math.min(initialStep, 8)}
    />
  );
}
