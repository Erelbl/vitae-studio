import Image from "next/image";

export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between sm:max-w-3xl">
          <div className="relative h-10 w-36">
            <Image
              src="/assets/Logo.png"
              alt="Vitae Studio"
              fill
              priority
              className="object-contain object-start"
            />
          </div>
          <span className="text-xs text-muted-foreground">סיפור חיים בחרוזים</span>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
