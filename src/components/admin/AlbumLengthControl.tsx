"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ALLOWED_VALUES = [20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];

interface AlbumLengthControlProps {
  orderId: string;
  initialValue: number;
}

export function AlbumLengthControl({
  orderId,
  initialValue,
}: AlbumLengthControlProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleChange(newValue: number) {
    setValue(newValue);
    setSaving(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/admin/orders/${orderId}/album-length`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_page_count: newValue }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStatus(err.error ?? "שגיאה בשמירה");
        setValue(initialValue); // revert on error
      } else {
        setStatus("נשמר");
        setTimeout(() => setStatus(null), 2000);
        router.refresh();
      }
    } catch {
      setStatus("שגיאת רשת");
      setValue(initialValue);
    } finally {
      setSaving(false);
    }
  }

  // Content spreads = (target - 2) / 2 (cover + back_cover are fixed)
  const contentSpreads = (value - 2) / 2;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs font-medium text-muted-foreground shrink-0">
          אורך האלבום:
        </label>
        <select
          value={value}
          onChange={(e) => handleChange(Number(e.target.value))}
          disabled={saving}
          className="rounded-md border bg-background px-2.5 py-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {ALLOWED_VALUES.map((v) => (
            <option key={v} value={v}>
              {v} עמודים
            </option>
          ))}
        </select>
        <span className="text-[10px] text-muted-foreground">
          ({contentSpreads} מפרשי תוכן)
        </span>
        {saving && (
          <span className="text-xs text-muted-foreground">שומר...</span>
        )}
        {status && (
          <span
            className={`text-xs ${
              status === "נשמר" ? "text-green-700" : "text-destructive"
            }`}
          >
            {status}
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        מספר העמודים הסופי של האלבום. שינוי זה ישפיע על מבנה הסיפור ועל התצוגה
        המקדימה.
      </p>
    </div>
  );
}
