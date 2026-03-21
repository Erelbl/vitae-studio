import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_ACTIONS = ["sent_to_print", "shipped", "completed"] as const;
type FulfillmentAction = (typeof VALID_ACTIONS)[number];

const ACTION_FIELD: Record<FulfillmentAction, string> = {
  sent_to_print: "sent_to_print_at",
  shipped: "shipped_to_customer_at",
  completed: "completed_at",
};

/** Required prior timestamp for each action (prevents skipping steps). */
const ACTION_PREREQ: Record<FulfillmentAction, { field: string; label: string } | null> = {
  sent_to_print: null, // only needs customer approval (checked below)
  shipped: { field: "sent_to_print_at", label: "נשלח להדפסה" },
  completed: { field: "shipped_to_customer_at", label: "נשלח ללקוח" },
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const body = await req.json();
  const action = body.action as FulfillmentAction;

  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  const { data: order, error: fetchError } = await adminClient
    .from("orders")
    .select("id, status, preview_status, sent_to_print_at, shipped_to_customer_at, completed_at")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // For sent_to_print: require customer approval (preview_status === "approved")
  if (action === "sent_to_print") {
    if (order.preview_status !== "approved") {
      return NextResponse.json(
        { error: "ההזמנה עדיין לא אושרה על ידי הלקוח" },
        { status: 409 }
      );
    }
  }

  // Check prerequisite step is done
  const prereq = ACTION_PREREQ[action];
  if (prereq && !order[prereq.field as keyof typeof order]) {
    return NextResponse.json(
      { error: `יש לסמן "${prereq.label}" לפני פעולה זו` },
      { status: 409 }
    );
  }

  // Don't allow re-setting a timestamp that's already set
  const targetField = ACTION_FIELD[action];
  if (order[targetField as keyof typeof order]) {
    return NextResponse.json(
      { error: "פעולה זו כבר בוצעה" },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const { error: updateError } = await adminClient
    .from("orders")
    .update({
      [targetField]: now,
      updated_at: now,
    })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    action,
    timestamp: now,
  });
}
