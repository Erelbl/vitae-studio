"use client";

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const POPUP_KEY = "vitae_landing_april_popup_views";
const MAX_VIEWS = 2;
const EXPIRY = new Date("2026-04-30T23:59:59");

function getTimeLeft() {
  const diff = EXPIRY.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  };
}

interface Props {
  onScrollToOrder: () => void;
}

export function AprilPromoPopup({ onScrollToOrder }: Props) {
  const [visible, setVisible] = useState(false);
  const [timeLeft, setTimeLeft] = useState(getTimeLeft());

  useEffect(() => {
    if (Date.now() > EXPIRY.getTime()) return;
    try {
      const views = parseInt(localStorage.getItem(POPUP_KEY) ?? "0", 10);
      if (views < MAX_VIEWS) {
        localStorage.setItem(POPUP_KEY, String(views + 1));
        const t = setTimeout(() => setVisible(true), 900);
        return () => clearTimeout(t);
      }
    } catch { /* localStorage unavailable */ }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  if (!visible || !timeLeft) return null;

  const cardStyle: React.CSSProperties = {
    animation: "popupSpring 380ms cubic-bezier(0.22, 1, 0.36, 1) both",
  };

  function handleCta() {
    setVisible(false);
    onScrollToOrder();
  }

  const units = [
    { value: timeLeft.days,    label: "ימים"  },
    { value: timeLeft.hours,   label: "שעות"  },
    { value: timeLeft.minutes, label: "דקות"  },
    { value: timeLeft.seconds, label: "שניות" },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <style>{`
        @keyframes popupSpring {
          0%   { opacity: 0; transform: scale(0.88); }
          65%  { opacity: 1; transform: scale(1.04); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setVisible(false)}
      />

      {/* Card */}
      <div style={cardStyle} className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#8F9F7A]/20 bg-[#FAF8F2] shadow-2xl">
        {/* Top accent strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#8F9F7A]/60 via-[#8F9F7A] to-[#8F9F7A]/60" />

        <div className="px-7 pb-8 pt-6">
          {/* Close */}
          <button
            onClick={() => setVisible(false)}
            aria-label="סגור"
            className="absolute end-4 top-4 rounded-full p-1 text-foreground/35 transition-colors hover:bg-foreground/8 hover:text-foreground/60"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Title */}
          <h2 className="mb-3 text-center text-[1.6rem] font-bold leading-snug text-foreground">
            מבצע השקה מיוחד לאפריל
          </h2>

          {/* Body */}
          <p className="mb-1 text-center text-[0.9rem] leading-relaxed text-foreground/65">
            כל חודש אפריל תוכלו ליהנות מ־10% הנחה על הזמנה עם הקופון{" "}
            <span className="font-bold text-[#8F9F7A]">APRIL10</span>.
          </p>
          <p className="mb-5 text-center text-[0.9rem] leading-relaxed text-foreground/65">
            אם חיכיתם לרגע הנכון להתחיל את האלבום שלכם, זה הזמן!
          </p>

          {/* Coupon block */}
          <div className="mb-6 flex items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#8F9F7A]/40 bg-[#8F9F7A]/8 px-5 py-3">
            <span className="text-xs text-foreground/45">קוד קופון:</span>
            <span className="font-mono text-xl font-bold tracking-[0.2em] text-[#8F9F7A]">
              APRIL10
            </span>
          </div>

          {/* Countdown label */}
          <p className="mb-3 text-center text-xs font-medium text-foreground/45">
            נותר למבצע:
          </p>

          {/* Countdown blocks */}
          <div className="mb-6 flex justify-center gap-2.5" dir="ltr">
            {units.map(({ value, label }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className="flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-[#8F9F7A] shadow-[0_2px_8px_rgba(143,159,122,0.35)]">
                  <span className="text-[1.45rem] font-bold tabular-nums leading-none text-white">
                    {String(value).padStart(2, "0")}
                  </span>
                </div>
                <span className="text-[10px] text-foreground/45">{label}</span>
              </div>
            ))}
          </div>

          {/* Primary CTA */}
          <Button
            onClick={handleCta}
            className="w-full rounded-full py-6 text-[1rem] font-semibold shadow-md transition-transform hover:scale-[1.01] active:scale-[0.99]"
          >
            אני רוצה את ההטבה
          </Button>

          {/* Support line */}
          <p className="mt-3 text-center text-[11px] text-foreground/38">
            הקופון בתוקף עד סוף אפריל בלבד.
          </p>

          {/* Secondary CTA */}
          <button
            onClick={() => setVisible(false)}
            className="mt-2 w-full text-center text-xs text-foreground/35 transition-colors hover:text-foreground/55"
          >
            אולי אחר כך
          </button>
        </div>
      </div>
    </div>
  );
}
