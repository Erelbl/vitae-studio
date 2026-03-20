import Link from "next/link";

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-semibold sm:text-4xl">
          הזמנתך נקלטה בהצלחה 🎉
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          תודה רבה! אנחנו מתחילים לעבוד על הסיפור שלך.
        </p>
        <p className="mt-2 text-base text-muted-foreground">
          ניצור איתך קשר בקרוב להמשך התהליך.
        </p>
        {orderId && (
          <p className="mt-3 text-sm text-muted-foreground/60">
            מספר הזמנה: {orderId}
          </p>
        )}
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          חזרה לאתר
        </Link>
      </div>
    </div>
  );
}
