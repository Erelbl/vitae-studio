"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function GenerateStoryButton({
  orderId,
  disabled = false,
}: {
  orderId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (
      !confirm(
        "ליצור גרסה חדשה של הסיפור? הגרסה הקודמת תישמר ותוכל לצפות בה בכל עת. התהליך אורך 1–3 דקות."
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/admin/orders/${orderId}/generate`, {
      method: "POST",
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(body.error ?? body.detail ?? "שגיאה ביצירת הסיפור");
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        disabled={disabled || loading}
      >
        {loading ? "יוצר סיפור..." : "צור סיפור חדש"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
