import { FadeIn } from "@/components/home/FadeIn";
import { TESTIMONIALS } from "@/content/landing-content";

export function TestimonialsSection() {
  return (
    <section className="bg-card px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-4xl">

        <FadeIn>
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold sm:text-4xl">{TESTIMONIALS.title}</h2>
          </div>
        </FadeIn>

        {/*
          Desktop: 2-column grid. Cards 0 and 2 are in the left column (col 1 in RTL),
          card 1 is in the right column and staggered down (mt-10) to create a
          dynamic, scattered composition.
          Mobile: single column, stacked.
        */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2" dir="rtl">
          {TESTIMONIALS.conversations.map((messages, ci) => {
            const isMiddle = ci === 1;
            const isLast = ci === TESTIMONIALS.conversations.length - 1;
            const isLastOdd =
              isLast && TESTIMONIALS.conversations.length % 2 === 1;

            return (
              <FadeIn key={ci} delay={ci * 120}>
                <div
                  className={[
                    isMiddle ? "sm:mt-10" : "",
                    isLastOdd ? "sm:col-span-2 sm:mx-auto sm:w-[calc(50%-10px)]" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="overflow-hidden rounded-2xl border border-border/30 shadow-sm">
                    {/* WhatsApp-style header bar */}
                    <div className="flex items-center gap-3 bg-primary/70 px-4 py-2.5">
                      <div className="h-7 w-7 rounded-full bg-white/25" />
                      <div className="h-2 w-20 rounded-full bg-white/30" />
                    </div>

                    {/* Chat bubble area */}
                    <div className="space-y-2 bg-[#e5ddd5]/60 px-4 py-4">
                      {messages.map((msg, mi) => (
                        <div key={mi} className="flex justify-end">
                          {/*
                            Green "sent" bubble. rounded-br-sm = WhatsApp tail.
                          */}
                          <div className="max-w-[90%] rounded-2xl rounded-br-sm bg-[#dcf8c6] px-4 py-2.5 shadow-sm">
                            <p className="text-base leading-relaxed text-gray-800">
                              {msg.text}
                            </p>
                            <p className="mt-0.5 text-end text-xs text-gray-400">
                              {msg.time}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
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
