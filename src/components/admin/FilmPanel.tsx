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
  /** Pre-resolved signed thumbnail URLs keyed by scene id. */
  sceneThumbnailUrls?: Record<string, string | null>;
  /** Pre-resolved signed video URLs keyed by scene id (1-hour expiry). */
  sceneVideoUrls?: Record<string, string | null>;
}

export function FilmPanel({
  orderId,
  filmProject,
  scenes,
  sampleAUrl,
  sampleBUrl,
  sceneThumbnailUrls = {},
  sceneVideoUrls = {},
}: FilmPanelProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(
    new Set()
  );

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

  async function handleBuildScenes() {
    await runAction("build-scenes", async () => {
      const res = await fetch(
        `/api/admin/orders/${orderId}/film/build-scenes`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה בבניית סצנות");
      }
      router.refresh();
    });
  }

  async function handleRenderScene(sceneId: string) {
    await runAction(`render-${sceneId}`, async () => {
      const res = await fetch(
        `/api/admin/orders/${orderId}/film/render-scene`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneId }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה ברינדור הסצנה");
      }
      router.refresh();
    });
  }

  async function handleRenderSelected() {
    const ids = [...selectedSceneIds];
    await runAction("render-selected", async () => {
      const res = await fetch(
        `/api/admin/orders/${orderId}/film/render-scenes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneIds: ids }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה ברינדור הסצנות");
      }
      setSelectedSceneIds(new Set());
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

  function toggleSceneSelection(sceneId: string) {
    setSelectedSceneIds((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedSceneIds.size === scenes.length) {
      setSelectedSceneIds(new Set());
    } else {
      setSelectedSceneIds(new Set(scenes.map((s) => s.id)));
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

  const renderedSceneCount = scenes.filter((s) => s.status === "rendered").length;
  const queuedSceneCount = scenes.filter(
    (s) => s.status === "queued" || s.status === "rendering"
  ).length;

  const errorSceneCount = scenes.filter((s) => s.status === "error").length;
  const pendingSceneCount = scenes.filter((s) => s.status === "pending").length;
  const totalDurationSec = Math.round(
    scenes.reduce((sum, s) => sum + (s.duration_ms ?? 0), 0) / 1000
  );

  return (
    <div className="space-y-6">
      {/* ── Project header ─────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
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
          <Button
            variant="ghost"
            size="sm"
            disabled={isLoading}
            onClick={() => router.refresh()}
            title="רענן סטטוס"
          >
            רענן ↻
          </Button>
        </div>

        {/* Scene stats */}
        {scenes.length > 0 && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            <span>{scenes.length} סצנות</span>
            <span className="text-green-600">{renderedSceneCount} מרונדרות</span>
            {queuedSceneCount > 0 && (
              <span className="text-amber-600">{queuedSceneCount} בתור</span>
            )}
            {pendingSceneCount > 0 && (
              <span>{pendingSceneCount} ממתינות</span>
            )}
            {errorSceneCount > 0 && (
              <span className="text-red-600">{errorSceneCount} שגיאות</span>
            )}
            <span>{totalDurationSec} שניות (אומדן)</span>
            {filmProject.final_duration_seconds != null && (
              <span className="font-medium">
                {Math.round(filmProject.final_duration_seconds)} שניות סופי
              </span>
            )}
          </div>
        )}

        {/* Error banner */}
        {filmProject.error_message && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {filmProject.error_message}
          </div>
        )}
      </div>

      {/* ── Voice samples section ──────────────────────────────────────────── */}
      {filmProject.narration_mode !== "none" && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-4">
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

      {/* ── Scenes section ─────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border/60 bg-card p-4 space-y-4">
        {/* Scenes toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-medium">
            סצנות{scenes.length > 0 ? ` (${scenes.length})` : ""}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={handleBuildScenes}
            >
              {loadingAction === "build-scenes"
                ? "בונה סצנות..."
                : scenes.length > 0
                ? "בנה מחדש"
                : "בנה סצנות"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading || renderedSceneCount === 0}
              onClick={() => setError("הרכבת סרט עדיין לא מחוברת")}
            >
              הרכב סרט
            </Button>
          </div>
        </div>

        {scenes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            לא נבנו סצנות עדיין. לחץ &ldquo;בנה סצנות&rdquo; כדי להתחיל.
          </p>
        ) : (
          <>
            {/* Batch selection toolbar */}
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedSceneIds.size === scenes.length && scenes.length > 0}
                    onChange={toggleSelectAll}
                    disabled={isLoading}
                    className="h-3.5 w-3.5 cursor-pointer"
                    ref={(el) => {
                      if (el) {
                        el.indeterminate =
                          selectedSceneIds.size > 0 &&
                          selectedSceneIds.size < scenes.length;
                      }
                    }}
                  />
                  <span className="text-muted-foreground">
                    {selectedSceneIds.size > 0
                      ? `${selectedSceneIds.size} נבחרו`
                      : "בחר הכל"}
                  </span>
                </label>
              </div>
              <Button
                variant={selectedSceneIds.size > 0 ? "default" : "outline"}
                size="sm"
                disabled={isLoading || selectedSceneIds.size === 0}
                onClick={handleRenderSelected}
              >
                {loadingAction === "render-selected"
                  ? "מוסיף לתור..."
                  : selectedSceneIds.size > 0
                  ? `הוסף ${selectedSceneIds.size} לתור רינדור`
                  : "הוסף לתור רינדור"}
              </Button>
            </div>

            {/* Scene column headers */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 uppercase tracking-wide px-0.5 border-b border-border/30 pb-1.5">
              <span className="shrink-0 w-[14px]" />
              <span className="shrink-0 w-10 text-center">תמונה</span>
              <span className="shrink-0 w-5 text-center">#</span>
              <span className="shrink-0 w-20">פריסה</span>
              <span className="flex-1">טקסט</span>
              <span className="shrink-0 w-12 text-end">משך</span>
              <span className="shrink-0 w-16 text-end">סטטוס</span>
              <span className="shrink-0 w-[52px]" />
            </div>

            {/* Scene rows */}
            <div className="divide-y divide-border/30">
              {scenes.map((scene) => (
                <SceneRow
                  key={scene.id}
                  scene={scene}
                  thumbnailUrl={sceneThumbnailUrls[scene.id] ?? null}
                  videoUrl={sceneVideoUrls[scene.id] ?? null}
                  isSelected={selectedSceneIds.has(scene.id)}
                  onToggleSelect={() => toggleSceneSelection(scene.id)}
                  onRender={() => handleRenderScene(scene.id)}
                  isRendering={loadingAction === `render-${scene.id}`}
                  disabled={isLoading}
                />
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground/70 pt-1">
              סצנות בתור ירונדרו ע״י ה-render worker —{" "}
              <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
                npm run render-worker
              </code>
            </p>
          </>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ── SceneRow ──────────────────────────────────────────────────────────────────

const SCENE_STATUS_LABELS: Record<string, string> = {
  pending: "ממתין",
  queued: "בתור",
  rendering: "מרנדר",
  narration_ready: "קריינות מוכנה",
  rendered: "מרונדר",
  error: "שגיאה",
};

const SCENE_STATUS_COLORS: Record<string, string> = {
  pending: "text-muted-foreground",
  queued: "text-amber-600",
  rendering: "text-blue-600",
  narration_ready: "text-blue-600",
  rendered: "text-green-600",
  error: "text-red-600",
};

function SceneRow({
  scene,
  thumbnailUrl,
  videoUrl,
  isSelected,
  onToggleSelect,
  onRender,
  isRendering,
  disabled,
}: {
  scene: FilmScene;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  isSelected: boolean;
  onToggleSelect: () => void;
  onRender: () => void;
  isRendering: boolean;
  disabled: boolean;
}) {
  const textPreview = scene.narration_text
    ? scene.narration_text.length > 55
      ? scene.narration_text.slice(0, 55) + "…"
      : scene.narration_text
    : "—";

  const durationSec =
    scene.duration_ms != null ? (scene.duration_ms / 1000).toFixed(1) : "—";

  const statusColor =
    SCENE_STATUS_COLORS[scene.status] ?? "text-muted-foreground";

  return (
    <div className="flex items-center gap-2 text-xs py-2 group hover:bg-muted/20 transition-colors px-0.5 rounded-sm">
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        disabled={disabled}
        className="shrink-0 h-3.5 w-3.5 cursor-pointer"
        aria-label={`בחר סצנה ${scene.scene_order}`}
      />

      {/* Thumbnail */}
      <div className="shrink-0 w-10 h-7 rounded overflow-hidden bg-muted/50 border border-border/30">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={`תמונה ממוזערת — סצנה ${scene.scene_order}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/50 text-[8px]">
            {scene.status === "rendered" ? "?" : "—"}
          </div>
        )}
      </div>

      {/* Order */}
      <span className="text-muted-foreground shrink-0 w-5 text-center font-mono">
        {scene.scene_order}
      </span>

      {/* Spread key */}
      <span className="text-muted-foreground shrink-0 w-20 truncate font-mono text-[11px]">
        {scene.page_spread_key ?? "—"}
      </span>

      {/* Text preview */}
      <span className="flex-1 truncate text-[11px]" dir="rtl">
        {scene.title ? (
          <span className="font-medium">{scene.title} — </span>
        ) : null}
        {textPreview}
      </span>

      {/* Duration */}
      <span className="text-muted-foreground shrink-0 w-12 text-end tabular-nums">
        {durationSec}s
      </span>

      {/* Status */}
      <span className={`shrink-0 w-16 text-end font-medium ${statusColor}`}>
        {SCENE_STATUS_LABELS[scene.status] ?? scene.status}
      </span>

      {/* Queue + Video buttons */}
      <div className="shrink-0 flex items-center gap-1">
        <button
          type="button"
          onClick={onRender}
          disabled={
            disabled ||
            isRendering ||
            scene.status === "queued" ||
            scene.status === "rendering"
          }
          className="h-6 w-6 flex items-center justify-center rounded text-[10px] border border-border/50 hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={
            scene.status === "queued"
              ? "בתור לרינדור"
              : scene.status === "rendering"
              ? "מרנדר כעת"
              : scene.status === "rendered"
              ? "הוסף לתור מחדש"
              : "הוסף לתור רינדור"
          }
        >
          {isRendering
            ? "…"
            : scene.status === "queued"
            ? "⏳"
            : scene.status === "rendering"
            ? "⚙"
            : scene.status === "rendered"
            ? "↺"
            : "▶"}
        </button>

        {videoUrl ? (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-6 w-6 flex items-center justify-center rounded text-[10px] border border-border/50 hover:bg-muted/60 transition-colors text-blue-600"
            title="צפה בסרטון (נפתח בטאב חדש)"
          >
            ▶
          </a>
        ) : (
          <span className="w-6" />
        )}
      </div>

      {/* Error hint */}
      {scene.status === "error" && scene.error_message && (
        <span
          className="shrink-0 text-red-500 cursor-help"
          title={scene.error_message}
        >
          ⚠
        </span>
      )}
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
