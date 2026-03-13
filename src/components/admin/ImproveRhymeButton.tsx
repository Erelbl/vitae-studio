"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ImproveRhymeButtonProps {
  orderId: string;
  disabled?: boolean;
}

export function ImproveRhymeButton({ orderId, disabled }: ImproveRhymeButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleImprove() {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/orders/${orderId}/improve-rhyme`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `שגיאה ${res.status}`);
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא ידועה");
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || isLoading}
            />
          }
        >
          {isLoading ? (
            <>
              <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin me-2" />
              משפר חרוזים...
            </>
          ) : (
            "שפר חריזה"
          )}
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>שיפור חרוזים ואיכות עברית</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-start">
              <span className="block">
                פעולה זו תריץ עריכה ממוקדת של הסיפור הנוכחי —
                שיפור חרוזים חלשים ושיפור ניסוח מאולץ, מבלי לשנות את תוכן הסיפור.
              </span>
              <span className="block">
                הגרסה הנוכחית תישמר בהיסטוריית הגרסאות.
              </span>
              <span className="block font-medium">
                התהליך יכול להימשך כדקה-שתיים. הדף יתרענן כשיסתיים.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleImprove}>
              שפר חריזה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {error && (
        <p className="text-xs text-red-600 text-end max-w-[200px]">{error}</p>
      )}
    </div>
  );
}
