import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { authorizeOrderRequest } from "@/lib/order-auth";

// GET /api/orders/[orderId]?token=...
// Returns order data for authenticated customer (valid access token required).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = request.nextUrl.searchParams.get("token");
  const supabase = createAdminClient();

  const auth = await authorizeOrderRequest(supabase, orderId, token);
  if (!auth.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, created_at, updated_at, buyer_name, buyer_email, buyer_phone, person_name, person_gender, person_birth_date, occasion"
    )
    .eq("id", orderId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// Allowlist of fields an admin may update via this generic PATCH.
// Intentionally narrow — for sensitive transitions use dedicated endpoints.
const patchSchema = z.object({
  person_name: z.string().max(200).optional(),
  person_gender: z.string().max(50).optional(),
  person_birth_date: z.string().nullable().optional(),
  buyer_name: z.string().max(200).optional(),
  buyer_email: z.email().max(320).optional(),
  buyer_phone: z.string().max(50).optional(),
  occasion: z.string().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

// PATCH /api/orders/[orderId]
// Admin-only: update a limited set of non-sensitive order fields.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Admin-only guard
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid fields", details: parsed.error.issues },
      { status: 422 }
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .update(parsed.data)
    .eq("id", orderId)
    .select()
    .single();

  if (error) {
    console.error("Error updating order:", error);
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
