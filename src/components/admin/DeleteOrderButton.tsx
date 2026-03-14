"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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

interface Props {
  orderId: string;
  personName?: string | null;
  /** If true, show only the icon without text label (for table rows) */
  compact?: boolean;
}

export function DeleteOrderButton({ orderId, personName, compact = false }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/delete`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "מחיקה נכשלה");
        return;
      }

      if (data.storageErrors?.length) {
        toast.warning(
          `ההזמנה נמחקה, אך חלק מהקבצים בסטורג' לא נמחקו: ${data.storageErrors.join(", ")}`,
          { duration: 8000 }
        );
      } else {
        toast.success("ההזמנה נמחקה בהצלחה");
      }

      router.push("/admin/orders");
      router.refresh();
    } catch {
      toast.error("שגיאת רשת — המחיקה נכשלה");
    } finally {
      setLoading(false);
    }
  }

  const displayName = personName || orderId.slice(0, 8);

  return (
    <AlertDialog>
      {/* base-ui uses `render` prop instead of `asChild` */}
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size={compact ? "icon" : "sm"}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            title="מחק הזמנה"
          />
        }
      >
        <Trash2 className="h-4 w-4" />
        {!compact && <span className="ms-1">מחק</span>}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>מחיקת הזמנה — פעולה בלתי הפיכה</AlertDialogTitle>
          <AlertDialogDescription>
            האם למחוק לצמיתות את ההזמנה עבור{" "}
            <strong>{displayName}</strong>? לא ניתן לשחזר את הנתונים לאחר המחיקה.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="text-sm space-y-1.5 px-1">
          <p className="text-muted-foreground">הפעולה תמחק לצמיתות:</p>
          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground ps-2">
            <li>את ההזמנה וכל הנתונים הנלווים לה</li>
            <li>תמונות מקור שהועלו</li>
            <li>אילוסטרציות שנוצרו</li>
            <li>טקסטים ועמודי הסיפור</li>
            <li>היסטוריית גרסאות ועיבוד</li>
          </ul>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>ביטול</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "מוחק…" : "מחק לצמיתות"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
