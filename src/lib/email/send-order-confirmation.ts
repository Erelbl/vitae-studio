import { sendEmail } from "@/lib/email/resend";
import {
  orderConfirmationEmailHtml,
  ORDER_CONFIRMATION_SUBJECT,
} from "@/lib/email/templates/order-confirmation";

interface SendOrderConfirmationOptions {
  buyerEmail: string;
  buyerName: string;
  personName: string;
}

/**
 * Send the combined order confirmation email (payment received + order confirmed).
 * Returns the Resend message ID on success, or throws on failure.
 */
export async function sendOrderConfirmationEmail({
  buyerEmail,
  buyerName,
  personName,
}: SendOrderConfirmationOptions) {
  const html = orderConfirmationEmailHtml({ personName, buyerName });

  const { data, error } = await sendEmail({
    to: buyerEmail,
    subject: ORDER_CONFIRMATION_SUBJECT,
    html,
  });

  if (error) {
    console.error("[email] Order confirmation failed:", error);
    throw new Error(`Failed to send order confirmation email: ${JSON.stringify(error)}`);
  }

  console.log(`[email] Order confirmation sent to ${buyerEmail} (id: ${data?.id})`);
  return data?.id;
}
