import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";
import { loadPreviewData } from "@/lib/preview/loader";
import { AlbumPreview } from "@/components/album/AlbumPreview";
import type { OrderStatus } from "@/types/order";

// Statuses where the customer is allowed to see the album preview.
// Orders not yet approved by admin show a "coming soon" message.
const CUSTOMER_VISIBLE_STATUSES: OrderStatus[] = [
  "approved",
  "generating_pdf",
  "delivered",
];

export default async function PreviewPage({
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
    .select("id, person_name, status, access_token, access_token_expires_at")
    .eq("id", orderId)
    .single();

  if (!order) {
    return <ErrorMessage>הזמנה לא נמצאה.</ErrorMessage>;
  }

  const tokenResult = validateAccessToken(
    token,
    order.access_token as string | null,
    order.access_token_expires_at as string | null
  );

  if (!tokenResult.valid) {
    return <ErrorMessage>קישור לא תקין או שפג תוקפו.</ErrorMessage>;
  }

  // Gate: customer can only view album after admin publishes it
  const currentStatus = order.status as OrderStatus;
  if (!CUSTOMER_VISIBLE_STATUSES.includes(currentStatus)) {
    return (
      <ErrorMessage>
        האלבום שלכם עדיין בהכנה — נעדכן אתכם כשיהיה מוכן לצפייה.
      </ErrorMessage>
    );
  }

  const personName = (order.person_name as string | null) || "האדם היקר";
  const previewData = await loadPreviewData(orderId, personName);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      {/* Page header */}
      <div className="mb-8 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/60 font-semibold mb-3">
          תצוגה מקדימה
        </p>
        <h1 className="text-2xl font-semibold sm:text-3xl">
          סיפורו של {personName}
        </h1>
      </div>

      <AlbumPreview data={previewData} />
    </div>
  );
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center text-muted-foreground">
      {children}
    </div>
  );
}
