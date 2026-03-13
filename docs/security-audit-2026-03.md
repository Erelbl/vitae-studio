# Security Audit — March 2026

## Summary

A full review of all API routes, middleware, auth patterns, storage access, input validation,
environment variable usage, and security headers.

---

## Findings

### FIXED — HIGH: Questionnaire endpoint had no token validation

**File:** `src/app/api/orders/[orderId]/questionnaire/route.ts`

The `POST` handler accepted any request for any `orderId` without validating the caller's
access token. An attacker who guessed a valid UUID could overwrite any order's questionnaire
data, including triggering status transitions to `enrichment_complete`.

**Fix:** Added `authorizeOrderRequest()` call using the token from `?token=` query param.
Also updated `QuestionnaireWizard.tsx` to include `?token=${token}` in the fetch URL
(the token was already in the component's props but was not being forwarded).

---

### FIXED — HIGH: Bare order route allowed arbitrary field updates with no auth

**File:** `src/app/api/orders/[orderId]/route.ts`

- `GET` returned `SELECT *` (including `access_token`) for any `orderId` with no token check.
- `PATCH` accepted any arbitrary JSON body and passed it directly to `.update(body)` using the
  service-role Supabase client. This meant an unauthenticated caller who knew an order UUID
  could update any column, including `status`, `payment_status`, or `access_token`.

No UI component called these routes; they appeared to be legacy/utility endpoints.

**Fix:**
- `GET` now requires a valid `?token=` and returns only non-sensitive columns (no `access_token`).
- `PATCH` is now admin-only (requires `user.app_metadata.role === "admin"`) and validates the
  request body against a strict Zod allowlist of safe metadata fields.

---

### FIXED — MEDIUM: No security headers

**File:** `next.config.ts`

No HTTP security headers were configured.

**Fix:** Added the following baseline headers to all routes:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

**Not added (intentionally deferred):** `Content-Security-Policy` — the app loads Supabase
storage URLs, Google Fonts, third-party scripts, and inline styles from `@react-pdf/renderer`.
A strict CSP would require per-environment tuning. See TODO below.

---

## Positive Findings (no changes needed)

| Area | Assessment |
|------|-----------|
| Service-role key exposure | `SUPABASE_SERVICE_ROLE_KEY` is server-only; never in `NEXT_PUBLIC_*` |
| Admin auth in all `/api/admin/*` routes | Every route checks `user.app_metadata.role === "admin"` |
| Middleware admin guard | Correctly protects `/admin/*` pages |
| Access token implementation | 256-bit random, timing-safe comparison, 30-day expiry |
| Photo upload validation | MIME whitelist + 10 MB limit + count limits |
| Storage URLs | All signed (not public), with appropriate short expiry |
| Questionnaire Zod validation | Server-side validation with min/max lengths on all fields |
| Order deletion storage cleanup | Collects and deletes all storage paths before DB cascade |
| Photo deletion lifecycle guard | Blocks deletion after generation has started |
| Crop/zoom parameter clamping | Range-clamped server-side (`Math.max/min`) |

---

## Outstanding TODOs (not fixed — require more investigation or platform choice)

### TODO: Content-Security-Policy
Add a proper CSP once all external asset origins are enumerated (Supabase storage bucket URL,
Google Fonts, any CDN scripts). Start with a `report-only` mode to avoid breaking the app.

### TODO: Rate limiting on expensive AI endpoints
Endpoints like `/api/orders/[orderId]/generate-story`, `/api/admin/orders/[orderId]/improve-rhyme`,
and `/api/admin/orders/[orderId]/generate-illustrations` invoke Claude/Gemini and can cost real
money per call. There is currently no rate limiting.

Options (in order of preference):
1. **Upstash Redis** (`@upstash/ratelimit`) — works with Vercel serverless, minimal setup.
2. **Vercel's built-in rate-limit headers** — available on Pro/Enterprise plans.
3. **Supabase counter table** — works without extra infrastructure but adds latency.

A simple in-memory approach was intentionally not implemented because it provides no protection
across Vercel function instances.

### TODO: NEXT_PUBLIC_SITE_URL in .env.example
The admin logout route falls back to `http://localhost:3000` if `NEXT_PUBLIC_SITE_URL` is not
set. Add this variable to `.env.example` and ensure it is set in Vercel's production environment.

### TODO: Soft-delete / audit trail for order deletion
Order deletion is currently a hard cascade with no recovery path. Consider:
- Adding a `deleted_at` column and filtering it in queries (soft delete).
- Or writing a `deleted_orders` audit log row before the hard delete.
This requires a schema migration and is out of scope for this hardening pass.

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/api/orders/[orderId]/questionnaire/route.ts` | Added token validation via `authorizeOrderRequest` |
| `src/components/questionnaire/QuestionnaireWizard.tsx` | Pass `?token=` to questionnaire API call |
| `src/app/api/orders/[orderId]/route.ts` | GET: token + column whitelist; PATCH: admin-only + Zod schema |
| `next.config.ts` | Added baseline security headers |
