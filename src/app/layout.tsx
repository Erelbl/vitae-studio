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
  icons: {
    icon: "/assets/logo.png",
    shortcut: "/assets/logo.png",
    apple: "/assets/logo.png",
  },
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
