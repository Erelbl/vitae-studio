export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card px-4 py-3.5 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5">
          <span className="text-base font-semibold tracking-wide text-primary sm:text-lg">
            Vitae Studio
          </span>
          <span className="text-border/80 select-none">|</span>
          <span className="text-xs text-muted-foreground">סיפור חיים בחרוזים</span>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
