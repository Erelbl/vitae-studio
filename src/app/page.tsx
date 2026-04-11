"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HeroSection } from "@/components/home/HeroSection";
import { HowItWorks } from "@/components/home/HowItWorks";
import { UseCases } from "@/components/home/UseCases";
import { ImageComparisonSection } from "@/components/home/ImageComparisonSection";
import { PackagesSection } from "@/components/home/PackagesSection";
import { TestimonialsSection } from "@/components/home/TestimonialsSection";
import { FAQSection } from "@/components/home/FAQSection";
import { FounderSection } from "@/components/home/FounderSection";
import { FinalCta } from "@/components/home/FinalCta";
import { ContactSection } from "@/components/home/ContactSection";
import { FilmPreviewSection } from "@/components/home/FilmPreviewSection";
import { AprilPromoPopup } from "@/components/home/AprilPromoPopup";
import { PreStartDialog } from "@/components/home/PreStartDialog";
import { FOOTER } from "@/content/landing-content";
import { trackEvent } from "@/lib/analytics";

const DRAFT_STORAGE_KEY = "vitae_draft";

interface DraftPointer {
  orderId: string;
  token: string;
  updatedAt: string;
}

export default function LandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftPointer | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DraftPointer;
        // Only show if draft is less than 30 days old
        const age = Date.now() - new Date(parsed.updatedAt).getTime();
        if (age < 30 * 24 * 60 * 60 * 1000) {
          setDraft(parsed);
        } else {
          localStorage.removeItem(DRAFT_STORAGE_KEY);
        }
      }
    } catch { /* ok */ }
  }, []);

  function handleResumeDraft() {
    if (draft) {
      router.push(`/order/${draft.orderId}/questionnaire?token=${draft.token}`);
    }
  }

  function handleDismissDraft() {
    setDraft(null);
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* ok */ }
  }

  function handleStartOrder() {
    trackEvent("cta_click", { source: "landing" });
    setDialogOpen(true);
  }

  async function handlePreStartSubmit(buyerName: string, buyerEmail: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_name: "",
          person_gender: "male",
          buyer_name: buyerName,
          buyer_email: buyerEmail,
        }),
      });

      if (res.ok) {
        const { id, access_token } = await res.json();
        trackEvent("start_order");
        setDialogOpen(false);
        router.push(`/order/${id}/album-type?token=${access_token}`);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleScrollToOrder() {
    document.getElementById("final-cta")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">

      <PreStartDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handlePreStartSubmit}
        loading={loading}
      />

      <AprilPromoPopup onScrollToOrder={handleScrollToOrder} />

      {/* ── Sticky nav with logo ──────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          {/* Logo — replace /assets/Logo.png with your final logo file. */}
          <Link href="/" className="relative block h-12 w-44 shrink-0">
            <Image
              src="/assets/Logo.png"
              alt="Vitae Studio"
              fill
              priority
              className="object-contain object-start"
            />
          </Link>
          <Button
            onClick={handleStartOrder}
            disabled={loading}
            className="rounded-full px-6 py-2.5 text-sm font-medium"
          >
            {loading ? "טוען..." : "התחילו כאן"}
          </Button>
        </div>
      </header>

      {/* Draft resume banner */}
      {draft && (
        <div className="border-b border-primary/20 bg-primary/5 px-4 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span className="text-sm text-foreground/80">
              יש לכם שאלון שלא סיימתם למלא
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full text-xs"
                onClick={handleDismissDraft}
              >
                התחל מחדש
              </Button>
              <Button
                size="sm"
                className="rounded-full text-xs"
                onClick={handleResumeDraft}
              >
                המשך מהמקום שעצרת
              </Button>
            </div>
          </div>
        </div>
      )}

      <main>
        {/* Hero with embedded gallery carousel */}
        <HeroSection onStartOrder={handleStartOrder} loading={loading} />

        <SectionDivider />

        <HowItWorks />

        <UseCases />

        <ImageComparisonSection />

        <FilmPreviewSection />

        <PackagesSection />

        <TestimonialsSection />

        <FAQSection />

        <FounderSection />

        <ContactSection />

        <FinalCta onStartOrder={handleStartOrder} loading={loading} />
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-border/50 bg-background px-4 py-10 text-center">
        <Link href="/" className="mx-auto mb-4 relative block h-10 w-40">
          <Image
            src="/assets/Logo.png"
            alt="Vitae Studio"
            fill
            className="object-contain"
          />
        </Link>
        <p className="mb-6 text-sm text-muted-foreground/60">
          Vitae Studio &copy; {new Date().getFullYear()} · {FOOTER.tagline}
        </p>
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground/70">
          <Link href="/terms-of-service" className="transition-colors hover:text-foreground">
            תנאי שימוש
          </Link>
          <Link href="/privacy-policy" className="transition-colors hover:text-foreground">
            מדיניות פרטיות
          </Link>
          <Link href="/shipping-policy" className="transition-colors hover:text-foreground">
            מדיניות משלוחים
          </Link>
          <Link href="/refund-policy" className="transition-colors hover:text-foreground">
            ביטולים והחזרים
          </Link>
          <Link href="/contact" className="transition-colors hover:text-foreground">
            צור קשר
          </Link>
        </nav>
      </footer>

    </div>
  );
}

function SectionDivider() {
  return (
    <div className="flex items-center gap-4 px-8 py-2 opacity-30">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">✦</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
