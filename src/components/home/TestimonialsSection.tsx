import { FadeIn } from "@/components/home/FadeIn";
import { TESTIMONIALS } from "@/content/landing-content";

export function TestimonialsSection() {
  return (
    <section className="bg-card px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-2xl">

        <FadeIn>
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">{TESTIMONIALS.title}</h2>
          </div>
        </FadeIn>

        {/* 3 separate WhatsApp-style conversation cards */}
        <div className="flex flex-col gap-5">
          {TESTIMONIALS.conversations.map((messages, ci) => (
            <FadeIn key={ci} delay={ci * 120}>
              <div className="overflow-hidden rounded-2xl border border-border/30 shadow-sm" dir="rtl">
                {/* WhatsApp-style header bar */}
                <div className="flex items-center gap-3 bg-primary/75 px-4 py-2.5">
                  <div className="h-8 w-8 rounded-full bg-white/25" />
                  <div className="h-2 w-24 rounded-full bg-white/35" />
                </div>

                {/* Chat bubble area */}
                <div className="bg-[#e5ddd5]/60 px-4 py-4 space-y-2">
                  {messages.map((msg, mi) => (
                    <div key={mi} className="flex justify-end">
                      {/*
                        Green = sent (customer's message to us).
                        rounded-br-sm creates the WhatsApp tail effect on the bottom-right.
                      */}
                      <div className="max-w-[88%] rounded-2xl rounded-br-sm bg-[#dcf8c6] px-4 py-2.5 shadow-sm">
                        <p className="text-base leading-relaxed text-gray-800 sm:text-lg">{msg.text}</p>
                        <p className="mt-0.5 text-end text-xs text-gray-400">{msg.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

      </div>
    </section>
  );
}
