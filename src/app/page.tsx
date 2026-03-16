"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
import { FOOTER } from "@/content/landing-content";

const DRAFT_STORAGE_KEY = "vitae_draft";

interface DraftPointer {
  orderId: string;
  token: string;
  updatedAt: string;
}

export default function LandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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

  async function handleStartOrder() {
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_name: "", person_gender: "male" }),
      });

      if (res.ok) {
        const { id, access_token } = await res.json();
        router.push(`/order/${id}/album-type?token=${access_token}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">

      {/* ── Sticky nav with logo ──────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          {/* Logo — replace /assets/Logo.png with your final logo file. */}
          <div className="relative h-12 w-44 shrink-0">
            <Image
              src="/assets/Logo.png"
              alt="Vitae Studio"
              fill
              priority
              className="object-contain object-start"
            />
          </div>
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

        <PackagesSection />

        <TestimonialsSection />

        <FAQSection />

        <FounderSection />

        <ContactSection />

        <FinalCta onStartOrder={handleStartOrder} loading={loading} />
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-border/50 bg-background px-4 py-8 text-center">
        {/* Logo in footer for brand presence */}
        <div className="mx-auto mb-4 relative h-10 w-40">
          <Image
            src="/assets/Logo.png"
            alt="Vitae Studio"
            fill
            className="object-contain"
          />
        </div>
        <p className="text-sm text-muted-foreground/60">
          Vitae Studio &copy; {new Date().getFullYear()} · {FOOTER.tagline}
        </p>
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
