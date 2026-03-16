"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

type UploadStatus = "pending" | "uploading" | "done" | "error";

interface FileEntry {
  file: File;
  status: UploadStatus;
  error?: string;
}

export function AdminPhotoUpload({ orderId }: { orderId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const entries: FileEntry[] = selected.map((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return { file, status: "error" as const, error: "סוג קובץ לא נתמך" };
      }
      if (file.size > MAX_SIZE) {
        return { file, status: "error" as const, error: "גודל מקסימלי 10MB" };
      }
      return { file, status: "pending" as const };
    });
    setFiles((prev) => [...prev, ...entries]);
    // Reset input so same file can be re-selected
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadAll() {
    const pending = files.filter((f) => f.status === "pending");
    if (pending.length === 0) return;

    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== "pending") continue;

      // Mark uploading
      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f))
      );

      try {
        // Step 1: Create photo record and get signed upload URL
        const createRes = await fetch(`/api/admin/orders/${orderId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: files[i].file.name,
            mime_type: files[i].file.type,
            file_size_bytes: files[i].file.size,
          }),
        });

        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          throw new Error(err.error ?? "שגיאה ביצירת רשומת תמונה");
        }

        const { photoId, uploadUrl } = await createRes.json();

        // Step 2: Upload file to Supabase Storage
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": files[i].file.type },
          body: files[i].file,
        });

        if (!uploadRes.ok) {
          throw new Error("שגיאה בהעלאת הקובץ");
        }

        // Step 3: Confirm upload
        const confirmRes = await fetch(
          `/api/admin/orders/${orderId}/photos/${photoId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_uploaded: true }),
          }
        );

        if (!confirmRes.ok) {
          throw new Error("שגיאה באישור ההעלאה");
        }

        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: "done" } : f))
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? {
                  ...f,
                  status: "error",
                  error:
                    err instanceof Error ? err.message : "שגיאה לא צפויה",
                }
              : f
          )
        );
      }
    }

    setUploading(false);
    router.refresh();
  }

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          בחר תמונות
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={handleFileSelect}
          className="hidden"
        />
        {pendingCount > 0 && (
          <Button size="sm" onClick={uploadAll} disabled={uploading}>
            {uploading ? "מעלה..." : `העלה ${pendingCount} תמונות`}
          </Button>
        )}
        {doneCount > 0 && (
          <span className="text-xs text-green-700">
            {doneCount} הועלו בהצלחה
          </span>
        )}
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {files.map((entry, i) => (
            <div
              key={`${entry.file.name}-${i}`}
              className={`relative rounded-lg border overflow-hidden ${
                entry.status === "error"
                  ? "border-red-300 bg-red-50"
                  : entry.status === "done"
                  ? "border-green-300 bg-green-50"
                  : entry.status === "uploading"
                  ? "border-amber-300 bg-amber-50"
                  : "border-border"
              }`}
            >
              {/* Thumbnail preview */}
              {entry.file.type.startsWith("image/") &&
              !entry.file.type.includes("heic") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={URL.createObjectURL(entry.file)}
                  alt={entry.file.name}
                  className="w-full aspect-square object-cover"
                />
              ) : (
                <div className="w-full aspect-square bg-muted flex items-center justify-center text-xs text-muted-foreground">
                  {entry.file.name.split(".").pop()?.toUpperCase()}
                </div>
              )}

              {/* Status overlay */}
              {entry.status === "uploading" && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                  <span className="h-4 w-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                </div>
              )}
              {entry.status === "done" && (
                <div className="absolute top-1 end-1 h-5 w-5 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold">
                  ✓
                </div>
              )}
              {entry.status === "error" && (
                <div className="absolute inset-x-0 bottom-0 bg-red-600/90 text-white text-[10px] px-1 py-0.5 text-center truncate">
                  {entry.error}
                </div>
              )}

              {/* Remove button (only for pending/error) */}
              {(entry.status === "pending" || entry.status === "error") && (
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-1 start-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center text-xs hover:bg-black/80 transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
