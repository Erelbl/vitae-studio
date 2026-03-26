import { FadeIn } from "@/components/home/FadeIn";

const SCENES = [
  { src: "/landing-scenes/scene-1.mp4", label: "סצנת פתיחה" },
  { src: "/landing-scenes/scene-2.mp4", label: "רגע מרגש" },
  { src: "/landing-scenes/scene-3.mp4", label: "סיום" },
] as const;

export function FilmPreviewSection() {
  return (
    <section className="bg-[#171c13] px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <FadeIn>
          <div className="mb-10 text-center">
            <span className="mb-3 inline-block text-xs font-semibold tracking-widest text-primary/70 uppercase">
              סרט האלבום
            </span>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">
              הופכים זיכרונות לאלבום חי ונושם
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/55 sm:text-lg mx-auto max-w-xl">
              מתמונות וסיפורים אישיים — אלבום עם איורים, קריינות ותנועה.
              <br className="hidden sm:block" />
              חוויה שרואים פעם אחת ומרגישים לתמיד.
            </p>
          </div>
        </FadeIn>

        {/* Video grid — center card is featured */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-center">
          {SCENES.map((scene, i) => {
            const isFeatured = i === 1;
            return (
              <FadeIn key={scene.src} delay={i * 120}>
                <div
                  className={[
                    "overflow-hidden rounded-2xl ring-1",
                    isFeatured
                      ? "shadow-[0_0_48px_rgba(143,159,122,0.22)] ring-primary/35 sm:-my-4"
                      : "shadow-lg ring-white/8 opacity-85",
                  ].join(" ")}
                >
                  <video
                    src={scene.src}
                    autoPlay
                    muted
                    loop
                    playsInline
                    aria-label={scene.label}
                    className="block w-full aspect-video object-cover"
                  />
                </div>
              </FadeIn>
            );
          })}
        </div>

        {/* Footnote */}
        <FadeIn delay={400}>
          <p className="mt-8 text-center text-xs text-white/30">
            ✦ &nbsp; מתוך אלבום אמיתי שנוצר בוויטה סטודיו
          </p>
        </FadeIn>

      </div>
    </section>
  );
}
