"use client";

import { useState } from "react";
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

export default function LandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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
        router.push(`/order/${id}/questionnaire?token=${access_token}`);
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
            size="sm"
            onClick={handleStartOrder}
            disabled={loading}
            className="rounded-full px-5 text-sm"
          >
            {loading ? "טוען..." : "התחילו"}
          </Button>
        </div>
      </header>

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
