"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  FilmProject,
  FilmProjectStatus,
  FilmScene,
} from "@/types/film";

const STATUS_LABELS: Record<FilmProjectStatus, string> = {
  draft: "טיוטה",
  scenes_built: "סצנות נבנו",
  narration_pending: "ממתין לקריינות",
  narration_ready: "קריינות מוכנה",
  rendering: "ברינדור",
  rendered: "רונדר הושלם",
  assembled: "סרט מורכב",
  error: "שגיאה",
};

const STATUS_COLORS: Partial<Record<FilmProjectStatus, string>> = {
  draft: "bg-gray-100 text-gray-700 border-gray-300",
  scenes_built: "bg-blue-50 text-blue-600 border-blue-200",
  narration_pending: "bg-amber-50 text-amber-700 border-amber-200",
  narration_ready: "bg-blue-100 text-blue-700 border-blue-300",
  rendering: "bg-blue-100 text-blue-700 border-blue-300",
  rendered: "bg-green-100 text-green-700 border-green-300",
  assembled: "bg-emerald-100 text-emerald-700 border-emerald-300",
  error: "bg-red-100 text-red-700 border-red-300",
};

const NARRATION_MODE_LABELS: Record<string, string> = {
  ai: "AI קריינות",
  manual: "ידנית",
  none: "ללא קריינות",
};

const MOTION_STYLE_LABELS: Record<string, string> = {
  gentle: "עדין",
  dynamic: "דינמי",
  none: "ללא תנועה",
};

interface FilmPanelProps {
  orderId: string;
  filmProject: FilmProject | null;
  scenes: FilmScene[];
}

export function FilmPanel({ orderId, filmProject, scenes }: FilmPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateFilmProject() {
    setLoading("create");
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/film`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "שגיאה ביצירת פרויקט סרט");
        return;
      }
      router.refresh();
    } catch {
      setError("שגיאת רשת");
    } finally {
      setLoading(null);
    }
  }

  // ── Empty state ──
  if (!filmProject) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          לא נוצר פרויקט סרט עדיין.
        </p>
        <Button
          onClick={handleCreateFilmProject}
          disabled={loading === "create"}
          size="sm"
        >
          {loading === "create" ? "יוצר..." : "צור פרויקט סרט"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // ── Film project exists ──
  const status = filmProject.status;
  const colorClass =
    STATUS_COLORS[status] ?? "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <div className="space-y-4">
      {/* Status + metadata */}
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${colorClass}`}
        >
          {STATUS_LABELS[status]}
        </span>
        <Badge variant="outline">
          {NARRATION_MODE_LABELS[filmProject.narration_mode] ?? filmProject.narration_mode}
        </Badge>
        <Badge variant="outline">
          {MOTION_STYLE_LABELS[filmProject.motion_style] ?? filmProject.motion_style}
        </Badge>
        {filmProject.selected_voice_id && (
          <Badge variant="outline">
            קול: {filmProject.selected_voice_id}
          </Badge>
        )}
      </div>

      {/* Error message */}
      {filmProject.error_message && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {filmProject.error_message}
        </div>
      )}

      {/* Scene summary */}
      <div className="text-sm text-muted-foreground">
        {scenes.length > 0 ? (
          <span>
            {scenes.length} סצנות
            {" · "}
            {scenes.filter((s) => s.status === "rendered").length} מרונדרות
            {filmProject.final_duration_seconds != null && (
              <>
                {" · "}
                {Math.round(filmProject.final_duration_seconds)} שניות
              </>
            )}
          </span>
        ) : (
          <span>אין סצנות עדיין</span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <ActionButton
          label="בנה סצנות"
          loadingLabel="בונה..."
          actionKey="build-scenes"
          loading={loading}
          setLoading={setLoading}
          setError={setError}
          disabled={false}
          onClick={() => {
            // TODO: Wire to API route
            setError("בניית סצנות עדיין לא מחוברת");
          }}
        />
        <ActionButton
          label="צור דגימות קול"
          loadingLabel="מייצר..."
          actionKey="voice-samples"
          loading={loading}
          setLoading={setLoading}
          setError={setError}
          disabled={filmProject.narration_mode === "none"}
          onClick={() => {
            // TODO: Wire to API route
            setError("יצירת דגימות קול עדיין לא מחוברת");
          }}
        />
        <ActionButton
          label="רנדר סצנות נבחרות"
          loadingLabel="מרנדר..."
          actionKey="render-scenes"
          loading={loading}
          setLoading={setLoading}
          setError={setError}
          disabled={scenes.length === 0}
          onClick={() => {
            // TODO: Wire to API route
            setError("רינדור סצנות עדיין לא מחובר");
          }}
        />
        <ActionButton
          label="הרכב סרט"
          loadingLabel="מרכיב..."
          actionKey="assemble"
          loading={loading}
          setLoading={setLoading}
          setError={setError}
          disabled={scenes.filter((s) => s.status === "rendered").length === 0}
          onClick={() => {
            // TODO: Wire to API route
            setError("הרכבת סרט עדיין לא מחוברת");
          }}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function ActionButton({
  label,
  loadingLabel,
  actionKey,
  loading,
  setLoading,
  setError,
  disabled,
  onClick,
}: {
  label: string;
  loadingLabel: string;
  actionKey: string;
  loading: string | null;
  setLoading: (v: string | null) => void;
  setError: (v: string | null) => void;
  disabled: boolean;
  onClick: () => void;
}) {
  const isLoading = loading === actionKey;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || loading !== null}
      onClick={() => {
        setLoading(actionKey);
        setError(null);
        try {
          onClick();
        } finally {
          setLoading(null);
        }
      }}
    >
      {isLoading ? loadingLabel : label}
    </Button>
  );
}
