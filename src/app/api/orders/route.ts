import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOrderSchema } from "@/lib/validation/order";
import {
  generateAccessToken,
  generateAccessTokenExpiry,
} from "@/lib/access-token";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .insert({
        person_name: parsed.data.person_name,
        person_gender: parsed.data.person_gender,
        language: parsed.data.language,
        buyer_name: parsed.data.buyer_name,
        buyer_email: parsed.data.buyer_email,
        status: "created",
        access_token: generateAccessToken(),
        access_token_expires_at: generateAccessTokenExpiry().toISOString(),
        ...(parsed.data.delivery_mode && { delivery_mode: parsed.data.delivery_mode }),
      })
      .select("id, access_token")
      .single();

    if (error) {
      console.error("Error creating order:", error);
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 }
      );
    }

    // Create an empty questionnaire_responses row alongside the order.
    await supabase.from("questionnaire_responses").insert({
      order_id: data.id,
    });

    // Return both id and access_token. The client stores the token in
    // sessionStorage and appends it to all subsequent order-scoped URLs.
    return NextResponse.json(
      { id: data.id, access_token: data.access_token },
      { status: 201 }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
