import { FadeIn } from "@/components/home/FadeIn";
import { CONTACT } from "@/content/landing-content";

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.867-2.031-.967-.272-.099-.47-.148-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.149-.172.198-.296.298-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
    </svg>
  );
}

export function ContactSection() {
  return (
    <section className="border-t border-border/50 bg-secondary/20 px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-xl text-center">
        <FadeIn>

          <span className="mb-3 inline-block text-sm font-medium text-primary">
            יצירת קשר
          </span>

          <h2 className="mb-2 text-xl font-semibold sm:text-2xl">{CONTACT.name}</h2>

          <p className="mb-8 text-base leading-relaxed text-muted-foreground">
            {CONTACT.message}
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href={`mailto:${CONTACT.email}`}
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              {CONTACT.email}
            </a>

            <span className="hidden text-border/70 sm:block" aria-hidden="true">·</span>

            <a
              href={CONTACT.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/8 px-5 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/15 hover:shadow-sm"
            >
              <WhatsAppIcon />
              שלחו הודעה בוואטסאפ
            </a>
          </div>

        </FadeIn>
      </div>
    </section>
  );
}
