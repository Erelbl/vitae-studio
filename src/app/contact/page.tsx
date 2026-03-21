import Link from "next/link";
import Image from "next/image";
import { CONTACT_INFO } from "@/content/legal/contact";

export const metadata = { title: "צור קשר – Vitae Studio" };

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="relative block h-8 w-32">
            <Image src="/assets/Logo.png" alt="Vitae Studio" fill className="object-contain" />
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            חזרה לעמוד הבית
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">{CONTACT_INFO.title}</h1>
          <p className="mt-2 text-base text-muted-foreground">{CONTACT_INFO.subtitle}</p>
        </div>

        <div className="space-y-4">
          {/* Email */}
          <a
            href={CONTACT_INFO.email.href}
            className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg">
              ✉️
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{CONTACT_INFO.email.label}</p>
              <p className="font-medium">{CONTACT_INFO.email.value}</p>
            </div>
          </a>

          {/* WhatsApp */}
          <a
            href={CONTACT_INFO.whatsapp.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg">
              💬
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{CONTACT_INFO.whatsapp.label}</p>
              <p className="font-medium">{CONTACT_INFO.whatsapp.value}</p>
            </div>
          </a>

          {/* Hours */}
          <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg">
              🕐
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{CONTACT_INFO.hours.label}</p>
              <p className="font-medium">{CONTACT_INFO.hours.value}</p>
            </div>
          </div>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">{CONTACT_INFO.responseTime}</p>
        <p className="mt-1 text-sm text-muted-foreground">{CONTACT_INFO.formNote}</p>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 px-4 py-8 text-center text-xs text-muted-foreground/60">
        Vitae Studio &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
