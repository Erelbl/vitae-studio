import type { Metadata } from "next";
import { Assistant } from "next/font/google";
import Script from "next/script";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const GA_ID = "G-5E1RTFK9J1";

const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vitaestudio.co.il";
const OG_IMAGE = `${SITE_URL}/icon-512.png`; // replace with a dedicated 1200×630 social image when available

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Vitae Studio - סיפור חיים בחרוזים",
  description: "אלבום סיפור חיים מאויר בחרוזים - מתנה אישית ומרגשת",

  // Open Graph — controls how the link looks when shared on WhatsApp, Facebook, etc.
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Vitae Studio",
    title: "Vitae Studio - סיפור חיים בחרוזים",
    description: "הופכים סיפור חיים לאלבום מאויר בחרוזים — מתנה שנשמרת לדורות",
    locale: "he_IL",
    images: [
      {
        url: OG_IMAGE,
        width: 512,
        height: 512,
        alt: "Vitae Studio לוגו",
      },
    ],
  },

  // Twitter / X card
  twitter: {
    card: "summary",
    title: "Vitae Studio - סיפור חיים בחרוזים",
    description: "הופכים סיפור חיים לאלבום מאויר בחרוזים — מתנה שנשמרת לדורות",
    images: [OG_IMAGE],
  },

  // Favicon + icons are served automatically from src/app/favicon.ico and src/app/icon.png
  // Apple touch icon from src/app/apple-icon.png
  // Web app manifest from src/app/manifest.ts
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${assistant.variable} font-sans antialiased`}>
        {children}
        <Toaster />
        <Analytics />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
