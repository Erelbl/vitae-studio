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
  id: string; // temp id
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
    // 1. Request signed upload URL + create DB record
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

    // 2. Upload directly to storage
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });

    if (!uploadRes.ok) {
      throw new Error("שגיאה בהעלאת הקובץ");
    }

    // 3. Confirm upload
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
    // Use an object URL for immediate display; signed URL is generated on next page load
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

    // Upload each file
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
        router.push(`/order/${orderId}/status?token=${token}`);
      } else {
        toast.error("שגיאה בסיום ההעלאה");
      }
    } finally {
      setCompleting(false);
    }
  }

  const activeUploads = uploading.filter((u) => u.progress !== "done");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-2 font-serif text-3xl font-bold">העלאת תמונות</h1>
      <p className="mb-8 text-muted-foreground">
        העלו תמונות מתקופות שונות בחיים — לפחות 10, עד 40. ניתן לגרור
        ולסדר מחדש לאחר ההעלאה.
      </p>

      {/* Upload area */}
      <div
        className="mb-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/30 px-8 py-12 text-center transition-colors hover:border-primary/50 hover:bg-muted/30"
        onClick={() => inputRef.current?.click()}
      >
        <div className="text-4xl text-muted-foreground">+</div>
        <p className="text-base font-medium">גררו תמונות לכאן או לחצו להוספה</p>
        <p className="text-sm text-muted-foreground">PNG, JPG, WEBP עד 20MB לתמונה</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
      </div>

      {/* Uploading in progress */}
      {activeUploads.length > 0 && (
        <div className="mb-6 space-y-2">
          {activeUploads.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 rounded-md bg-muted px-3 py-2 text-sm"
            >
              <img
                src={u.preview}
                alt=""
                className="h-10 w-10 rounded object-cover"
              />
              <span className="flex-1 truncate">{u.name}</span>
              <span className="text-muted-foreground">
                {u.progress === "uploading" ? "מעלה..." : "שגיאה"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="mb-8 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative aspect-square">
              {photo.display_url ? (
                <img
                  src={photo.display_url}
                  alt={photo.original_filename}
                  className="h-full w-full rounded-md object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
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
                className="absolute end-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs group-hover:flex"
                aria-label="מחק תמונה"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {photos.length === 0 && activeUploads.length === 0 && (
        <div className="mb-8 rounded-md bg-muted px-4 py-8 text-center text-muted-foreground">
          עדיין לא הועלו תמונות
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {photos.length} תמונות הועלו
        </span>
        <Button
          onClick={handleComplete}
          disabled={completing || photos.length === 0}
        >
          {completing ? "שומר..." : "סיימתי להעלות"}
        </Button>
      </div>
    </div>
  );
}
