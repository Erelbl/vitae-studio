export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 py-3">
        <span className="font-serif text-xl font-bold">Vitae Studio</span>
      </header>
      <main>{children}</main>
    </div>
  );
}
