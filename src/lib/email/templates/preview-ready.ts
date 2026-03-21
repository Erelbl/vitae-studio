/**
 * Preview ready email template.
 * Sent when admin publishes the preview to the customer.
 */

interface PreviewReadyParams {
  personName: string;
  buyerName: string;
  previewUrl: string;
}

export function previewReadyEmailHtml({
  personName,
  buyerName,
  previewUrl,
}: PreviewReadyParams): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#FAF8F2;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF8F2;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="background-color:#8F9F7A;padding:32px 24px;text-align:center;">
          <h1 style="margin:0;font-size:24px;color:#ffffff;font-weight:700;">Vitae Studio</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 24px;">
          <h2 style="margin:0 0 16px;font-size:20px;color:#3d3d3d;">שלום ${buyerName},</h2>

          <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#4a4a4a;">
            התצוגה המקדימה של האלבום עבור <strong>${personName}</strong> מוכנה לצפייה!
          </p>

          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#4a4a4a;">
            לחצו על הכפתור למטה כדי לצפות באלבום ולאשר:
          </p>

          <!-- CTA Button -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${previewUrl}"
                 style="display:inline-block;padding:14px 36px;background-color:#8F9F7A;color:#ffffff;font-size:17px;font-weight:600;text-decoration:none;border-radius:8px;">
                לצפייה ולאישור
              </a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 24px 28px;text-align:center;border-top:1px solid #eee;">
          <p style="margin:0 0 6px;font-size:13px;color:#999;">הקישור תקף ל-30 יום.</p>
          <p style="margin:0;font-size:13px;color:#999;">Vitae Studio — סיפור החיים שלך, בחרוזים</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const PREVIEW_READY_SUBJECT = "האלבום מוכן לצפייה — Vitae Studio";
