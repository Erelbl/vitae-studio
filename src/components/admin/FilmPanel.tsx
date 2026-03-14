"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TtsOverridesEditor } from "@/components/admin/TtsOverridesEditor";
import type {
  FilmProject,
  FilmProjectStatus,
  FilmScene,
  TtsOverride,
  VoiceChoiceStatus,
} from "@/types/film";

// ── Label maps ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<FilmProjectStatus, string> = {
  draft: "טיוטה",
  scenes_built: "סצנות נבנו",
  narration_pending: "ממתין לקריינות",
  narration_ready: "קריינות מוכנה",
  rendering: "ברינדור",
  rendered: "רינדור הושלם",
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

const VOICE_CHOICE_LABELS: Record<VoiceChoiceStatus, string> = {
  pending: "ממתין לדגימות",
  samples_ready: "דגימות מוכנות",
  chosen: "קול נבחר",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface FilmPanelProps {
  orderId: string;
  filmProject: FilmProject | null;
  scenes: FilmScene[];
  sampleAUrl: string | null;
  sampleBUrl: string | null;
}

export function FilmPanel({
  orderId,
  filmProject,
  scenes,
  sampleAUrl,
  sampleBUrl,
}: FilmPanelProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleCreateFilmProject() {
    await runAction("create", async () => {
      const res = await fetch(`/api/admin/orders/${orderId}/film`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה ביצירת פרויקט סרט");
      }
      router.refresh();
    });
  }

  async function handleGenerateVoiceSamples() {
    await runAction("voice-samples", async () => {
      const res = await fetch(
        `/api/admin/orders/${orderId}/film/voice-samples`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה ביצירת דגימות קול");
      }
      router.refresh();
    });
  }

  async function handleSelectVoice(voiceId: string) {
    await runAction(`select-${voiceId}`, async () => {
      const res = await fetch(
        `/api/admin/orders/${orderId}/film/select-voice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה בבחירת קול");
      }
      router.refresh();
    });
  }

  async function runAction(key: string, fn: () => Promise<void>) {
    setLoadingAction(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא ידועה");
    } finally {
      setLoadingAction(null);
    }
  }

  const isLoading = loadingAction !== null;

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!filmProject) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">לא נוצר פרויקט סרט עדיין.</p>
        <Button
          onClick={handleCreateFilmProject}
          disabled={loadingAction === "create"}
          size="sm"
        >
          {loadingAction === "create" ? "יוצר..." : "צור פרויקט סרט"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // ── Film project exists ────────────────────────────────────────────────────

  const status = filmProject.status;
  const colorClass =
    STATUS_COLORS[status] ?? "bg-gray-50 text-gray-600 border-gray-200";
  const hasSamples =
    filmProject.voice_choice_status === "samples_ready" ||
    filmProject.voice_choice_status === "chosen";

  return (
    <div className="space-y-5">
      {/* Status row */}
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${colorClass}`}
        >
          {STATUS_LABELS[status]}
        </span>
        <Badge variant="outline">
          {NARRATION_MODE_LABELS[filmProject.narration_mode] ??
            filmProject.narration_mode}
        </Badge>
        <Badge variant="outline">
          {MOTION_STYLE_LABELS[filmProject.motion_style] ??
            filmProject.motion_style}
        </Badge>
      </div>

      {/* Error banner */}
      {filmProject.error_message && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {filmProject.error_message}
        </div>
      )}

      {/* Scene summary */}
      {scenes.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {scenes.length} סצנות
          {" · "}
          {scenes.filter((s) => s.status === "rendered").length} מרונדרות
          {filmProject.final_duration_seconds != null && (
            <> · {Math.round(filmProject.final_duration_seconds)} שניות</>
          )}
        </div>
      )}

      {/* ── Voice samples section ──────────────────────────────────────────── */}
      {filmProject.narration_mode !== "none" && (
        <div className="rounded-lg border border-border/60 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium">דגימות קול</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {VOICE_CHOICE_LABELS[filmProject.voice_choice_status]}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={handleGenerateVoiceSamples}
            >
              {loadingAction === "voice-samples"
                ? "מייצר דגימות..."
                : hasSamples
                ? "צור דגימות מחדש"
                : "צור דגימות קול"}
            </Button>
          </div>

          {!hasSamples && (
            <p className="text-sm text-muted-foreground">
              לחץ על &ldquo;צור דגימות קול&rdquo; כדי לשמוע שתי אופציות קריינות ולבחור בין קול א׳ לקול ב׳.
            </p>
          )}

          {hasSamples && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <VoiceSampleCard
                label="קול א׳"
                audioUrl={sampleAUrl}
                voiceId={filmProject.voice_sample_a_voice_id}
                isSelected={
                  filmProject.selected_voice_id ===
                  filmProject.voice_sample_a_voice_id
                }
                onSelect={() =>
                  filmProject.voice_sample_a_voice_id &&
                  handleSelectVoice(filmProject.voice_sample_a_voice_id)
                }
                selectLoading={
                  loadingAction ===
                  `select-${filmProject.voice_sample_a_voice_id}`
                }
                disabled={isLoading}
              />
              <VoiceSampleCard
                label="קול ב׳"
                audioUrl={sampleBUrl}
                voiceId={filmProject.voice_sample_b_voice_id}
                isSelected={
                  filmProject.selected_voice_id ===
                  filmProject.voice_sample_b_voice_id
                }
                onSelect={() =>
                  filmProject.voice_sample_b_voice_id &&
                  handleSelectVoice(filmProject.voice_sample_b_voice_id)
                }
                selectLoading={
                  loadingAction ===
                  `select-${filmProject.voice_sample_b_voice_id}`
                }
                disabled={isLoading}
              />
            </div>
          )}

          {filmProject.voice_choice_status === "chosen" &&
            filmProject.selected_voice_id && (
              <p className="text-sm text-green-700 font-medium">
                ✓ קול נבחר:{" "}
                {filmProject.selected_voice_id ===
                filmProject.voice_sample_a_voice_id
                  ? "קול א׳"
                  : filmProject.selected_voice_id ===
                    filmProject.voice_sample_b_voice_id
                  ? "קול ב׳"
                  : filmProject.selected_voice_id}
              </p>
            )}
        </div>
      )}

      {/* ── TTS pronunciation overrides ───────────────────────────────────── */}
      {filmProject.narration_mode !== "none" && (
        <TtsOverridesEditor
          orderId={orderId}
          initialOverrides={
            (filmProject.tts_overrides_json as TtsOverride[] | null) ?? []
          }
          onSaved={router.refresh}
        />
      )}

      {/* ── Other actions (placeholder stubs) ────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading}
          onClick={() => setError("בניית סצנות עדיין לא מחוברת")}
        >
          בנה סצנות
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading || scenes.length === 0}
          onClick={() => setError("רינדור סצנות עדיין לא מחובר")}
        >
          רנדר סצנות נבחרות
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={
            isLoading ||
            scenes.filter((s) => s.status === "rendered").length === 0
          }
          onClick={() => setError("הרכבת סרט עדיין לא מחוברת")}
        >
          הרכב סרט
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ── VoiceSampleCard ───────────────────────────────────────────────────────────

function VoiceSampleCard({
  label,
  audioUrl,
  voiceId,
  isSelected,
  onSelect,
  selectLoading,
  disabled,
}: {
  label: string;
  audioUrl: string | null;
  voiceId: string | null;
  isSelected: boolean;
  onSelect: () => void;
  selectLoading: boolean;
  disabled: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${
        isSelected
          ? "border-green-400 bg-green-50"
          : "border-border/60 bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        {isSelected && (
          <span className="text-xs text-green-700 font-medium">✓ נבחר</span>
        )}
      </div>

      {audioUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          controls
          src={audioUrl}
          className="w-full h-8"
          style={{ minWidth: 0 }}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {voiceId ? "כתובת השמע אינה זמינה" : "לא נוצרה דגימה"}
        </p>
      )}

      <Button
        variant={isSelected ? "default" : "outline"}
        size="sm"
        className="w-full"
        disabled={disabled || isSelected}
        onClick={onSelect}
      >
        {selectLoading ? "בוחר..." : isSelected ? "קול זה נבחר" : "בחר קול זה"}
      </Button>
    </div>
  );
}
