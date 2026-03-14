import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // @remotion/renderer uses native Puppeteer/Chrome compositor binaries —
  // it must NOT be bundled by Next.js/Turbopack.
  // @remotion/bundler (rspack) is NOT imported at runtime; the bundle is
  // pre-built via "npm run bundle:remotion" and read from disk at render time.
  serverExternalPackages: [
    "@remotion/renderer",
    "@remotion/compositor-win32-x64-msvc",
    "@remotion/compositor-linux-x64-gnu",
    "@remotion/compositor-linux-x64-musl",
    "@remotion/compositor-linux-arm64-gnu",
    "@remotion/compositor-linux-arm64-musl",
    "@remotion/compositor-darwin-x64",
    "@remotion/compositor-darwin-arm64",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent browsers from MIME-sniffing the response content type
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Only allow framing from the same origin (prevents clickjacking)
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Only send origin in Referer header (no full URL leakage to third parties)
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Restrict access to sensitive browser APIs
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // NOTE: Content-Security-Policy is intentionally omitted here.
          // The app loads Supabase storage assets, Google Fonts, inline styles from
          // @react-pdf/renderer, and dynamic AI-generated content — a strict CSP
          // would require careful per-directive tuning per environment.
          // TODO: Add a scoped CSP once all asset origins are fully enumerated.
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
