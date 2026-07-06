"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PublishButton({
  orderId,
  disabled = false,
  isRepublish = false,
}: {
  orderId: string;
  disabled?: boolean;
  isRepublish?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    const confirmMessage = isRepublish
      ? "לפרסם סבב תצוגה מקדימה נוסף ללקוח? הסטטוס יתאפס לממתין לבדיקת הלקוח."
      : "לפרסם את האלבום ללקוח? הלקוח יוכל לצפות בתצוגה המקדימה לאחר מכן.";
    if (!confirm(confirmMessage)) {
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/admin/orders/${orderId}/publish`, {
      method: "POST",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "שגיאה בפרסום");
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        variant={disabled ? "ghost" : "default"}
        onClick={handlePublish}
        disabled={disabled || loading}
      >
        {loading ? "מפרסם..." : isRepublish ? "פרסם שוב ללקוח" : "פרסם ללקוח"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
