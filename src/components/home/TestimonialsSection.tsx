import { FadeIn } from "@/components/home/FadeIn";
import { TESTIMONIALS } from "@/content/landing-content";

export function TestimonialsSection() {
  return (
    <section className="bg-card px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-2xl">

        <FadeIn>
          <div className="mb-14 text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">{TESTIMONIALS.title}</h2>
          </div>
        </FadeIn>

        {/* WhatsApp-style chat UI */}
        <div
          className="rounded-2xl border border-border/40 bg-[#e5ddd5]/60 px-4 py-6 shadow-inner"
          dir="rtl"
        >
          {TESTIMONIALS.items.map((msg, i) => {
            // Alternate sides: odd messages appear on the left (like a 2-way chat)
            const isRight = i % 2 === 0;

            return (
              <FadeIn key={i} delay={i * 120}>
                <div
                  className={`mb-3 flex ${isRight ? "justify-end" : "justify-start"}`}
                >
                  {/*
                    Bubble shape — rounded except for the corner with the tail.
                    Right bubble: tail at bottom-right → rounded-br-sm
                    Left bubble:  tail at bottom-left → rounded-bl-sm
                  */}
                  <div
                    className={`relative max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${
                      isRight
                        ? "rounded-br-sm bg-[#dcf8c6] text-gray-800"
                        : "rounded-bl-sm bg-white text-gray-800"
                    }`}
                  >
                    <p className="text-sm leading-relaxed sm:text-base">{msg.text}</p>
                    <p className="mt-1 text-end text-[10px] text-gray-400">{msg.time}</p>
                  </div>
                </div>
              </FadeIn>
            );
          })}
        </div>

      </div>
    </section>
  );
}
