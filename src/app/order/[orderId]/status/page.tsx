// Stub status page — will be wired with Supabase Realtime in the next batch.

import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";

export default async function StatusPage({
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
    .select("id, status, person_name, access_token, access_token_expires_at")
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

  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="mb-4 font-serif text-3xl font-bold">
        תודה רבה!
      </h1>
      <p className="mb-2 text-lg text-muted-foreground">
        קיבלנו את כל הפרטים עבור האלבום של{" "}
        <span className="font-medium text-foreground">{order.person_name || "היקר/ה"}</span>.
      </p>
      <p className="text-muted-foreground">
        אנחנו מתחילים לעבוד — נעדכן אתכם בדוא&quot;ל כשהאלבום יהיה מוכן לתצוגה מקדימה.
      </p>
    </div>
  );
}
