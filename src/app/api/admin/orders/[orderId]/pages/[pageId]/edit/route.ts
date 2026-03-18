import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LAYOUT_TYPES, TEXT_COLORS, TEXT_SIZES } from "@/types/page";

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

  let body: {
    text_content?: string | null;
    layout_type?: string;
    text_size?: string;
    font_size_px?: number | null;
    text_align?: string | null;
    text_x?: number | null;
    text_y?: number | null;
    text_color?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Verify page belongs to this order.
  // NOTE: text_size is NOT included here — it requires migration 00027 which may not
  // be applied yet. Including it would cause this query to fail silently (data:null)
  // and incorrectly return 404 for every text/layout edit. text_size is updated
  // unconditionally below when provided; the DB update handles the absent-column case.
  const { data: page } = await adminClient
    .from("pages")
    .select("id, text_content, text_version, layout_type")
    .eq("id", pageId)
    .eq("order_id", orderId)
    .single();

  // Check whether the current text version was already created by an admin edit.
  // If so, subsequent edits overwrite that same version row rather than adding a new one.
  // This prevents noisy version history from routine editing.
  let latestAdminVersionId: string | null = null;
  if (page && body.text_content !== undefined) {
    const { data: latestVersion } = await adminClient
      .from("page_versions")
      .select("id, created_by")
      .eq("page_id", pageId)
      .eq("version_type", "text")
      .eq("version_number", (page.text_version as number) ?? 1)
      .maybeSingle();
    if (latestVersion?.created_by === "admin_edit") {
      latestAdminVersionId = latestVersion.id as string;
    }
  }

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

  // Validate text_size if provided (legacy enum — still supported for backward compat)
  if (
    body.text_size !== undefined &&
    !TEXT_SIZES.includes(body.text_size as (typeof TEXT_SIZES)[number])
  ) {
    return NextResponse.json(
      { error: `Invalid text_size: ${body.text_size}` },
      { status: 400 }
    );
  }

  // Validate font_size_px if provided — must be an integer in [8, 72]
  if (body.font_size_px !== undefined && body.font_size_px !== null) {
    const fpx = body.font_size_px;
    if (!Number.isInteger(fpx) || fpx < 8 || fpx > 72) {
      return NextResponse.json(
        { error: `Invalid font_size_px: ${fpx}` },
        { status: 400 }
      );
    }
  }

  // Validate text_align if provided
  if (
    body.text_align !== undefined &&
    body.text_align !== null &&
    !["left", "center", "right"].includes(body.text_align)
  ) {
    return NextResponse.json(
      { error: `Invalid text_align: ${body.text_align}` },
      { status: 400 }
    );
  }

  // Validate text_x and text_y if provided — must be 0–1 floats
  for (const key of ["text_x", "text_y"] as const) {
    const v = body[key];
    if (v !== undefined && v !== null && (typeof v !== "number" || v < 0 || v > 1)) {
      return NextResponse.json(
        { error: `Invalid ${key}: ${v}` },
        { status: 400 }
      );
    }
  }

  const updates: Record<string, unknown> = {};
  let newTextVersion: number | null = null;

  // Handle text_content change with versioning.
  // If the current version was already an admin edit, we overwrite it in place
  // (no version number increment) — routine editing should not create version noise.
  // Only when overwriting a generation-created version do we increment and create a new row.
  if (
    body.text_content !== undefined &&
    body.text_content !== page.text_content
  ) {
    const currentVersion = (page.text_version as number) ?? 1;
    if (latestAdminVersionId) {
      // Overwrite the existing admin-edit version in place — same version number
      newTextVersion = currentVersion; // unchanged
    } else {
      // First admin edit after a generation-created version → new version number
      newTextVersion = currentVersion + 1;
    }
    updates.text_content = body.text_content;
    updates.text_version = newTextVersion;
    updates.admin_text_override = true;
  }

  // Handle layout_type change (no versioning needed)
  if (body.layout_type !== undefined && body.layout_type !== page.layout_type) {
    updates.layout_type = body.layout_type;
  }

  // Handle text_size change (legacy enum — always apply if provided)
  if (body.text_size !== undefined) {
    updates.text_size = body.text_size;
  }

  // Handle font_size_px change (numeric override — from migration 00028)
  if (body.font_size_px !== undefined) {
    updates.font_size_px = body.font_size_px;
  }

  // Handle text_align change
  if (body.text_align !== undefined) {
    updates.text_align = body.text_align;
  }

  // Handle free text position (null clears back to layout-default)
  if (body.text_x !== undefined) {
    updates.text_x = body.text_x;
  }
  if (body.text_y !== undefined) {
    updates.text_y = body.text_y;
  }

  // Handle text color
  if (body.text_color !== undefined) {
    if (
      body.text_color !== null &&
      !TEXT_COLORS.includes(body.text_color as (typeof TEXT_COLORS)[number])
    ) {
      return NextResponse.json(
        { error: `Invalid text_color: ${body.text_color}` },
        { status: 400 }
      );
    }
    updates.text_color = body.text_color;
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

  // If text changed, record or update the page_version entry.
  // When latestAdminVersionId is set we UPDATE the existing row (same version number).
  // Otherwise we INSERT a new version row (first admin edit after a generation).
  if (newTextVersion !== null && body.text_content !== undefined) {
    if (latestAdminVersionId) {
      await adminClient
        .from("page_versions")
        .update({ content: body.text_content ?? "" })
        .eq("id", latestAdminVersionId);
    } else {
      await adminClient.from("page_versions").insert({
        page_id: pageId,
        version_type: "text",
        version_number: newTextVersion,
        content: body.text_content ?? "",
        created_by: "admin_edit",
      });
    }
  }

  return NextResponse.json({ ok: true, changed: true });
}
