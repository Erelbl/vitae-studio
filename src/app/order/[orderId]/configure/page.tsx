import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";
import { OrderConfiguration } from "@/components/checkout/OrderConfiguration";
import { redirect } from "next/navigation";
import type { DeliveryMode, AlbumSize } from "@/types/order";

export default async function ConfigurePage({
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
      "id, status, delivery_mode, album_size, shipping_full_name, shipping_phone, shipping_city, shipping_street, shipping_apartment, shipping_postal_code, shipping_notes, access_token, access_token_expires_at"
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

  // Must have a delivery mode selected
  if (!order.delivery_mode) {
    redirect(`/order/${orderId}/select-product?token=${token}`);
  }

  // Must have completed questionnaire
  if (order.status === "created") {
    redirect(`/order/${orderId}/questionnaire?token=${token}`);
  }

  const deliveryMode = order.delivery_mode as DeliveryMode;
  const albumSize = (order.album_size as AlbumSize) ?? null;

  const initialShipping = order.shipping_full_name
    ? {
        shipping_full_name: (order.shipping_full_name as string) || "",
        shipping_phone: (order.shipping_phone as string) || "",
        shipping_city: (order.shipping_city as string) || "",
        shipping_street: (order.shipping_street as string) || "",
        shipping_apartment: (order.shipping_apartment as string) || "",
        shipping_postal_code: (order.shipping_postal_code as string) || "",
        shipping_notes: (order.shipping_notes as string) || "",
      }
    : undefined;

  return (
    <OrderConfiguration
      orderId={orderId}
      token={token}
      deliveryMode={deliveryMode}
      initialAlbumSize={albumSize}
      initialShipping={initialShipping}
    />
  );
}
