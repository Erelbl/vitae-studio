"use client";

import { useState, useRef } from "react";
import { Play } from "lucide-react";
import { FadeIn } from "@/components/home/FadeIn";

const SCENES = [
  { src: "/landing-scenes/scene-1.mp4", label: "סצנת פתיחה" },
  { src: "/landing-scenes/scene-2.mp4", label: "רגע מרגש" },
  { src: "/landing-scenes/scene-3.mp4", label: "סיום" },
] as const;

export function FilmPreviewSection() {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null]);

  function handleActivate(idx: number) {
    // Stop and reset every other video immediately
    videoRefs.current.forEach((el, i) => {
      if (i !== idx && el) {
        el.pause();
        el.currentTime = 0;
      }
    });

    const video = videoRefs.current[idx];
    if (video) {
      video.muted = false;
      video.currentTime = 0;
      video.play().catch(() => {});
    }

    setActiveIdx(idx);
  }

  function handleEnded(idx: number) {
    const el = videoRefs.current[idx];
    if (el) el.currentTime = 0;
    setActiveIdx(null);
  }

  return (
    <section className="bg-secondary/30 px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <FadeIn>
          <div className="mb-12 text-center">
            <span className="mb-3 inline-block text-xs font-semibold tracking-widest text-primary uppercase">
              סרט האלבום
            </span>
            <h2 className="text-3xl font-semibold sm:text-4xl">
              הופכים זיכרונות לאלבום חי ונושם
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg mx-auto max-w-xl">
              מתמונות וסיפורים אישיים לאלבום עם איורים, קריינות ותנועה.
              חוויה שרואים פעם אחת ומרגישים לתמיד.
            </p>
          </div>
        </FadeIn>

        {/* Video grid — center card is slightly featured */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:items-center">
          {SCENES.map((scene, i) => {
            const isFeatured = i === 1;
            const isActive = activeIdx === i;

            return (
              <FadeIn key={scene.src} delay={i * 120}>
                <div
                  className={[
                    "group relative overflow-hidden rounded-2xl bg-black ring-1 transition-shadow duration-300",
                    isFeatured
                      ? "shadow-xl ring-primary/30 sm:-my-4"
                      : "shadow-md ring-border",
                  ].join(" ")}
                >
                  {/* Video element — no autoplay, no muted attr; managed via ref */}
                  <video
                    ref={(el) => { videoRefs.current[i] = el; }}
                    src={scene.src}
                    playsInline
                    preload="metadata"
                    aria-label={scene.label}
                    className="block w-full aspect-video object-cover"
                    onEnded={() => handleEnded(i)}
                  />

                  {/* Play overlay — shown when this scene is not active */}
                  {!isActive && (
                    <button
                      onClick={() => handleActivate(i)}
                      aria-label={`הפעל ${scene.label}`}
                      className="absolute inset-0 flex items-center justify-center bg-black/35 transition-colors duration-200 hover:bg-black/45"
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/90 text-white shadow-lg transition-transform duration-150 group-hover:scale-105">
                        <Play className="h-5 w-5 fill-current translate-x-0.5" />
                      </span>
                    </button>
                  )}
                </div>
              </FadeIn>
            );
          })}
        </div>

        {/* Footnote */}
        <FadeIn delay={400}>
          <p className="mt-10 text-center text-xs text-muted-foreground/50">
            ✦ &nbsp; מתוך אלבום אמיתי שנוצר בוויטה סטודיו
          </p>
        </FadeIn>

      </div>
    </section>
  );
}
