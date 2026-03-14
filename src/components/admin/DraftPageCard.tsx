"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PageType } from "@/types/page";

const PAGE_TYPE_LABELS: Record<PageType, string> = {
  cover: "כריכה קדמית",
  dedication: "הקדשה",
  illustration_and_text: "תוכן",
  text_only: "טקסט בלבד",
  back_cover: "כריכה אחורית",
};

interface DraftPageCardProps {
  orderId: string;
  pageId: string;
  pageNumber: number;
  pageType: string;
  textContent: string | null;
  textVersion: number | null;
}

/**
 * Per-page card on the draft-text page.
 * Shows the current text and allows inline editing.
 * On save, calls the existing edit API and increments text_version.
 */
export function DraftPageCard({
  orderId,
  pageId,
  pageNumber,
  pageType,
  textContent,
  textVersion,
}: DraftPageCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(textContent ?? "");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [currentText, setCurrentText] = useState(textContent);
  const [currentVersion, setCurrentVersion] = useState(textVersion);

  const typeLabel = PAGE_TYPE_LABELS[pageType as PageType] ?? pageType;
  const isDirty = draft !== (currentText ?? "");

  async function handleSave() {
    if (!isDirty) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setSaveStatus("idle");

    const res = await fetch(
      `/api/admin/orders/${orderId}/pages/${pageId}/edit`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_content: draft }),
      }
    );

    setSaving(false);

    if (res.ok) {
      setCurrentText(draft);
      setCurrentVersion((v) => (v ?? 0) + 1);
      setSaveStatus("saved");
      setEditing(false);
      // Refresh the server component in the background so version history updates
      router.refresh();
      setTimeout(() => setSaveStatus("idle"), 3000);
    } else {
      const body = await res.json().catch(() => ({}));
      setSaveStatus("error");
      alert(body.error ?? "שגיאה בשמירת הטקסט");
    }
  }

  function handleCancel() {
    setDraft(currentText ?? "");
    setEditing(false);
    setSaveStatus("idle");
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
            עמוד {pageNumber}
          </span>
          <span className="text-xs text-muted-foreground">{typeLabel}</span>
          {currentVersion != null && currentVersion > 0 && (
            <span className="text-xs text-muted-foreground opacity-60">
              v{currentVersion}
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600 font-medium">✓ נשמר</span>
          )}
        </div>

        {/* Edit / Save / Cancel controls */}
        {!editing ? (
          <button
            onClick={() => {
              setDraft(currentText ?? "");
              setEditing(true);
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            ערוך
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="text-xs text-primary hover:underline disabled:opacity-40"
            >
              {saving ? "שומר..." : "שמור גרסה חדשה"}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ביטול
            </button>
          </div>
        )}
      </div>

      {/* Text display or textarea */}
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.max(3, (draft.match(/\n/g)?.length ?? 0) + 2)}
          dir="rtl"
          autoFocus
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-serif resize-none leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      ) : currentText ? (
        <p className="text-sm leading-loose whitespace-pre-line font-serif">
          {currentText}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          אין טקסט ({typeLabel})
        </p>
      )}
    </div>
  );
}
