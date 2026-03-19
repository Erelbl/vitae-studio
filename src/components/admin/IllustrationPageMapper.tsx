"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PageForMapper = {
  id: string;
  page_number: number;
  photo_id: string | null;
};

export type CompletedPhotoForMapper = {
  id: string;
  illustrationUrl: string | null;
  original_filename: string;
  life_stage: string | null;
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

export function IllustrationPageMapper({
  orderId,
  pages,
  completedPhotos,
}: {
  orderId: string;
  pages: PageForMapper[];
  completedPhotos: CompletedPhotoForMapper[];
}) {
  const router = useRouter();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [localAssignments, setLocalAssignments] = useState<
    Record<string, string | null>
  >(Object.fromEntries(pages.map((p) => [p.id, p.photo_id])));

  const selectedPage = pages.find((p) => p.id === selectedPageId);

  async function assign(pageId: string, photoId: string | null) {
    setSaving(pageId);
    const res = await fetch(
      `/api/admin/orders/${orderId}/pages/${pageId}/assign-illustration`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      }
    );
    setSaving(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "שגיאה בשמירת השיוך");
      return;
    }

    setLocalAssignments((prev) => ({ ...prev, [pageId]: photoId }));

    // After assigning, move to the next unassigned page
    if (photoId !== null) {
      const currentIndex = pages.findIndex((p) => p.id === pageId);
      const nextUnassigned = pages
        .slice(currentIndex + 1)
        .find((p) => !localAssignments[p.id]);
      setSelectedPageId(nextUnassigned?.id ?? null);
    }

    router.refresh();
  }

  if (completedPhotos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        אין איורים מוכנים לשיוך. יש לייצר איורים תחילה בלשונית האיורים.
      </p>
    );
  }

  const assignedCount = Object.values(localAssignments).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {assignedCount} / {pages.length} עמודים משויכים
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: pages list */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            לחץ על עמוד כדי לשייך לו איור
          </p>
          <div className="space-y-1 max-h-96 overflow-y-auto pe-1">
            {pages.map((page) => {
              const assignedPhotoId = localAssignments[page.id];
              const assignedPhoto = completedPhotos.find(
                (p) => p.id === assignedPhotoId
              );
              const isSelected = selectedPageId === page.id;
              const isSaving = saving === page.id;

              return (
                <div
                  key={page.id}
                  onClick={() =>
                    setSelectedPageId(isSelected ? null : page.id)
                  }
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted/50 border border-transparent"
                  }`}
                >
                  <span className="text-xs font-mono text-muted-foreground w-14 shrink-0">
                    עמוד {page.page_number}
                  </span>

                  {isSaving ? (
                    <div className="h-8 w-8 rounded bg-muted animate-pulse shrink-0" />
                  ) : assignedPhoto?.illustrationUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={assignedPhoto.illustrationUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-8 w-8 rounded object-contain shrink-0"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded bg-muted/70 flex items-center justify-center shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        ✦
                      </span>
                    </div>
                  )}

                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {assignedPhoto
                      ? assignedPhoto.life_stage
                        ? (LIFE_STAGE_LABELS[assignedPhoto.life_stage] ??
                          assignedPhoto.life_stage)
                        : assignedPhoto.original_filename
                      : "לא שויך"}
                  </span>

                  {assignedPhoto && (
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive shrink-0 px-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        assign(page.id, null);
                      }}
                      title="הסר שיוך"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: photo picker */}
        <div>
          {selectedPage ? (
            <>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                בחר איור לעמוד {selectedPage.page_number}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {completedPhotos.map((photo) => {
                  const isAssigned =
                    localAssignments[selectedPage.id] === photo.id;

                  return (
                    <button
                      key={photo.id}
                      onClick={() => assign(selectedPage.id, photo.id)}
                      disabled={saving === selectedPage.id}
                      className={`relative rounded-lg overflow-hidden aspect-square border-2 transition-all hover:scale-[1.03] ${
                        isAssigned
                          ? "border-primary shadow-md"
                          : "border-transparent hover:border-primary/40"
                      }`}
                    >
                      {photo.illustrationUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo.illustrationUrl}
                          alt={photo.original_filename}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted" />
                      )}

                      {isAssigned && (
                        <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                          <span className="text-white text-xl font-bold drop-shadow">
                            ✓
                          </span>
                        </div>
                      )}

                      {photo.life_stage && (
                        <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] text-center py-0.5 truncate px-1">
                          {LIFE_STAGE_LABELS[photo.life_stage] ??
                            photo.life_stage}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="h-full min-h-32 flex items-center justify-center rounded-xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground">
                בחר עמוד מהרשימה כדי לשייך לו איור
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
