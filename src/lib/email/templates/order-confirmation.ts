/**
 * Combined order email template: payment received + order confirmed.
 * Sent after successful payment.
 */

interface OrderConfirmationParams {
  personName: string;
  buyerName: string;
}

export function orderConfirmationEmailHtml({
  personName,
  buyerName,
}: OrderConfirmationParams): string {
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
            התשלום התקבל בהצלחה ✓
          </p>

          <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#4a4a4a;">
            ההזמנה שלך עבור <strong>${personName}</strong> התקבלה ואנחנו מתחילים לעבוד על האלבום.
          </p>

          <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#4a4a4a;">
            בימים הקרובים ניצור את הסיפור והאיורים. כשהתצוגה המקדימה תהיה מוכנה — נשלח לך מייל עם קישור לצפייה ואישור.
          </p>

          <p style="margin:0 0 0;font-size:16px;line-height:1.6;color:#4a4a4a;">
            אם יהיו לנו שאלות, ניצור איתך קשר.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 24px 28px;text-align:center;border-top:1px solid #eee;">
          <p style="margin:0;font-size:13px;color:#999;">Vitae Studio — סיפור החיים שלך, בחרוזים</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const ORDER_CONFIRMATION_SUBJECT = "ההזמנה התקבלה — Vitae Studio";
