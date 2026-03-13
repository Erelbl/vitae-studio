import { FadeIn } from "@/components/home/FadeIn";
import { TESTIMONIALS } from "@/content/landing-content";

export function TestimonialsSection() {
  return (
    <section className="bg-card px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-2xl">

        <FadeIn>
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold sm:text-4xl">{TESTIMONIALS.title}</h2>
          </div>
        </FadeIn>

        {/*
          Standalone green message bubbles — no WhatsApp frame.
          Odd-indexed messages are indented from the start (right) edge to
          create a natural, staggered rhythm without feeling mechanical.
          whitespace-pre-line renders the \n line breaks in the message text.
        */}
        <div className="flex flex-col gap-5">
          {TESTIMONIALS.messages.map((msg, i) => (
            <FadeIn key={i} delay={i * 100}>
              <div className={i % 2 !== 0 ? "ps-6 sm:ps-14" : ""}>
                <div className="rounded-2xl rounded-br-sm bg-[#dcf8c6] px-6 py-5 shadow-sm">
                  <p className="whitespace-pre-line text-lg leading-relaxed text-gray-800">
                    {msg.text}
                  </p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

      </div>
    </section>
  );
}
