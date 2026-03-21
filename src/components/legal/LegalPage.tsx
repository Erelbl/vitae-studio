import Link from "next/link";
import Image from "next/image";

interface Section {
  heading: string;
  content: string[];
}

interface Props {
  title: string;
  lastUpdated?: string;
  intro?: string;
  sections: Section[];
}

export function LegalPage({ title, lastUpdated, intro, sections }: Props) {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="relative block h-8 w-32">
            <Image src="/assets/Logo.png" alt="Vitae Studio" fill className="object-contain" />
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            חזרה לעמוד הבית
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">{title}</h1>
          {lastUpdated && (
            <p className="mt-2 text-sm text-muted-foreground">עדכון אחרון: {lastUpdated}</p>
          )}
        </div>

        {intro && (
          <p className="mb-8 text-base leading-relaxed text-muted-foreground">{intro}</p>
        )}

        <div className="space-y-8">
          {sections.map((section, i) => (
            <section key={i}>
              <h2 className="mb-3 text-lg font-semibold">{section.heading}</h2>
              <ul className="space-y-2">
                {section.content.map((paragraph, j) => (
                  <li key={j} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    <span>{paragraph}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 px-4 py-8 text-center text-xs text-muted-foreground/60">
        Vitae Studio &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
