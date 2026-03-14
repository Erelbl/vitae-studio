import type { Metadata } from "next";
import { Assistant } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Vitae Studio - סיפור חיים בחרוזים",
  description: "אלבום סיפור חיים מאויר בחרוזים - מתנה אישית ומרגשת",
  // Favicon is served from src/app/icon.png — Next.js App Router auto-detects it
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
      </body>
    </html>
  );
}
