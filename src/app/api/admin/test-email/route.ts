import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/resend";

/**
 * Manual test route — for internal use only.
 * Usage: POST /api/admin/test-email  { "to": "you@example.com" }
 * Remove or restrict before scaling to production traffic.
 */
export async function POST(req: NextRequest) {
  // Only allow in production on the real domain, or explicitly enable in env
  const isEnabled = process.env.ENABLE_TEST_EMAIL === "true";
  if (!isEnabled) {
    return NextResponse.json(
      { error: "Test email route is disabled. Set ENABLE_TEST_EMAIL=true to enable." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const to: string = body?.to;

  if (!to || !to.includes("@")) {
    return NextResponse.json({ error: "Missing or invalid 'to' email address." }, { status: 400 });
  }

  const { data, error } = await sendEmail({
    to,
    subject: "✅ Vitae Studio — Test Email",
    html: `
      <div dir="rtl" style="font-family: sans-serif; max-width: 480px; margin: auto; padding: 24px;">
        <h2 style="color: #5a6e42;">Vitae Studio — Test Email</h2>
        <p>אם אתה רואה את המייל הזה, שליחת המיילים עובדת כמו שצריך. 🎉</p>
        <p style="color: #888; font-size: 12px;">נשלח מ-<strong>studio-vitae.com</strong> דרך Resend</p>
      </div>
    `,
  });

  if (error) {
    console.error("[test-email] Resend error:", error);
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
