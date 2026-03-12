import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LAYOUT_TYPES } from "@/types/page";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string; pageId: string }> }
) {
  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId, pageId } = await params;

  let body: { text_content?: string | null; layout_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Verify page belongs to this order
  const { data: page } = await adminClient
    .from("pages")
    .select("id, text_content, text_version, layout_type")
    .eq("id", pageId)
    .eq("order_id", orderId)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  // Validate layout_type if provided
  if (
    body.layout_type !== undefined &&
    !LAYOUT_TYPES.includes(body.layout_type as (typeof LAYOUT_TYPES)[number])
  ) {
    return NextResponse.json(
      { error: `Invalid layout_type: ${body.layout_type}` },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  let newTextVersion: number | null = null;

  // Handle text_content change with versioning
  if (
    body.text_content !== undefined &&
    body.text_content !== page.text_content
  ) {
    const currentVersion = (page.text_version as number) ?? 1;
    newTextVersion = currentVersion + 1;
    updates.text_content = body.text_content;
    updates.text_version = newTextVersion;
    updates.admin_text_override = true;
  }

  // Handle layout_type change (no versioning needed)
  if (body.layout_type !== undefined && body.layout_type !== page.layout_type) {
    updates.layout_type = body.layout_type;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, changed: false });
  }

  const { error: updateError } = await adminClient
    .from("pages")
    .update(updates)
    .eq("id", pageId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // If text changed, record a page_version entry
  if (newTextVersion !== null && body.text_content !== undefined) {
    await adminClient.from("page_versions").insert({
      page_id: pageId,
      version_type: "text",
      version_number: newTextVersion,
      content: body.text_content ?? "",
      created_by: "admin_edit",
    });
  }

  return NextResponse.json({ ok: true, changed: true });
}
