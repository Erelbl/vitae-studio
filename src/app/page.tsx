"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { HeroSection } from "@/components/home/HeroSection";
import { HowItWorks } from "@/components/home/HowItWorks";
import { UseCases } from "@/components/home/UseCases";
import { Gallery } from "@/components/home/Gallery";
import { PremiumValue } from "@/components/home/PremiumValue";
import { FounderSection } from "@/components/home/FounderSection";
import { FinalCta } from "@/components/home/FinalCta";
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
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          {/* Logo — replace /assets/Logo.png with your final logo file */}
          <Image
            src="/assets/Logo.png"
            alt="Vitae Studio"
            width={120}
            height={40}
            className="h-10 w-auto object-contain"
            priority
          />
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
        <HeroSection onStartOrder={handleStartOrder} loading={loading} />

        <SectionDivider />

        <HowItWorks />

        <UseCases />

        <Gallery />

        <PremiumValue />

        <FounderSection />

        <FinalCta onStartOrder={handleStartOrder} loading={loading} />
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-border/50 bg-background px-4 py-6 text-center text-xs text-muted-foreground/60">
        <p>
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
