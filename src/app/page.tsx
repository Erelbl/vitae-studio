"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { num: "1", title: "ספרו", desc: "מלאו שאלון מעמיק על סיפור החיים — תקופות, זיכרונות, ערכים" },
  { num: "2", title: "העלו", desc: "בחרו תמונות מכל תקופה בחיים — אנחנו נדאג לשאר" },
  { num: "3", title: "ניצור", desc: "הצוות שלנו הופך את הסיפור לחרוזים ואיורי צבעי מים" },
  { num: "4", title: "קבלו", desc: "אלבום מודפס ומחויט — מתנה שנשמרת לדורות" },
];

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

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative flex min-h-[88vh] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">

        {/* Ambient background blobs */}
        <div className="pointer-events-none absolute -end-24 -top-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -start-16 bottom-8 h-72 w-72 rounded-full bg-secondary blur-2xl" />
        <div className="pointer-events-none absolute end-8 bottom-20 h-48 w-48 rounded-full bg-primary/6 blur-2xl" />

        <div className="relative z-10 flex flex-col items-center gap-6 sm:gap-8">

          {/* Label badge */}
          <div className="inline-flex items-center rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-sm font-medium text-primary">
            מתנה שלא נשכחת ✦
          </div>

          {/* Headline */}
          <h1 className="max-w-lg text-5xl font-bold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            סיפור חיים
            <br />
            <span className="text-primary">בחרוזים</span>
          </h1>

          {/* Subheading */}
          <p className="max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            אלבום מאויר אישי ומרגש — הופכים זיכרונות אמיתיים
            <br className="hidden sm:block" />
            לסיפור בצבעי מים עם חרוזים מותאמים אישית
          </p>

          {/* CTA */}
          <Button
            size="lg"
            onClick={handleStartOrder}
            disabled={loading}
            className="mt-2 w-full max-w-xs rounded-full px-8 py-5 text-base font-semibold shadow-md transition-all hover:shadow-lg sm:w-auto sm:px-12 sm:py-6 sm:text-lg"
          >
            {loading ? "טוען..." : "התחילו את האלבום שלכם"}
          </Button>

          {/* Trust note */}
          <p className="text-xs text-muted-foreground/70">
            ✦ ללא התחייבות מראש · תהליך פשוט ומודרך
          </p>
        </div>
      </section>

      {/* ── Divider ──────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-8 py-2 opacity-40">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">✦</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="bg-card px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl">איך זה עובד?</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              ארבעה שלבים פשוטים — מהסיפור שלכם לאלבום ביד
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.num}
                className="group rounded-2xl border border-border/60 bg-background p-6 text-center shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/15">
                  <span className="text-base font-bold text-primary">{f.num}</span>
                </div>
                <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Value proposition strip ───────────────────────────── */}
      <section className="border-t border-border/50 bg-secondary/40 px-4 py-10">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <p className="text-lg font-medium leading-relaxed sm:text-xl">
            &ldquo;כי כל חיים הם סיפור שראוי להיזכר — בשפה של שיר&rdquo;
          </p>
          <div className="h-px w-16 bg-primary/30" />
          <p className="text-sm text-muted-foreground">Vitae Studio</p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-border/50 px-4 py-6 text-center text-xs text-muted-foreground/70">
        <p>Vitae Studio &copy; {new Date().getFullYear()} · מתנה שלא נשכחת</p>
      </footer>
    </div>
  );
}
