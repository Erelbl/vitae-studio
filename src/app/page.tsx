"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
        // Persist token for this order so it survives navigation
        sessionStorage.setItem(`token:${id}`, access_token);
        router.push(`/order/${id}/questionnaire?token=${access_token}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <section className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-20 text-center">
        <h1 className="font-serif text-5xl font-bold leading-tight md:text-7xl">
          סיפור חיים
          <br />
          <span className="text-primary/80">בחרוזים</span>
        </h1>
        <p className="max-w-lg text-lg text-muted-foreground md:text-xl">
          אלבום מאויר אישי ומרגש — הופכים זיכרונות אמיתיים לסיפור בצבעי מים
        </p>
        <Button
          size="lg"
          className="text-lg px-8 py-6"
          onClick={handleStartOrder}
          disabled={loading}
        >
          {loading ? "טוען..." : "התחילו את האלבום שלכם"}
        </Button>
      </section>

      {/* Features Section */}
      <section className="border-t bg-muted/30 px-4 py-16">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "ספרו", desc: "מלאו שאלון חכם על סיפור החיים" },
            { title: "העלו", desc: "העלו תמונות אמיתיות מכל תקופה" },
            { title: "ניצור", desc: "נהפוך הכל לאיורי צבעי מים וחרוזים" },
            { title: "קבלו", desc: "אלבום מודפס — מתנה שלא תשכח" },
          ].map((feature) => (
            <div key={feature.title} className="text-center">
              <h3 className="mb-2 font-serif text-2xl font-bold">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-4 py-8 text-center text-sm text-muted-foreground">
        <p>Vitae Studio &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
