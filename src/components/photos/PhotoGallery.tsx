"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Photo } from "@/types/questionnaire";

interface PhotoWithUrl extends Photo {
  display_url: string | null;
}

interface Props {
  orderId: string;
  token: string;
  initialPhotos: PhotoWithUrl[];
}

interface UploadingFile {
  id: string;
  name: string;
  progress: "pending" | "uploading" | "done" | "error";
  preview: string;
}

export function PhotoGallery({ orderId, token, initialPhotos }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PhotoWithUrl[]>(initialPhotos);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [completing, setCompleting] = useState(false);

  async function uploadFile(file: File, tempId: string) {
    const res = await fetch(`/api/orders/${orderId}/photos?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        mime_type: file.type,
        file_size_bytes: file.size,
      }),
    });

    if (!res.ok) {
      throw new Error("שגיאה בהכנת ההעלאה");
    }

    const { photoId, uploadUrl } = await res.json();

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });

    if (!uploadRes.ok) {
      throw new Error("שגיאה בהעלאת הקובץ");
    }

    const confirmRes = await fetch(
      `/api/orders/${orderId}/photos/${photoId}?token=${token}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_uploaded: true }),
      }
    );

    if (!confirmRes.ok) {
      throw new Error("שגיאה באישור ההעלאה");
    }

    const confirmedPhoto = await confirmRes.json();
    return { ...confirmedPhoto, display_url: URL.createObjectURL(file) } as PhotoWithUrl;
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;

    const newUploads: UploadingFile[] = Array.from(files).map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      progress: "pending" as const,
      preview: URL.createObjectURL(f),
    }));

    setUploading((prev) => [...prev, ...newUploads]);

    await Promise.all(
      Array.from(files).map(async (file, i) => {
        const tempId = newUploads[i].id;
        setUploading((prev) =>
          prev.map((u) => (u.id === tempId ? { ...u, progress: "uploading" } : u))
        );
        try {
          const uploaded = await uploadFile(file, tempId);
          setPhotos((prev) => [...prev, uploaded]);
          setUploading((prev) =>
            prev.map((u) => (u.id === tempId ? { ...u, progress: "done" } : u))
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "שגיאה";
          toast.error(`${file.name}: ${msg}`);
          setUploading((prev) =>
            prev.map((u) => (u.id === tempId ? { ...u, progress: "error" } : u))
          );
        }
      })
    );
  }

  async function handleDelete(photoId: string) {
    const res = await fetch(
      `/api/orders/${orderId}/photos/${photoId}?token=${token}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } else {
      toast.error("שגיאה במחיקת התמונה");
    }
  }

  async function handleUpdateCaption(photoId: string, caption: string) {
    const res = await fetch(
      `/api/orders/${orderId}/photos/${photoId}?token=${token}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: caption || null }),
      }
    );
    if (res.ok) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, caption: caption || null } : p))
      );
    }
  }

  async function handleComplete() {
    if (photos.length < 1) {
      toast.error("יש להעלות לפחות תמונה אחת");
      return;
    }
    setCompleting(true);
    try {
      const res = await fetch(
        `/api/orders/${orderId}/photos/complete?token=${token}`,
        { method: "POST" }
      );
      if (res.ok) {
        router.push(`/order/${orderId}/select-product?token=${token}`);
      } else {
        toast.error("שגיאה בסיום ההעלאה");
      }
    } finally {
      setCompleting(false);
    }
  }

  const activeUploads = uploading.filter((u) => u.progress !== "done");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">

      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-semibold sm:text-3xl">העלאת תמונות</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
          העלו תמונות מתקופות שונות בחיים — לפחות 10, עד 40.
          אנחנו נמיין ונשלב אותן בסיפור.
        </p>
      </div>

      {/* Guidance text */}
      <div className="mb-6 rounded-2xl border border-border/50 bg-card p-4 text-sm leading-relaxed text-foreground/80 shadow-sm sm:text-base">
        <p>
          מומלץ להעלות תמונות מתקופות שונות בחיים ושמתחברות למה שסיפרתם בשאלון.
          תמונות של מקומות, בית ילדות, נופים, משפחה ואירועים משמעותיים יעזרו לנו לבנות סיפור עשיר ומדויק יותר.
        </p>
      </div>

      {/* Upload zone */}
      <div
        className="mb-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/25 bg-primary/4 px-6 py-10 text-center transition-all hover:border-primary/50 hover:bg-primary/8 sm:px-8 sm:py-12"
        onClick={() => inputRef.current?.click()}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-2xl text-primary">
          +
        </div>
        <div>
          <p className="text-sm font-medium sm:text-base">גררו תמונות לכאן או לחצו להוספה</p>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            PNG, JPG, WEBP · עד 20MB לתמונה
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
      </div>

      {/* Upload progress rows */}
      {activeUploads.length > 0 && (
        <div className="mb-6 space-y-2">
          {activeUploads.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-3 py-2.5 text-sm shadow-sm"
            >
              <img
                src={u.preview}
                alt=""
                className="h-10 w-10 rounded-lg object-cover"
              />
              <span className="flex-1 truncate text-sm">{u.name}</span>
              <span className={`text-xs ${u.progress === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {u.progress === "uploading" ? "מעלה..." : "שגיאה"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => (
            <div key={photo.id} className="group">
              <div className="relative aspect-square">
                {photo.display_url ? (
                  <img
                    src={photo.display_url}
                    alt={photo.original_filename}
                    className="h-full w-full rounded-xl object-cover shadow-sm"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground">
                    {photo.original_filename}
                  </div>
                )}
                {photo.life_stage && (
                  <Badge
                    variant="secondary"
                    className="absolute bottom-1 start-1 text-xs"
                  >
                    {photo.life_stage}
                  </Badge>
                )}
                <button
                  onClick={() => handleDelete(photo.id)}
                  className="absolute end-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/70 text-background text-xs opacity-70 transition-opacity hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label="מחק תמונה"
                >
                  ✕
                </button>
              </div>
              <input
                type="text"
                defaultValue={photo.caption ?? ""}
                placeholder="תיאור קצר של התמונה (מי מופיע בתמונה / מה רואים בה)"
                className="mt-1.5 w-full rounded-lg border border-border/50 bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none"
                onBlur={(e) => handleUpdateCaption(photo.id, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      {photos.length === 0 && activeUploads.length === 0 && (
        <div className="mb-8 rounded-xl border border-border/50 bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
          עדיין לא הועלו תמונות
        </div>
      )}

      {/* Footer bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{photos.length}</span>
          <span className="text-sm text-muted-foreground">
            {photos.length === 1 ? "תמונה הועלתה" : "תמונות הועלו"}
          </span>
          {photos.length > 0 && photos.length < 10 && (
            <span className="text-xs text-muted-foreground/70">
              (מינימום 10)
            </span>
          )}
        </div>
        <Button
          onClick={handleComplete}
          disabled={completing || photos.length === 0}
          className="w-full rounded-full sm:w-auto sm:px-8"
        >
          {completing ? "שומר..." : "סיימתי להעלות"}
        </Button>
      </div>
    </div>
  );
}
