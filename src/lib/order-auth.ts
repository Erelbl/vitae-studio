import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAccessToken } from "@/lib/access-token";

export interface AuthorizedOrder {
  id: string;
  status: string;
  access_token: string | null;
  access_token_expires_at: string | null;
}

export type OrderAuthResult =
  | { ok: true; order: AuthorizedOrder }
  | { ok: false; status: 403 | 404 };

/**
 * Fetch an order and validate the supplied access token.
 * Used in all customer-facing API routes that operate on order data.
 *
 * Returns { ok: false, status: 404 } if the order doesn't exist.
 * Returns { ok: false, status: 403 } if the token is missing, mismatched, or expired.
 */
export async function authorizeOrderRequest(
  supabase: SupabaseClient,
  orderId: string,
  token: string | null
): Promise<OrderAuthResult> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, access_token, access_token_expires_at")
    .eq("id", orderId)
    .single();

  if (error || !order) return { ok: false, status: 404 };

  const result = validateAccessToken(
    token,
    order.access_token as string | null,
    order.access_token_expires_at as string | null
  );

  if (!result.valid) return { ok: false, status: 403 };

  return { ok: true, order: order as AuthorizedOrder };
}
