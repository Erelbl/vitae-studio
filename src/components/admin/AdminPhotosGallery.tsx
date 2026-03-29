"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type PhotoForGallery = {
  id: string;
  original_filename: string;
  life_stage: string | null;
  originalUrl: string | null;
  illustrationUrl: string | null;
  illustration_status: string | null;
  illustration_error: string | null;
};

const LIFE_STAGE_LABELS: Record<string, string> = {
  baby: "תינוקות",
  childhood: "ילדות",
  youth: "נעורים",
  military: "צבא",
  career: "קריירה",
  wedding: "חתונה",
  family: "משפחה",
  recent: "לאחרונה",
  other: "אחר",
};

function IllustrationStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <Badge variant="outline" className="text-xs">
        לא נוצר
      </Badge>
    );
  }
  if (status === "generating") {
    return (
      <Badge
        variant="secondary"
        className="text-xs gap-1"
        title="אם האיור תקוע — בחר את התמונה ולחץ שוב על 'צור איורי מים'"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        מייצר...
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 border-green-200">
        הושלם
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-xs">
      נכשל
    </Badge>
  );
}

/** Compact progress bar + status counts shown during/after a generation batch. */
function BatchProgressBar({ photos }: { photos: PhotoForGallery[] }) {
  const total = photos.length;
  const completed = photos.filter((p) => p.illustration_status === "completed").length;
  const generating = photos.filter((p) => p.illustration_status === "generating").length;
  const failed = photos.filter((p) => p.illustration_status === "failed").length;
  const processed = completed + failed; // photos that have a terminal status

  // Only render when at least one photo has been touched by a generation run
  if (completed === 0 && generating === 0 && failed === 0) return null;

  const pct = Math.round((processed / total) * 100);

  const parts: string[] = [];
  if (completed > 0) parts.push(`${completed} הושלמו`);
  if (generating > 0) parts.push(`${generating} בתהליך`);
  if (failed > 0) parts.push(`${failed} נכשלו`);

  return (
    <div className="space-y-1.5">
      {/* Headline */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">
          {generating > 0
            ? `מייצר איורים: ${completed + failed} / ${total}`
            : `נוצרו ${completed} מתוך ${total} איורים`}
        </span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>

      {/* Track */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Breakdown */}
      {parts.length > 0 && (
        <p className="text-xs text-muted-foreground">{parts.join(" · ")}</p>
      )}
    </div>
  );
}

export function AdminPhotosGallery({
  orderId,
  photos,
}: {
  orderId: string;
  photos: PhotoForGallery[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Poll while any photo is generating
  const anyGenerating = photos.some((p) => p.illustration_status === "generating");
  useEffect(() => {
    if (!anyGenerating) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [anyGenerating, router]);

  function togglePhoto(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === photos.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(photos.map((p) => p.id)));
    }
  }

  /** Select all photos that need re-running: failed or stuck in generating. */
  function selectRetryable() {
    const retryable = photos
      .filter(
        (p) =>
          p.illustration_status === "failed" || p.illustration_status === "generating"
      )
      .map((p) => p.id);
    setSelected(new Set(retryable));
  }

  async function handleDeletePhoto(photoId: string, filename: string) {
    if (!confirm(`למחוק את התמונה "${filename}"?\nפעולה זו בלתי הפיכה.`)) return;
    setDeleting(photoId);
    try {
      const res = await fetch(
        `/api/admin/orders/${orderId}/photos/${photoId}`,
        { method: "DELETE" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(body.error ?? "שגיאה במחיקת התמונה");
        return;
      }
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  async function handleGenerate() {
    if (selected.size === 0) return;
    setGenerating(true);
    setGenerateError(null);

    const res = await fetch(
      `/api/admin/orders/${orderId}/generate-illustrations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: Array.from(selected) }),
      }
    );

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setGenerateError(body.error ?? "שגיאה ביצירת האיורים");
      setGenerating(false);
      return;
    }

    setSelected(new Set());
    setGenerating(false);
    router.refresh();
  }

  // Trigger a ZIP download by POSTing to the route and saving the blob
  async function handleDownloadZip(photoIds?: string[]) {
    setZipping(true);
    try {
      const body = photoIds ? { photoIds } : {};
      const res = await fetch(
        `/api/admin/orders/${orderId}/illustrations/download-zip`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "שגיאה בהורדת הקבצים");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `illustrations-${orderId.slice(0, 8)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  if (photos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">לא הועלו תמונות עדיין.</p>
    );
  }

  const allSelected = selected.size === photos.length;
  const someSelected = selected.size > 0;
  const completedPhotos = photos.filter((p) => p.illustration_status === "completed");
  const selectedCompleted = photos.filter(
    (p) => selected.has(p.id) && p.illustration_status === "completed"
  );
  const retryablePhotos = photos.filter(
    (p) => p.illustration_status === "failed" || p.illustration_status === "generating"
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs">
          {allSelected ? "בטל הכל" : "בחר הכל"}
        </Button>
        {someSelected && (
          <span className="text-xs text-muted-foreground shrink-0">
            {selected.size} נבחרו
          </span>
        )}

        <div className="flex items-center gap-2 ms-auto flex-wrap">
          {/* Quick-select retryable photos (failed or stuck generating) */}
          {retryablePhotos.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={selectRetryable}
              className="text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50"
              title="בחר תמונות שנכשלו או תקועות כדי להריץ מחדש"
            >
              בחר לניסיון חוזר ({retryablePhotos.length})
            </Button>
          )}

          {/* Download selected completed illustrations as ZIP */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownloadZip(selectedCompleted.map((p) => p.id))}
            disabled={selectedCompleted.length === 0 || zipping}
          >
            {zipping ? "מכין..." : "הורד נבחרות"}
          </Button>

          {/* Download all completed illustrations as ZIP */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownloadZip()}
            disabled={completedPhotos.length === 0 || zipping}
          >
            {zipping ? "מכין..." : `הורד הכל (${completedPhotos.length})`}
          </Button>

          {/* Generate watercolor illustrations */}
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={!someSelected || generating}
          >
            {generating ? "שולח..." : "צור איורי מים"}
          </Button>
        </div>

        {generateError && (
          <span className="text-xs text-destructive w-full">{generateError}</span>
        )}
      </div>

      {/* Batch progress — only visible once generation has started */}
      <BatchProgressBar photos={photos} />

      {/* Photo grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {photos.map((photo) => {
          const isSelected = selected.has(photo.id);
          const isGenerating = photo.illustration_status === "generating";
          const isDone = photo.illustration_status === "completed";
          const isFailed = photo.illustration_status === "failed";

          return (
            <div
              key={photo.id}
              className={`rounded-xl border-2 transition-all cursor-pointer space-y-2 p-2 ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : isFailed
                  ? "border-destructive/40 hover:border-destructive/60"
                  : "border-border hover:border-primary/40"
              }`}
              onClick={() => togglePhoto(photo.id)}
            >
              {/* Original thumbnail */}
              <div className="relative aspect-square">
                {photo.originalUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.originalUrl}
                    alt={photo.original_filename}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain rounded-lg"
                  />
                ) : (
                  <div className="h-full w-full rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    N/A
                  </div>
                )}
                {/* Selection indicator */}
                <div
                  className={`absolute top-1.5 start-1.5 h-5 w-5 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-background/80 border-border"
                  }`}
                >
                  {isSelected && "✓"}
                </div>
              </div>

              {/* Illustration result */}
              {isDone && photo.illustrationUrl && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1 text-center">איור</p>
                  <div className="w-full aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.illustrationUrl}
                      alt={`איור - ${photo.original_filename}`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain rounded-lg border"
                    />
                  </div>
                </div>
              )}

              {/* Generating spinner placeholder */}
              {isGenerating && (
                <div className="w-full aspect-square rounded-lg bg-amber-50 border border-amber-200 flex flex-col items-center justify-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-xs text-amber-700">מייצר איור...</span>
                </div>
              )}

              {/* Failed placeholder with retry hint */}
              {isFailed && !photo.illustration_error && (
                <div className="w-full aspect-square rounded-lg bg-red-50 border border-red-200 flex flex-col items-center justify-center gap-1 p-2">
                  <span className="text-xs text-destructive text-center">נכשל — בחר ונסה שוב</span>
                </div>
              )}

              {/* Error message */}
              {isFailed && photo.illustration_error && (
                <p
                  className="text-xs text-destructive truncate"
                  title={photo.illustration_error}
                >
                  שגיאה: {photo.illustration_error.slice(0, 60)}
                </p>
              )}

              {/* Metadata row */}
              <div className="flex items-center justify-between gap-1">
                {photo.life_stage ? (
                  <span className="text-xs text-muted-foreground">
                    {LIFE_STAGE_LABELS[photo.life_stage] ?? photo.life_stage}
                  </span>
                ) : (
                  <span />
                )}
                <IllustrationStatusBadge status={photo.illustration_status} />
              </div>

              {/* Single-file download — stop propagation so click doesn't toggle selection */}
              {isDone && (
                <a
                  href={`/api/admin/orders/${orderId}/illustrations/${photo.id}/download`}
                  download
                  onClick={(e) => e.stopPropagation()}
                  className="block w-full text-center text-xs text-primary hover:underline py-0.5"
                >
                  הורד איור
                </a>
              )}

              {/* Delete original photo */}
              <button
                type="button"
                disabled={deleting === photo.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeletePhoto(photo.id, photo.original_filename);
                }}
                className="block w-full text-center text-xs text-destructive hover:text-destructive/80 hover:underline py-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting === photo.id ? "מוחק..." : "מחק"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
