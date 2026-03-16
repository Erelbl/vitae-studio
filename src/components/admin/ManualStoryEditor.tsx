"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ManualSpread, StorySource } from "@/types/order";

// Default spread count for a new manual story (18 content spreads = 40 pages total)
const DEFAULT_SPREAD_COUNT = 18;

function createDefaultSpreads(count: number): ManualSpread[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `spread-${i + 1}`,
    spreadIndex: i,
    rightPageText: "",
    leftPageText: "",
    isActive: true,
  }));
}

interface ManualStoryEditorProps {
  orderId: string;
  initialStorySource: StorySource;
  initialSpreads: ManualSpread[] | null;
}

export function ManualStoryEditor({
  orderId,
  initialStorySource,
  initialSpreads,
}: ManualStoryEditorProps) {
  const router = useRouter();
  const [storySource, setStorySource] = useState<StorySource>(initialStorySource);
  const [spreads, setSpreads] = useState<ManualSpread[]>(
    initialSpreads && initialSpreads.length > 0
      ? initialSpreads
      : createDefaultSpreads(DEFAULT_SPREAD_COUNT)
  );
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const activeSpreads = spreads.filter((s) => s.isActive);
  // cover (1) + dedication (1) + content (activeSpreads * 2) + back_cover (1)
  // We ensure an even total: cover+dedication = 2 pages, content = even, back_cover = 1
  // Total = 2 + activeSpreads*2 + 2 (dedication counts as page 2, back_cover is last)
  const resultingPageCount = 2 + activeSpreads.length * 2 + 2;

  const updateSpreadText = useCallback(
    (id: string, field: "rightPageText" | "leftPageText", value: string) => {
      setSpreads((prev) =>
        prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
      );
      setDirty(true);
    },
    []
  );

  const toggleSpreadActive = useCallback((id: string) => {
    setSpreads((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s))
    );
    setDirty(true);
  }, []);

  const addSpread = useCallback(() => {
    setSpreads((prev) => {
      const maxIndex = Math.max(...prev.map((s) => s.spreadIndex), -1);
      return [
        ...prev,
        {
          id: `spread-${maxIndex + 2}`,
          spreadIndex: maxIndex + 1,
          rightPageText: "",
          leftPageText: "",
          isActive: true,
        },
      ];
    });
    setDirty(true);
  }, []);

  async function handleSourceChange(newSource: StorySource) {
    setStorySource(newSource);
    // Save source change immediately
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/manual-story`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_source: newSource,
          manual_spreads_json:
            newSource === "manual" ? spreads : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveStatus(err.error ?? "שגיאה בשמירה");
      } else {
        setSaveStatus(null);
        setDirty(false);
      }
    } catch {
      setSaveStatus("שגיאת רשת");
    } finally {
      setSaving(false);
      router.refresh();
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/manual-story`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_source: storySource,
          manual_spreads_json: spreads,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveStatus(err.error ?? "שגיאה בשמירה");
      } else {
        setSaveStatus("נשמר בהצלחה");
        setDirty(false);
        setTimeout(() => setSaveStatus(null), 3000);
      }
    } catch {
      setSaveStatus("שגיאת רשת");
    } finally {
      setSaving(false);
    }
  }

  async function handleApply() {
    if (dirty) {
      // Save first, then apply
      await handleSave();
    }

    setApplying(true);
    setSaveStatus(null);
    try {
      const res = await fetch(
        `/api/admin/orders/${orderId}/manual-story/apply`,
        { method: "POST" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveStatus(body.error ?? "שגיאה בהחלה");
      } else {
        setSaveStatus(
          `הוחל בהצלחה — ${body.totalPages} עמודים, ${body.activeSpreads} מפרשים`
        );
        router.refresh();
      }
    } catch {
      setSaveStatus("שגיאת רשת");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Source selector */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">מקור הסיפור:</span>
        <div className="flex rounded-lg border overflow-hidden">
          <button
            type="button"
            onClick={() => handleSourceChange("questionnaire")}
            disabled={saving}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              storySource === "questionnaire"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            שאלון
          </button>
          <button
            type="button"
            onClick={() => handleSourceChange("manual")}
            disabled={saving}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-s ${
              storySource === "manual"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            כתיבה ידנית
          </button>
        </div>
      </div>

      {/* Questionnaire mode note */}
      {storySource === "questionnaire" && (
        <p className="text-xs text-muted-foreground">
          הסיפור נוצר אוטומטית מתשובות השאלון. השתמשו בכפתור &ldquo;צור סיפור חדש&rdquo; למעלה.
        </p>
      )}

      {/* Manual mode editor */}
      {storySource === "manual" && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">
              מפרשים פעילים: <span className="font-semibold text-foreground">{activeSpreads.length}</span>
            </span>
            <span className="text-muted-foreground">
              עמודים: <span className="font-semibold text-foreground">{resultingPageCount}</span>
            </span>
            {activeSpreads.length < spreads.length && (
              <span className="text-amber-600 text-xs">
                {spreads.length - activeSpreads.length} מפרשים מוסתרים
              </span>
            )}
          </div>

          {/* Spread list */}
          <div className="space-y-3 max-h-[600px] overflow-y-auto pe-1">
            {spreads.map((spread, idx) => {
              // Calculate page numbers for this spread based on active spreads before it
              const activeBeforeCount = spreads
                .slice(0, idx)
                .filter((s) => s.isActive).length;
              const rightPageNum = spread.isActive ? 3 + activeBeforeCount * 2 : null;
              const leftPageNum = rightPageNum ? rightPageNum + 1 : null;

              return (
                <div
                  key={spread.id}
                  className={`rounded-lg border p-3 transition-all ${
                    spread.isActive
                      ? "bg-background border-border"
                      : "bg-muted/30 border-dashed border-muted-foreground/30 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        מפרש {idx + 1}
                      </span>
                      {spread.isActive && rightPageNum && leftPageNum && (
                        <span className="text-[10px] text-muted-foreground">
                          (עמ׳ {rightPageNum}–{leftPageNum})
                        </span>
                      )}
                      {!spread.isActive && (
                        <span className="text-[10px] text-amber-600 font-medium">מוסתר</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSpreadActive(spread.id)}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        spread.isActive
                          ? "text-red-600 hover:bg-red-50"
                          : "text-green-700 hover:bg-green-50"
                      }`}
                    >
                      {spread.isActive ? "הסתר" : "הפעל"}
                    </button>
                  </div>

                  {spread.isActive && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-0.5 block">
                          עמוד ימין {rightPageNum && `(${rightPageNum})`}
                        </label>
                        <textarea
                          value={spread.rightPageText}
                          onChange={(e) =>
                            updateSpreadText(spread.id, "rightPageText", e.target.value)
                          }
                          placeholder="טקסט עמוד ימין..."
                          rows={4}
                          dir="rtl"
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y min-h-[80px] focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-0.5 block">
                          עמוד שמאל {leftPageNum && `(${leftPageNum})`}
                        </label>
                        <textarea
                          value={spread.leftPageText}
                          onChange={(e) =>
                            updateSpreadText(spread.id, "leftPageText", e.target.value)
                          }
                          placeholder="טקסט עמוד שמאל (אופציונלי)..."
                          rows={4}
                          dir="rtl"
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y min-h-[80px] focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add spread button */}
          <button
            type="button"
            onClick={addSpread}
            className="w-full rounded-lg border border-dashed border-muted-foreground/40 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            + הוסף מפרש
          </button>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap border-t pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? "שומר..." : "שמור טיוטה"}
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={applying || activeSpreads.length === 0}
            >
              {applying ? "מחיל..." : "החל על האלבום"}
            </Button>
            {saveStatus && (
              <span
                className={`text-xs ${
                  saveStatus.includes("שגיאה") || saveStatus.includes("רשת")
                    ? "text-destructive"
                    : "text-green-700"
                }`}
              >
                {saveStatus}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
