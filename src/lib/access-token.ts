import { randomBytes } from "crypto";

// Access tokens are 32 random bytes encoded as hex (64-character string).
// They are stored in orders.access_token and must accompany every customer-facing
// request to preview or interact with an order's content.
//
// Expiry: 30 days from generation. Tokens do not auto-renew on view.
// Admin can regenerate a token at any time (old token is immediately invalidated).

export const ACCESS_TOKEN_BYTES = 32;
export const ACCESS_TOKEN_EXPIRY_DAYS = 30;

/** Generate a new cryptographically random access token. */
export function generateAccessToken(): string {
  return randomBytes(ACCESS_TOKEN_BYTES).toString("hex");
}

/** Return the expiry date for a freshly generated token (now + 30 days). */
export function generateAccessTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + ACCESS_TOKEN_EXPIRY_DAYS);
  return expiry;
}

/** Return true if the stored expiry timestamp is in the past or missing. */
export function isAccessTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt) < new Date();
}

export type TokenValidationResult =
  | { valid: true }
  | { valid: false; reason: "missing_token" | "no_token_on_record" | "token_mismatch" | "token_expired" };

/**
 * Validate a token supplied by the caller against what is stored on the order.
 *
 * Call this in every API route and page that exposes order-specific content.
 * On failure, respond with 403 — do not reveal which check failed.
 */
export function validateAccessToken(
  suppliedToken: string | null | undefined,
  storedToken: string | null,
  expiresAt: string | null
): TokenValidationResult {
  if (!suppliedToken) {
    return { valid: false, reason: "missing_token" };
  }
  if (!storedToken) {
    return { valid: false, reason: "no_token_on_record" };
  }
  // Use a timing-safe comparison to prevent timing attacks.
  // Both strings are hex-encoded and should be the same length, but we guard
  // the comparison with a length check first to avoid exceptions.
  if (suppliedToken.length !== storedToken.length) {
    return { valid: false, reason: "token_mismatch" };
  }
  const supplied = Buffer.from(suppliedToken, "utf8");
  const stored = Buffer.from(storedToken, "utf8");
  if (!timingSafeEqual(supplied, stored)) {
    return { valid: false, reason: "token_mismatch" };
  }
  if (isAccessTokenExpired(expiresAt)) {
    return { valid: false, reason: "token_expired" };
  }
  return { valid: true };
}

/**
 * Constant-time string comparison using Node's crypto.timingSafeEqual.
 * Falls back to direct comparison if buffers differ in length (already rejected above).
 */
function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  // Node's timingSafeEqual is in the 'crypto' module but we need to import it
  // separately since it's not re-exported from 'crypto' in all environments.
  try {
    const { timingSafeEqual: tse } = require("crypto") as typeof import("crypto");
    return tse(a, b);
  } catch {
    // Should not happen in Node.js, but fail closed.
    return false;
  }
}
