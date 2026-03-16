/**
 * CardCom payment provider — redirect (LowProfile) flow.
 *
 * Flow:
 * 1. Server creates a LowProfile payment page via CardCom API
 * 2. User is redirected to CardCom hosted payment page
 * 3. CardCom sends server-to-server report (webhook) on completion
 * 4. User is redirected back to our success/failure page
 *
 * CardCom API docs: https://kb.cardcom.co.il/article/lowprofile-api/
 */

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function getConfig() {
  const terminalNumber = process.env.CARDCOM_TERMINAL_NUMBER;
  const apiName = process.env.CARDCOM_API_NAME;
  const apiPassword = process.env.CARDCOM_API_PASSWORD;

  if (!terminalNumber || !apiName || !apiPassword) {
    throw new Error(
      "Missing CardCom credentials: CARDCOM_TERMINAL_NUMBER, CARDCOM_API_NAME, CARDCOM_API_PASSWORD"
    );
  }

  return {
    terminalNumber,
    apiName,
    apiPassword,
    // Use test endpoint when CARDCOM_TEST_MODE=true
    baseUrl:
      process.env.CARDCOM_TEST_MODE === "true"
        ? "https://secure.cardcom.solutions/Interface"
        : "https://secure.cardcom.solutions/Interface",
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreatePaymentPageParams {
  /** Total in ILS (integer, e.g., 2200) */
  totalIls: number;
  /** Product description shown on CardCom page */
  productName: string;
  /** Our opaque reference — returned in webhook as ReturnValue */
  returnValue: string;
  /** URL CardCom redirects user to on success */
  successUrl: string;
  /** URL CardCom redirects user to on failure/cancel */
  failureUrl: string;
  /** URL CardCom sends server-to-server report to */
  webhookUrl: string;
  /** Customer name for invoice */
  customerName?: string;
  /** Customer email for invoice */
  customerEmail?: string;
  /** Customer phone for invoice */
  customerPhone?: string;
  /** Number of payments (1 = single charge) */
  numOfPayments?: number;
  /** Invoice description line */
  invoiceDescription?: string;
}

export interface CreatePaymentPageResult {
  success: boolean;
  /** The LowProfileCode — used to build the redirect URL */
  lowProfileCode: string | null;
  /** Full URL to redirect the user to */
  redirectUrl: string | null;
  /** Raw API response for audit */
  rawResponse: Record<string, unknown>;
  /** Error message if failed */
  error: string | null;
}

export interface CardComWebhookPayload {
  /** "0" = success */
  ResponseCode?: string;
  Description?: string;
  /** Our ReturnValue passed at creation */
  ReturnValue?: string;
  /** CardCom internal deal number */
  InternalDealNumber?: string;
  /** CardCom approval number */
  ApprovalNumber?: string;
  /** Invoice number if issued */
  InvoiceNumber?: string;
  /** Invoice type */
  InvoiceType?: string;
  /** Last 4 digits of card */
  CardLastFourDigits?: string;
  /** Number of payments */
  NumOfPayments?: string;
  /** Amount charged */
  Amount?: string;
  /** Operation (charge/refund/etc.) */
  Operation?: string;
  /** Low profile code */
  LowProfileCode?: string;
  /** Allow any other fields CardCom may send */
  [key: string]: string | undefined;
}

// ---------------------------------------------------------------------------
// API: Create payment page
// ---------------------------------------------------------------------------

export async function createPaymentPage(
  params: CreatePaymentPageParams
): Promise<CreatePaymentPageResult> {
  const config = getConfig();

  // Build form data for CardCom LowProfile API
  const body = new URLSearchParams();
  body.append("TerminalNumber", config.terminalNumber);
  body.append("ApiName", config.apiName);
  body.append("ApiPassword", config.apiPassword);
  body.append("ReturnValue", params.returnValue);
  body.append("Amount", params.totalIls.toString());
  body.append("SuccessRedirectUrl", params.successUrl);
  body.append("FailedRedirectUrl", params.failureUrl);
  body.append("WebHookUrl", params.webhookUrl);
  body.append("ProductName", params.productName);
  body.append("NumOfPayments", (params.numOfPayments ?? 1).toString());
  body.append("CoinID", "1"); // 1 = ILS
  body.append("Language", "he");

  // Invoice settings — create tax invoice (type 1)
  body.append("InvoiceHead.CustName", params.customerName ?? "");
  body.append("InvoiceHead.SendByEmail", "true");
  body.append("InvoiceHead.Email", params.customerEmail ?? "");
  body.append("InvoiceHead.Phone", params.customerPhone ?? "");
  body.append("InvoiceHead.Language", "he");

  // Invoice line
  body.append("InvoiceLines1.Description", params.invoiceDescription ?? params.productName);
  body.append("InvoiceLines1.Price", params.totalIls.toString());
  body.append("InvoiceLines1.Quantity", "1");

  const url = `${config.baseUrl}/LowProfile.aspx`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const text = await response.text();

    // CardCom returns form-encoded response
    const parsed = parseCardComResponse(text);

    const responseCode = parsed.ResponseCode ?? parsed.responsecode ?? "";
    const lowProfileCode =
      parsed.LowProfileCode ?? parsed.lowprofilecode ?? null;

    if (responseCode === "0" && lowProfileCode) {
      const redirectUrl = `https://secure.cardcom.solutions/External/LowProfileClearing.aspx?LowProfileCode=${lowProfileCode}`;
      return {
        success: true,
        lowProfileCode,
        redirectUrl,
        rawResponse: parsed,
        error: null,
      };
    }

    return {
      success: false,
      lowProfileCode: null,
      redirectUrl: null,
      rawResponse: parsed,
      error:
        parsed.Description ??
        parsed.description ??
        `CardCom error code: ${responseCode}`,
    };
  } catch (err) {
    return {
      success: false,
      lowProfileCode: null,
      redirectUrl: null,
      rawResponse: { fetchError: (err as Error).message },
      error: `Failed to contact CardCom: ${(err as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Parse webhook payload
// ---------------------------------------------------------------------------

export interface ParsedWebhookResult {
  success: boolean;
  returnValue: string;
  transactionId: string | null;
  approvalNumber: string | null;
  invoiceNumber: string | null;
  invoiceType: string | null;
  amount: number | null;
  lowProfileCode: string | null;
  responseCode: string;
  description: string;
  raw: CardComWebhookPayload;
}

export function parseWebhookPayload(
  payload: CardComWebhookPayload
): ParsedWebhookResult {
  const responseCode = payload.ResponseCode ?? "";
  const success = responseCode === "0";

  return {
    success,
    returnValue: payload.ReturnValue ?? "",
    transactionId: payload.InternalDealNumber ?? null,
    approvalNumber: payload.ApprovalNumber ?? null,
    invoiceNumber: payload.InvoiceNumber ?? null,
    invoiceType: payload.InvoiceType ?? null,
    amount: payload.Amount ? parseFloat(payload.Amount) : null,
    lowProfileCode: payload.LowProfileCode ?? null,
    responseCode,
    description: payload.Description ?? "",
    raw: payload,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse CardCom's form-encoded or key=value response into an object. */
function parseCardComResponse(text: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Try JSON first (some endpoints return JSON)
  try {
    const json = JSON.parse(text);
    if (typeof json === "object" && json !== null) {
      for (const [k, v] of Object.entries(json)) {
        result[k] = String(v);
      }
      return result;
    }
  } catch {
    // Not JSON, try URL-encoded
  }

  // Parse as URL-encoded
  const params = new URLSearchParams(text);
  for (const [k, v] of params.entries()) {
    result[k] = v;
  }

  return result;
}
