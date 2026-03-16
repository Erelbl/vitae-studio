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
  /**
   * Pre-resolved signed audio URLs keyed by scene id (1-hour expiry).
   * null means either no audio_path on the scene OR signed URL generation failed.
   * Distinguish the two cases by checking scene.audio_path.
   */
  sceneAudioUrls?: Record<string, string | null>;
  /** Pre-resolved signed URL for the final assembled film (1-hour expiry). */
  finalVideoUrl?: string | null;
  /** Pre-resolved signed URL for the final film thumbnail (1-hour expiry). */
  finalThumbnailUrl?: string | null;
}

export function FilmPanel({
  orderId,
  filmProject,
  scenes,
  sampleAUrl,
  sampleBUrl,
  sceneThumbnailUrls = {},
  sceneVideoUrls = {},
  sceneAudioUrls = {},
  finalVideoUrl = null,
  finalThumbnailUrl = null,
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

  async function handleGenerateSceneAudio(sceneId: string) {
    await runAction(`audio-${sceneId}`, async () => {
      const res = await fetch(
        `/api/admin/orders/${orderId}/film/generate-audio`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneIds: [sceneId] }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה ביצירת שמע");
      }
      const data = await res.json();
      if (data.failed > 0 && data.errors?.length > 0) {
        throw new Error(data.errors[0]);
      }
      router.refresh();
    });
  }

  async function handleGenerateAudioSelected() {
    const ids = [...selectedSceneIds];
    await runAction("generate-audio-selected", async () => {
      const res = await fetch(
        `/api/admin/orders/${orderId}/film/generate-audio`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneIds: ids }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה ביצירת שמע לסצנות");
      }
      const data = await res.json();
      if (data.failed > 0) {
        throw new Error(
          `${data.generated} הצליחו, ${data.failed} נכשלו. ${data.errors?.[0] ?? ""}`
        );
      }
      setSelectedSceneIds(new Set());
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

  // ── Download / export handlers ──────────────────────────────────────────

  /**
   * Triggers a ZIP download for selected scenes (or all scenes if sceneIds is null).
   * @param sceneIds null = all scenes; string[] = specific scene IDs
   * @param video    include rendered scene MP4s
   * @param audio    include narration MP3s
   * @param actionKey unique key for loading state
   */
  async function handleExportZip(
    sceneIds: string[] | null,
    video: boolean,
    audio: boolean,
    actionKey: string
  ) {
    await runAction(actionKey, async () => {
      const res = await fetch(
        `/api/admin/orders/${orderId}/film/export-zip`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(sceneIds != null ? { sceneIds } : {}),
            video,
            audio,
          }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה בייצוא קבצים");
      }

      // Stream blob and trigger download via hidden anchor
      const blob = await res.blob();
      const contentDisposition = res.headers.get("Content-Disposition") ?? "";
      const match = contentDisposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "film-export.zip";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  async function handleAssembleFilm() {
    await runAction("assemble", async () => {
      const res = await fetch(
        `/api/admin/orders/${orderId}/film/assemble`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה בהרכבת הסרט");
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

  // A scene is "assembly-ready" if:
  //   - status === "rendered"  → already has a rendered MP4 video
  //   - status === "narration_ready" with duration_ms set → has audio (or is a
  //     silent-audio scene like cover/back_cover) and will be queued for rendering
  //     when the admin clicks "Assemble Film". The render worker processes those
  //     queued scenes first, then auto-assembles once all are rendered.
  // Scenes in any other status (pending, queued, rendering, error) are NOT ready.
  const assemblyReadyCount = scenes.filter(
    (s) =>
      s.status === "rendered" ||
      (s.status === "narration_ready" && s.duration_ms != null)
  ).length;

  const errorSceneCount = scenes.filter((s) => s.status === "error").length;
  const pendingSceneCount = scenes.filter((s) => s.status === "pending").length;
  const audioReadyCount = scenes.filter((s) => s.audio_path != null).length;
  const voiceChosen = Boolean(filmProject.selected_voice_id);
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
            {audioReadyCount > 0 && (
              <span className="text-blue-600">🔊 {audioReadyCount} עם שמע</span>
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
            {/* Export all: video + audio ZIP */}
            {scenes.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={isLoading}
                onClick={() =>
                  handleExportZip(null, true, true, "export-all")
                }
                title="ייצא ZIP של כל סרטוני הסצנות וקבצי השמע"
              >
                {loadingAction === "export-all" ? "מייצא..." : "⬇ ייצא הכל (ZIP)"}
              </Button>
            )}
            <Button
              variant={assemblyReadyCount === scenes.length && scenes.length > 0 ? "default" : "outline"}
              size="sm"
              disabled={
                isLoading ||
                assemblyReadyCount === 0 ||
                assemblyReadyCount < scenes.length ||
                status === "rendering"
              }
              onClick={handleAssembleFilm}
              title={
                assemblyReadyCount < scenes.length
                  ? `${scenes.length - assemblyReadyCount} סצנות עדיין לא מוכנות (ממתינות לשמע או בשגיאה)`
                  : status === "rendering"
                  ? "הרכבה בתהליך..."
                  : undefined
              }
            >
              {loadingAction === "assemble"
                ? "מתזמן הרכבה..."
                : status === "rendering"
                ? "⏳ ממתין להרכבה"
                : status === "assembled"
                ? "הרכב מחדש"
                : "הרכב סרט"}
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
                variant={selectedSceneIds.size > 0 && voiceChosen ? "default" : "outline"}
                size="sm"
                disabled={isLoading || selectedSceneIds.size === 0 || !voiceChosen}
                onClick={handleGenerateAudioSelected}
                title={!voiceChosen ? "בחר קול תחילה" : undefined}
              >
                {loadingAction === "generate-audio-selected"
                  ? "מייצר שמע..."
                  : selectedSceneIds.size > 0
                  ? `🎙 צור שמע ל-${selectedSceneIds.size}`
                  : "🎙 צור שמע"}
              </Button>
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
              {/* Batch download — only show when scenes are selected */}
              {selectedSceneIds.size > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isLoading}
                    onClick={() =>
                      handleExportZip(
                        [...selectedSceneIds],
                        true,
                        false,
                        "export-video-selected"
                      )
                    }
                    title={`הורד ${selectedSceneIds.size} סרטוני וידאו כ-ZIP`}
                  >
                    {loadingAction === "export-video-selected"
                      ? "מוריד..."
                      : `⬇ וידאו (${selectedSceneIds.size})`}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isLoading}
                    onClick={() =>
                      handleExportZip(
                        [...selectedSceneIds],
                        false,
                        true,
                        "export-audio-selected"
                      )
                    }
                    title={`הורד ${selectedSceneIds.size} קבצי שמע כ-ZIP`}
                  >
                    {loadingAction === "export-audio-selected"
                      ? "מוריד..."
                      : `⬇ שמע (${selectedSceneIds.size})`}
                  </Button>
                </>
              )}
            </div>

            {/* Scene column headers */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 uppercase tracking-wide px-0.5 border-b border-border/30 pb-1.5">
              <span className="shrink-0 w-[14px]" />
              <span className="shrink-0 w-10 text-center">תמונה</span>
              <span className="shrink-0 w-5 text-center">#</span>
              <span className="shrink-0 w-20">פריסה</span>
              <span className="flex-1">טקסט</span>
              <span className="shrink-0 w-14 text-end">שמע / משך</span>
              <span className="shrink-0 w-16 text-end">סטטוס</span>
              <span className="shrink-0 w-[122px]" />
            </div>

            {/* Scene rows */}
            <div className="divide-y divide-border/30">
              {scenes.map((scene) => (
                <SceneRow
                  key={scene.id}
                  orderId={orderId}
                  scene={scene}
                  thumbnailUrl={sceneThumbnailUrls[scene.id] ?? null}
                  videoUrl={sceneVideoUrls[scene.id] ?? null}
                  audioUrl={sceneAudioUrls[scene.id] ?? null}
                  isSelected={selectedSceneIds.has(scene.id)}
                  onToggleSelect={() => toggleSceneSelection(scene.id)}
                  onRender={() => handleRenderScene(scene.id)}
                  onGenerateAudio={() => handleGenerateSceneAudio(scene.id)}
                  isRendering={loadingAction === `render-${scene.id}`}
                  isGeneratingAudio={loadingAction === `audio-${scene.id}`}
                  canGenerateAudio={voiceChosen}
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

      {/* ── Final film section ──────────────────────────────────────────── */}
      {(status === "assembled" || status === "rendering" || filmProject.final_video_path) && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <p className="text-sm font-medium">סרט סופי</p>

          {status === "rendering" && !filmProject.final_video_path && (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <span className="animate-pulse">⏳</span>
              <span>הסרט בתהליך הרכבה — ה-render worker ירכיב את הסרט. רענן כדי לבדוק.</span>
            </div>
          )}

          {filmProject.final_video_path && (
            <div className="space-y-3">
              {/* Thumbnail + info */}
              <div className="flex items-start gap-4">
                {finalThumbnailUrl && (
                  <div className="shrink-0 w-40 rounded overflow-hidden border border-border/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={finalThumbnailUrl}
                      alt="תמונה ממוזערת — סרט סופי"
                      className="w-full aspect-video object-cover"
                    />
                  </div>
                )}
                <div className="space-y-1.5 text-sm">
                  {filmProject.final_duration_seconds != null && (
                    <p>
                      <span className="text-muted-foreground">משך: </span>
                      <span className="font-medium">
                        {Math.floor(filmProject.final_duration_seconds / 60)}:{String(Math.round(filmProject.final_duration_seconds % 60)).padStart(2, "0")}
                      </span>
                    </p>
                  )}
                  {filmProject.last_assembled_at && (
                    <p className="text-muted-foreground text-xs">
                      הורכב: {new Date(filmProject.last_assembled_at).toLocaleString("he-IL")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {scenes.length} סצנות, {scenes.length > 1 ? `${scenes.length - 1} מעברי עמוד` : "ללא מעברים"}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {finalVideoUrl && (
                  <>
                    <a
                      href={finalVideoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted/60 transition-colors"
                    >
                      ▶ צפה בסרט
                    </a>
                    <a
                      href={finalVideoUrl}
                      download="film.mp4"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted/60 transition-colors"
                    >
                      ⬇ הורד
                    </a>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
  orderId,
  scene,
  thumbnailUrl,
  videoUrl,
  audioUrl,
  isSelected,
  onToggleSelect,
  onRender,
  onGenerateAudio,
  isRendering,
  isGeneratingAudio,
  canGenerateAudio,
  disabled,
}: {
  orderId: string;
  scene: FilmScene;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  /** Signed URL for scene narration audio. null = no audio OR URL generation failed. */
  audioUrl: string | null;
  isSelected: boolean;
  onToggleSelect: () => void;
  onRender: () => void;
  onGenerateAudio: () => void;
  isRendering: boolean;
  isGeneratingAudio: boolean;
  canGenerateAudio: boolean;
  disabled: boolean;
}) {
  const textPreview = scene.narration_text
    ? scene.narration_text.length > 55
      ? scene.narration_text.slice(0, 55) + "…"
      : scene.narration_text
    : "—";

  const hasAudio = Boolean(scene.audio_path);
  const audioDurationSec =
    scene.audio_duration_ms != null
      ? (scene.audio_duration_ms / 1000).toFixed(1)
      : null;
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

      {/* Audio duration / estimated duration */}
      <div className="shrink-0 w-14 text-end tabular-nums leading-tight">
        {hasAudio ? (
          audioUrl ? (
            <a
              href={audioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 font-medium text-[11px] hover:underline"
              title="האזן לשמע (נפתח בטאב חדש)"
            >
              🔊 {audioDurationSec}s
            </a>
          ) : (
            <span
              className="text-red-500 text-[11px] cursor-help"
              title="שמע קיים אך לא ניתן היה ליצור קישור. רענן את הדף."
            >
              🔊 ⚠
            </span>
          )
        ) : (
          <span className="text-muted-foreground text-[11px]" title="משך מוערך">
            ~{durationSec}s
          </span>
        )}
      </div>

      {/* Status */}
      <span className={`shrink-0 w-16 text-end font-medium ${statusColor}`}>
        {SCENE_STATUS_LABELS[scene.status] ?? scene.status}
      </span>

      {/* Audio + Queue + Video buttons */}
      <div className="shrink-0 flex items-center gap-1">
        {/* Generate audio */}
        <button
          type="button"
          onClick={onGenerateAudio}
          disabled={disabled || isGeneratingAudio || !canGenerateAudio}
          className="h-6 w-6 flex items-center justify-center rounded text-[10px] border border-border/50 hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={
            !canGenerateAudio
              ? "בחר קול תחילה"
              : hasAudio
              ? "צור שמע מחדש"
              : "צור שמע"
          }
        >
          {isGeneratingAudio ? "…" : hasAudio ? "🔊" : "🎙"}
        </button>

        {/* Queue for render */}
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

        {/* Per-scene download: video */}
        {scene.rendered_scene_path ? (
          <a
            href={`/api/admin/orders/${orderId}/film/download-asset?sceneId=${scene.id}&type=video`}
            className="h-6 w-6 flex items-center justify-center rounded text-[10px] border border-border/50 hover:bg-muted/60 transition-colors text-muted-foreground"
            title="הורד סרטון (MP4)"
          >
            🎬
          </a>
        ) : (
          <span className="w-6" />
        )}

        {/* Per-scene download: audio */}
        {scene.audio_path ? (
          <a
            href={`/api/admin/orders/${orderId}/film/download-asset?sceneId=${scene.id}&type=audio`}
            className="h-6 w-6 flex items-center justify-center rounded text-[10px] border border-border/50 hover:bg-muted/60 transition-colors text-muted-foreground"
            title="הורד שמע קריינות (MP3)"
          >
            🎵
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
