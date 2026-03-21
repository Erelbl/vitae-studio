import { sendEmail } from "@/lib/email/resend";
import {
  previewReadyEmailHtml,
  PREVIEW_READY_SUBJECT,
} from "@/lib/email/templates/preview-ready";

interface SendPreviewReadyOptions {
  buyerEmail: string;
  buyerName: string;
  personName: string;
  orderId: string;
  accessToken: string;
}

/**
 * Send the preview ready email with a link to the customer preview page.
 * Returns the Resend message ID on success, or throws on failure.
 */
export async function sendPreviewReadyEmail({
  buyerEmail,
  buyerName,
  personName,
  orderId,
  accessToken,
}: SendPreviewReadyOptions) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://studio-vitae.com";
  const previewUrl = `${baseUrl}/order/${orderId}/preview?token=${accessToken}`;

  const html = previewReadyEmailHtml({ personName, buyerName, previewUrl });

  const { data, error } = await sendEmail({
    to: buyerEmail,
    subject: PREVIEW_READY_SUBJECT,
    html,
  });

  if (error) {
    console.error("[email] Preview ready email failed:", error);
    throw new Error(`Failed to send preview ready email: ${JSON.stringify(error)}`);
  }

  console.log(`[email] Preview ready sent to ${buyerEmail} (id: ${data?.id})`);
  return data?.id;
}
