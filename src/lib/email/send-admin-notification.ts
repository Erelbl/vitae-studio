import { sendEmail } from "@/lib/email/resend";

interface AdminNotificationOptions {
  type: "approved" | "feedback";
  orderId: string;
  personName: string;
  buyerName: string;
  previewRound: number;
  feedback?: string;
}

/**
 * Send internal admin notification when customer approves or sends feedback.
 * Target email is configurable via ADMIN_NOTIFICATION_EMAIL env var.
 */
export async function sendAdminNotificationEmail({
  type,
  orderId,
  personName,
  buyerName,
  previewRound,
  feedback,
}: AdminNotificationOptions) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    console.warn("[admin-notification] ADMIN_NOTIFICATION_EMAIL not set, skipping");
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://studio-vitae.com";
  const adminOrderUrl = `${baseUrl}/admin/orders/${orderId}`;

  const isApproval = type === "approved";
  const subject = isApproval
    ? `לקוח אישר תצוגה מקדימה - ${personName}`
    : `לקוח שלח הערות - ${personName}`;

  const bodyContent = isApproval
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#4a4a4a;text-align:right;">
        הלקוח <strong>${buyerName}</strong> אישר את התצוגה המקדימה של האלבום עבור <strong>${personName}</strong>.
      </p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#4a4a4a;text-align:right;">
        סבב: ${previewRound}
      </p>`
    : `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#4a4a4a;text-align:right;">
        הלקוח <strong>${buyerName}</strong> שלח הערות על התצוגה המקדימה של האלבום עבור <strong>${personName}</strong>.
      </p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#4a4a4a;text-align:right;">
        סבב: ${previewRound}
      </p>
      <div style="margin:16px 0;padding:12px 16px;background:#f5f5f5;border-radius:8px;border-right:3px solid #8F9F7A;">
        <p style="margin:0;font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap;text-align:right;">${escapeHtml(feedback || "")}</p>
      </div>`;

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background-color:#f9f9f9;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f9f9;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:10px;overflow:hidden;direction:rtl;">
        <tr><td style="background-color:${isApproval ? "#4a7c59" : "#b8860b"};padding:20px 24px;text-align:center;">
          <h1 style="margin:0;font-size:18px;color:#ffffff;">${isApproval ? "תצוגה מקדימה אושרה" : "הערות מלקוח"}</h1>
        </td></tr>
        <tr><td style="padding:24px;direction:rtl;text-align:right;">
          ${bodyContent}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
            <tr><td align="center">
              <a href="${adminOrderUrl}"
                 style="display:inline-block;padding:10px 28px;background-color:#8F9F7A;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">
                פתח הזמנה באדמין
              </a>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { data, error } = await sendEmail({
    to: adminEmail,
    subject,
    html,
  });

  if (error) {
    console.error("[admin-notification] Failed:", error);
    throw new Error(`Admin notification failed: ${JSON.stringify(error)}`);
  }

  console.log(`[admin-notification] ${type} notification sent (id: ${data?.id})`);
  return data?.id;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
