import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccessToken } from "@/lib/access-token";
import { PhotoGallery } from "@/components/photos/PhotoGallery";
import type { Photo } from "@/types/questionnaire";

export default async function PhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { orderId } = await params;
  const { token = "" } = await searchParams;

  const supabase = createAdminClient();

  // Validate token
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

  // Fetch existing photos
  const { data: photos } = await supabase
    .from("photos")
    .select(
      "id, original_filename, life_stage, display_order, caption, is_uploaded, original_storage_path"
    )
    .eq("order_id", orderId)
    .eq("is_uploaded", true)
    .order("display_order");

  // Generate signed display URLs for uploaded photos
  const photosWithUrls = await Promise.all(
    (photos ?? []).map(async (photo) => {
      const { data: signed } = await supabase.storage
        .from("originals")
        .createSignedUrl(photo.original_storage_path, 3600);
      return { ...photo, display_url: signed?.signedUrl ?? null };
    })
  );

  return (
    <PhotoGallery
      orderId={orderId}
      token={token}
      initialPhotos={photosWithUrls as (Photo & { display_url: string | null })[]}
    />
  );
}
