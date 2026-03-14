"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TtsOverride } from "@/types/film";

interface TtsOverridesEditorProps {
  orderId: string;
  initialOverrides: TtsOverride[];
  /** Called after a successful save so the parent can refresh if needed */
  onSaved?: () => void;
}

export function TtsOverridesEditor({
  orderId,
  initialOverrides,
  onSaved,
}: TtsOverridesEditorProps) {
  const [rows, setRows] = useState<TtsOverride[]>(initialOverrides);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  function handleChange(index: number, field: keyof TtsOverride, value: string) {
    setSavedOk(false);
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function handleAdd() {
    setSavedOk(false);
    setRows((prev) => [...prev, { original: "", spoken: "" }]);
  }

  function handleDelete(index: number) {
    setSavedOk(false);
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);

    // Filter out empty rows before saving
    const cleaned = rows.filter((r) => r.original.trim() !== "");

    try {
      const res = await fetch(
        `/api/admin/orders/${orderId}/film/tts-overrides`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overrides: cleaned }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה בשמירת תיקוני ההגייה");
      }

      setRows(cleaned);
      setSavedOk(true);
      onSaved?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "שגיאה לא ידועה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border/60 p-4 space-y-4">
      {/* Header */}
      <div>
        <p className="text-sm font-medium">תיקוני הגייה</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          תיקונים אלה משפיעים על הקריינות בלבד ואינם משנים את טקסט האלבום המודפס.
        </p>
      </div>

      {/* Rows */}
      {rows.length > 0 && (
        <div className="space-y-2">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1">
            <span className="text-xs text-muted-foreground">מונח מקורי</span>
            <span className="text-xs text-muted-foreground">הגייה לקריינות</span>
            <span />
          </div>

          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <input
                type="text"
                value={row.original}
                onChange={(e) => handleChange(i, "original", e.target.value)}
                placeholder="בארי"
                className="h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                dir="rtl"
              />
              <input
                type="text"
                value={row.spoken}
                onChange={(e) => handleChange(i, "spoken", e.target.value)}
                placeholder="בְּאֵרִי"
                className="h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                dir="rtl"
              />
              <button
                type="button"
                onClick={() => handleDelete(i)}
                className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="מחק שורה"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          אין תיקוני הגייה עדיין. לחץ על &ldquo;הוסף תיקון&rdquo; כדי להוסיף.
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={saving}
        >
          + הוסף תיקון
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "שומר..." : "שמור תיקונים"}
        </Button>
        {savedOk && (
          <span className="text-sm text-green-700 font-medium">✓ נשמר</span>
        )}
      </div>

      {saveError && (
        <p className="text-sm text-destructive">{saveError}</p>
      )}
    </div>
  );
}
