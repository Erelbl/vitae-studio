import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATUS_LABELS } from "@/lib/state-machine";
import { getDisplayStatus } from "@/lib/display-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrderStatus, PaymentStatus, StorySource, ManualSpread, PreviewStatus } from "@/types/order";
import type { QuestionnaireResponses } from "@/types/questionnaire";
import { PublishButton } from "@/components/admin/PublishButton";
import { GenerateStoryButton } from "@/components/admin/GenerateStoryButton";
import { ImproveRhymeButton } from "@/components/admin/ImproveRhymeButton";
import { StoryEvaluationDisplay } from "@/components/admin/StoryEvaluationDisplay";
import { DraftStatusPoller } from "@/components/admin/DraftStatusPoller";
import { AdminPhotosGallery } from "@/components/admin/AdminPhotosGallery";
import { DeleteOrderButton } from "@/components/admin/DeleteOrderButton";
import { FilmPanel } from "@/components/admin/FilmPanel";
import { AdminPhotoUpload } from "@/components/admin/AdminPhotoUpload";
import { ManualStoryEditor } from "@/components/admin/ManualStoryEditor";
import { AlbumLengthControl } from "@/components/admin/AlbumLengthControl";
import { OrderProgressStepper } from "@/components/admin/OrderProgressStepper";
import { AdminOrderStatusEditor } from "@/components/admin/AdminOrderStatusEditor";
import { FulfillmentActionButton } from "@/components/admin/FulfillmentActionButton";
import type { PhotoForGallery } from "@/components/admin/AdminPhotosGallery";
import type { FilmProject, FilmScene } from "@/types/film";
import { createSignedImageUrl } from "@/lib/storage-image";
import { QUESTIONNAIRE_LABELS as QL } from "@/lib/questionnaire-labels";

function fmtDate(ts: string) {
  return new Date(ts).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ALBUM_TYPE_LABELS: Record<string, string> = {
  // New album_type values (on orders table)
  single: "סיפור חיים אישי",
  couple: "לזוג / חתונה / יום נישואין",
  memorial: "הנצחה",
  // Legacy questionnaire album_type values
  life_story_birthday: "סיפור חיים / יום הולדת",
  wedding: "חתונה / סיפור זוגי",
  anniversary: "יום נישואין",
  retirement: "פרישה",
  other: "אחר",
};

const OCCASION_LABELS: Record<string, string> = {
  birthday: "יום הולדת",
  retirement: "פרישה",
  memorial: "זיכרון",
  anniversary: "יובל",
  other: "אחר",
};

// Statuses that indicate generation is actively running
const GENERATING_IN_PROGRESS_STATUSES: OrderStatus[] = [
  "generating_text",
  "text_ready",
  "generating_illustrations",
];

// A processing_job that has been "processing" longer than this is stale
const STALE_JOB_MS = 10 * 60 * 1000; // 10 minutes

function StatusPill({ order }: { order: Record<string, unknown> }) {
  const ds = getDisplayStatus(order as { status: string; payment_status?: string | null; preview_status?: string | null; preview_round?: number | null });
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${ds.color}`}
    >
      {ds.label}
    </span>
  );
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    redirect("/admin/login");
  }

  const { orderId } = await params;
  const adminClient = createAdminClient();

  // ── Fetch order ──
  const { data: order } = await adminClient
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) notFound();

  // ── Fetch questionnaire ──
  const { data: questionnaireRow } = await adminClient
    .from("questionnaire_responses")
    .select("responses, is_complete")
    .eq("order_id", orderId)
    .single();

  // ── Fetch photos (only uploaded) ──
  const { data: photos } = await adminClient
    .from("photos")
    .select(
      "id, original_storage_path, original_filename, life_stage, display_order, illustration_storage_path, illustration_status, illustration_error"
    )
    .eq("order_id", orderId)
    .eq("is_uploaded", true)
    .order("display_order");

  // Resolve signed URLs without transforms for admin gallery display — avoids Supabase image transformation usage
  const photosForGallery: PhotoForGallery[] = photos
    ? await Promise.all(
        photos.map(async (photo) => {
          const [originalUrl, illustrationUrl] = await Promise.all([
            createSignedImageUrl(adminClient, "originals", photo.original_storage_path as string, 3600, "original"),
            photo.illustration_storage_path
              ? createSignedImageUrl(adminClient, "illustrations", photo.illustration_storage_path as string, 3600, "original")
              : Promise.resolve(null),
          ]);

          return {
            id: photo.id as string,
            original_filename: photo.original_filename as string,
            life_stage: photo.life_stage as string | null,
            originalUrl,
            illustrationUrl,
            illustration_status: photo.illustration_status as string | null,
            illustration_error: photo.illustration_error as string | null,
          };
        })
      )
    : [];

  // ── Fetch recent generation jobs for this order (generation history) ──
  const { data: genJobs } = await adminClient
    .from("processing_jobs")
    .select("id, created_at, started_at, completed_at, status, output_data, error_message")
    .eq("order_id", orderId)
    .eq("job_type", "generate_story")
    .order("created_at", { ascending: false })
    .limit(10);

  // ── Stale-job / stuck-order recovery ──
  const now = Date.now();
  const orderCurrentStatus = order.status as OrderStatus;

  if (GENERATING_IN_PROGRESS_STATUSES.includes(orderCurrentStatus)) {
    const latestJob = genJobs?.[0];
    const jobStarted = latestJob?.started_at ?? latestJob?.created_at;
    const isStale =
      !latestJob ||
      (jobStarted &&
        now - new Date(jobStarted as string).getTime() > STALE_JOB_MS);

    if (isStale) {
      console.log(
        `[admin/order] Recovering stuck order ${orderId} from ${orderCurrentStatus} → error_generation`
      );

      await adminClient
        .from("orders")
        .update({ status: "error_generation" })
        .eq("id", orderId);

      if (latestJob && latestJob.status === "processing") {
        await adminClient
          .from("processing_jobs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: "Generation timed out — no completion recorded.",
          })
          .eq("id", latestJob.id as string);
      }

      order.status = "error_generation";
    }
  }

  // ── Fetch current pages (count, version, IDs for history lookup) ──
  const { data: pageStats } = await adminClient
    .from("pages")
    .select("id, page_number, text_version")
    .eq("order_id", orderId)
    .order("page_number");

  // ── Fetch text version history from page_versions ──
  const pageIds = (pageStats ?? []).map((p) => p.id as string);
  const { data: pvRaw } =
    pageIds.length > 0
      ? await adminClient
          .from("page_versions")
          .select("version_number, created_at")
          .eq("version_type", "text")
          .in("page_id", pageIds)
      : { data: [] as { version_number: number; created_at: string }[] };

  // Aggregate: per version_number → earliest created_at + page count
  const versionAgg = new Map<number, { created_at: string; count: number }>();
  for (const pv of pvRaw ?? []) {
    const vn = pv.version_number as number;
    const d = pv.created_at as string;
    const cur = versionAgg.get(vn);
    versionAgg.set(vn, {
      created_at: !cur || d < cur.created_at ? d : cur.created_at,
      count: (cur?.count ?? 0) + 1,
    });
  }
  const textVersions = Array.from(versionAgg.entries())
    .map(([version_number, data]) => ({ version_number, ...data }))
    .sort((a, b) => b.version_number - a.version_number); // newest first

  const pageCount = pageStats?.length ?? 0;
  const maxTextVersion =
    pageCount > 0
      ? Math.max(
          0,
          ...(pageStats ?? [])
            .map((p) => p.text_version as number | null)
            .filter((v): v is number => v != null)
        )
      : 0;

  // ── Fetch film project (if exists) ──
  const { data: filmProjectRow } = await adminClient
    .from("film_projects")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  const filmProject = filmProjectRow as unknown as FilmProject | null;

  let filmScenes: FilmScene[] = [];
  if (filmProject) {
    const { data: scenesData } = await adminClient
      .from("film_scenes")
      .select("*")
      .eq("film_project_id", filmProject.id)
      .order("scene_order");
    // Exclude album-only page types — safety net for projects built before this exclusion
    const FILM_EXCLUDED_SPREAD_KEYS = new Set(["cover", "back_cover"]);
    filmScenes = ((scenesData ?? []) as unknown as FilmScene[]).filter(
      (s) => !FILM_EXCLUDED_SPREAD_KEYS.has(s.page_spread_key ?? "")
    );
  }

  // Resolve signed URLs for voice samples + scene thumbnails (1-hour expiry, admin-only access)
  const filmBucket = process.env.FILM_STORAGE_BUCKET ?? "films";

  const sceneThumbnailUrls: Record<string, string | null> = {};
  const sceneVideoUrls: Record<string, string | null> = {};
  const sceneAudioUrls: Record<string, string | null> = {};
  if (filmScenes.length > 0) {
    await Promise.all(
      filmScenes.map(async (scene) => {
        const [thumbResult, videoResult, audioResult] = await Promise.all([
          scene.thumbnail_path
            ? adminClient.storage
                .from(filmBucket)
                .createSignedUrl(scene.thumbnail_path, 3600)
            : Promise.resolve({ data: null }),
          scene.rendered_scene_path
            ? adminClient.storage
                .from(filmBucket)
                .createSignedUrl(scene.rendered_scene_path, 3600)
            : Promise.resolve({ data: null }),
          scene.audio_path
            ? adminClient.storage
                .from(filmBucket)
                .createSignedUrl(scene.audio_path, 3600)
            : Promise.resolve({ data: null }),
        ]);
        sceneThumbnailUrls[scene.id] = thumbResult.data?.signedUrl ?? null;
        sceneVideoUrls[scene.id] = videoResult.data?.signedUrl ?? null;
        // null means either no audio_path, or URL generation failed (distinguished by scene.audio_path)
        sceneAudioUrls[scene.id] = audioResult.data?.signedUrl ?? null;
      })
    );
  }

  const [filmSampleAUrl, filmSampleBUrl, finalVideoUrl, finalThumbnailUrl] = await Promise.all([
    filmProject?.voice_sample_a_path
      ? adminClient.storage
          .from(filmBucket)
          .createSignedUrl(filmProject.voice_sample_a_path, 3600)
          .then((r) => r.data?.signedUrl ?? null)
      : Promise.resolve(null),
    filmProject?.voice_sample_b_path
      ? adminClient.storage
          .from(filmBucket)
          .createSignedUrl(filmProject.voice_sample_b_path, 3600)
          .then((r) => r.data?.signedUrl ?? null)
      : Promise.resolve(null),
    filmProject?.final_video_path
      ? adminClient.storage
          .from(filmBucket)
          .createSignedUrl(filmProject.final_video_path, 3600)
          .then((r) => r.data?.signedUrl ?? null)
      : Promise.resolve(null),
    filmProject?.final_video_thumbnail_path
      ? adminClient.storage
          .from(filmBucket)
          .createSignedUrl(filmProject.final_video_thumbnail_path, 3600)
          .then((r) => r.data?.signedUrl ?? null)
      : Promise.resolve(null),
  ]);

  // ── Extract story evaluation from order ──
  interface RhymeEvaluation {
    rhyme_score: number;
    hebrew_flow_score: number;
    overall_story_score: number;
    evaluation_notes: string;
    evaluated_at: string;
  }
  const storyEvaluation =
    (order.story_evaluation as RhymeEvaluation | null) ?? null;

  // ── Manual story data ──
  const storySource = (order.story_source as StorySource) ?? "questionnaire";
  const manualSpreads = (order.manual_spreads_json as ManualSpread[] | null) ?? null;

  // ── Derive display state ──
  const currentStatus = order.status as OrderStatus;
  const responses = (questionnaireRow?.responses ?? {}) as Partial<QuestionnaireResponses>;

  const previewStatus = (order.preview_status as PreviewStatus | null) || "draft";
  // Publish eligibility depends ONLY on: generated pages existing, and the
  // order not being in a truly terminal state. It must never depend on
  // preview_round / preview_status / preview_sent_at / preview_approved_at /
  // preview_feedback(_at), nor on order.status beyond the terminal check —
  // otherwise republishing breaks whenever status drifts away from "approved"
  // (e.g. after a story/illustration regeneration cycle).
  const isTerminalForPublish =
    currentStatus === "delivered" || Boolean(order.completed_at);
  const canPublish = !isTerminalForPublish && pageCount > 0;
  const hasBeenPublished = (order.preview_round as number) > 0;
  const isGenerating = GENERATING_IN_PROGRESS_STATUSES.includes(currentStatus);
  const generateDisabled = isGenerating || currentStatus === "delivered";
  const pollerActive = isGenerating;

  const latestJob = genJobs?.[0];
  const latestJobIsActive =
    latestJob?.status === "processing" &&
    GENERATING_IN_PROGRESS_STATUSES.includes(currentStatus);
  void latestJobIsActive; // unused — kept for future use

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <DraftStatusPoller active={pollerActive} />

      {/* ── Header card ── */}
      <div className="rounded-xl border bg-card p-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
          <Link href="/admin/orders" className="hover:text-foreground transition-colors">
            הזמנות
          </Link>
          <span>/</span>
          <span className="text-foreground">
            {order.person_name || orderId.slice(0, 8)}
          </span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold leading-tight">
              {order.person_name || "ללא שם"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              מזמין:{" "}
              <span className="text-foreground">{order.buyer_name || "—"}</span>
              {" · "}
              <span className="font-mono">{order.buyer_phone || "—"}</span>
              {order.buyer_email && (
                <>
                  {" · "}
                  <span>{order.buyer_email}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <StatusPill order={order} />
            <DeleteOrderButton orderId={orderId} personName={order.person_name} />
          </div>
        </div>
      </div>

      {/* ── Order progress stepper ── */}
      <section className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold">התקדמות הזמנה</h2>
          <FulfillmentActionButton
            orderId={orderId}
            previewStatus={order.preview_status as string | null}
            sentToPrintAt={order.sent_to_print_at as string | null}
            shippedToCustomerAt={order.shipped_to_customer_at as string | null}
            completedAt={order.completed_at as string | null}
          />
        </div>
        <OrderProgressStepper
          paymentStatus={order.payment_status as string | null}
          previewStatus={order.preview_status as string | null}
          previewApprovedAt={order.preview_approved_at as string | null}
          paymentDate={order.payment_date as string | null}
          sentToPrintAt={order.sent_to_print_at as string | null}
          shippedToCustomerAt={order.shipped_to_customer_at as string | null}
          completedAt={order.completed_at as string | null}
        />
      </section>

      {/* ── Admin status override ── */}
      <AdminOrderStatusEditor
        orderId={orderId}
        currentStatus={currentStatus}
        currentPaymentStatus={(order.payment_status as PaymentStatus) ?? "pending"}
      />

      {/* ── Two-column main area on desktop ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

        {/* ── Left: Story & generation ── */}
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-semibold">סיפור</h2>
              {pageCount > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {pageCount} עמודים
                  {maxTextVersion > 0 && ` · גרסת טקסט ${maxTextVersion}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <GenerateStoryButton orderId={orderId} disabled={generateDisabled} />
              {pageCount > 0 && !isGenerating && (
                <ImproveRhymeButton orderId={orderId} disabled={generateDisabled} />
              )}
              <PublishButton
                orderId={orderId}
                disabled={!canPublish}
                isRepublish={hasBeenPublished}
              />
              {currentStatus === "approved" && previewStatus === "approved" && (
                <span className="text-sm text-green-700 font-medium">✓ אושר ע״י הלקוח</span>
              )}
              {currentStatus === "approved" && previewStatus === "sent_to_customer" && (
                <span className="text-sm text-blue-600 font-medium">↗ פורסם ללקוח</span>
              )}
              {currentStatus === "approved" && previewStatus === "changes_requested" && (
                <span className="text-sm text-orange-600 font-medium">⟳ התקבלו הערות</span>
              )}
            </div>
          </div>

          {/* Active generation notice */}
          {isGenerating && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span>יצירת הסיפור בתהליך... הדף יתרענן אוטומטית עם השלמתה.</span>
            </div>
          )}

          {/* View links */}
          {pageCount > 0 && !isGenerating && (
            <div className="flex gap-2">
              <Link href={`/admin/orders/${orderId}/preview`}>
                <Button variant="outline" size="sm">
                  פתח תצוגה מקדימה
                </Button>
              </Link>
              <Link href={`/admin/orders/${orderId}/draft-text`}>
                <Button variant="ghost" size="sm">
                  צפייה בטקסט
                </Button>
              </Link>
            </div>
          )}

          {/* Story evaluation */}
          {storyEvaluation && (
            <StoryEvaluationDisplay evaluation={storyEvaluation} />
          )}

          {/* Empty state */}
          {pageCount === 0 && !isGenerating && (
            <p className="text-sm text-muted-foreground">
              לא נוצר סיפור עדיין. לחץ על &ldquo;צור סיפור חדש&rdquo; כדי להתחיל.
            </p>
          )}

          {/* Text version history */}
          {textVersions.length > 0 && (
            <div className="border-t border-border/60 pt-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground mb-2">גרסאות טקסט</p>
              {textVersions.map((v) => (
                <div key={v.version_number} className="flex items-center gap-3 text-xs py-1">
                  <span className="text-muted-foreground shrink-0">{fmtDate(v.created_at)}</span>
                  <span className="font-medium shrink-0">
                    גרסה {v.version_number}
                    {v.version_number === maxTextVersion && (
                      <span className="ms-1 text-muted-foreground font-normal">(עדכנית)</span>
                    )}
                  </span>
                  <span className="text-muted-foreground shrink-0">{v.count} עמודים</span>
                  <Link
                    href={`/admin/orders/${orderId}/text-version/${v.version_number}`}
                    className="text-primary hover:underline shrink-0"
                  >
                    צפייה בטקסט ←
                  </Link>
                </div>
              ))}
            </div>
          )}

          {/* Generation history */}
          {genJobs && genJobs.length > 0 && (
            <div className="border-t border-border/60 pt-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground mb-2">היסטוריית יצירה</p>
              {genJobs.map((job) => {
                const jobStatus = job.status as string;
                const isJobActive = jobStatus === "processing";
                const isJobDone = jobStatus === "completed";
                const isJobFailed = jobStatus === "failed";
                const outputData = job.output_data as {
                  pages_saved?: number;
                  review_issues?: number;
                } | null;

                return (
                  <div key={job.id as string} className="flex items-center gap-3 text-xs py-1">
                    <span
                      className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                        isJobActive
                          ? "bg-amber-400 animate-pulse"
                          : isJobDone
                          ? "bg-green-500"
                          : "bg-red-400"
                      }`}
                    />
                    <span className="text-muted-foreground shrink-0">
                      {fmtDate(job.created_at as string)}
                    </span>
                    <span
                      className={
                        isJobActive
                          ? "text-amber-700"
                          : isJobDone
                          ? "text-green-700"
                          : "text-red-700"
                      }
                    >
                      {isJobActive && "בתהליך"}
                      {isJobDone &&
                        `הושלם${outputData?.pages_saved != null ? ` · ${outputData.pages_saved} עמודים` : ""}`}
                      {isJobFailed && "נכשל"}
                    </span>
                    {isJobFailed && job.error_message && (
                      <span
                        className="text-muted-foreground truncate max-w-[200px] cursor-help"
                        title={job.error_message as string}
                      >
                        — {(job.error_message as string).slice(0, 60)}…
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Right: Order details sidebar ── */}
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="text-base font-semibold">פרטי הזמנה</h2>
          <dl className="space-y-3">
            <SideField label="מזהה" value={orderId.slice(0, 8) + "…"} mono />
            <SideField label="נוצרה" value={fmtDate(order.created_at as string)} />
            <SideField label="שם" value={order.person_name || "—"} />
            <SideField label="תאריך לידה" value={order.person_birth_date || "—"} />
            <SideField
              label="מגדר"
              value={order.person_gender === "male" ? "זכר" : "נקבה"}
            />
            <SideField
              label="אירוע"
              value={
                order.occasion
                  ? (OCCASION_LABELS[order.occasion] ?? order.occasion)
                  : "—"
              }
            />
            <div className="border-t border-border/60 pt-3">
              <AlbumLengthControl
                orderId={orderId}
                initialValue={(order.target_page_count as number) ?? 40}
              />
            </div>
            <div className="border-t border-border/60 pt-3 space-y-3">
              <SideField label="מזמין" value={order.buyer_name || "—"} />
              <SideField label="אימייל" value={order.buyer_email || "—"} />
              <SideField label="טלפון" value={order.buyer_phone || "—"} />
              <SideField
                label="תשלום"
                value={order.payment_status === "paid" ? "✓ שולם" : "ממתין לתשלום"}
              />
            </div>
          </dl>
        </section>
      </div>

      {/* ── Preview review status ── */}
      {(order.preview_status && order.preview_status !== "draft") && (
        <PreviewStatusSection
          previewStatus={order.preview_status as PreviewStatus}
          previewRound={(order.preview_round as number) || 0}
          previewSentAt={order.preview_sent_at as string | null}
          previewFeedback={order.preview_feedback as string | null}
          previewFeedbackAt={order.preview_feedback_at as string | null}
          previewApprovedAt={order.preview_approved_at as string | null}
        />
      )}

      {/* ── Manual Story Editor ── */}
      <Section title="מקור הסיפור">
        <ManualStoryEditor
          orderId={orderId}
          initialStorySource={storySource}
          initialSpreads={manualSpreads}
          targetPageCount={(order.target_page_count as number) ?? 40}
        />
      </Section>

      {/* ── Film section ── */}
      <Section title="סרט">
        <FilmPanel
          orderId={orderId}
          filmProject={filmProject}
          scenes={filmScenes}
          sampleAUrl={filmSampleAUrl}
          sampleBUrl={filmSampleBUrl}
          sceneThumbnailUrls={sceneThumbnailUrls}
          sceneVideoUrls={sceneVideoUrls}
          sceneAudioUrls={sceneAudioUrls}
          finalVideoUrl={finalVideoUrl}
          finalThumbnailUrl={finalThumbnailUrl}
        />
      </Section>

      {/* ── Photos + Illustration generation ── */}
      <Section title={`תמונות (${photosForGallery.length})`}>
        <div className="border-b border-border/60 pb-4 mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">העלאת תמונות (אדמין)</p>
          <AdminPhotoUpload orderId={orderId} />
        </div>
        <AdminPhotosGallery orderId={orderId} photos={photosForGallery} />
      </Section>

      {/* ── Questionnaire responses ── */}
      {questionnaireRow && (
        <Section title="תשובות השאלון">
          <div className="space-y-4">
            <ResponseGroup label="בואו נכיר">
              <Field label={QL.one_sentence_description} value={responses.one_sentence_description} />
              <Field label={QL.nickname} value={responses.nickname} />
              <Field label={QL.first_impression} value={responses.first_impression} />
              <Field
                label={QL.album_type}
                value={
                  responses.album_type
                    ? ALBUM_TYPE_LABELS[responses.album_type] ?? responses.album_type
                    : undefined
                }
              />
            </ResponseGroup>
            <ResponseGroup label="ילדות ושורשים">
              <Field label={QL.person_birth_city} value={responses.person_birth_city} />
              <Field label={QL.childhood_city} value={responses.childhood_city} />
              <Field label={QL.siblings} value={responses.siblings} />
              <Field label={QL.parent_names} value={responses.parent_names} />
              <Field label={QL.childhood_memories} value={responses.childhood_memories} />
              <Field label={QL.childhood_special_memory} value={responses.childhood_special_memory} />
              <Field label={QL.childhood_hobbies} value={responses.childhood_hobbies} />
            </ResponseGroup>
            <ResponseGroup label="תחנות משמעותיות">
              <Field label={QL.profession} value={responses.profession} />
              <Field label={QL.work_characteristics} value={responses.work_characteristics} />
              <Field label={QL.military_service} value={responses.military_service} />
              <Field label={QL.cities_over_years} value={responses.cities_over_years} />
              <Field label={QL.defining_moments} value={responses.defining_moments} />
            </ResponseGroup>
            <ResponseGroup label="אהבה ומשפחה">
              <Field label={QL.partner} value={responses.partner} />
              <Field label={QL.how_they_met} value={responses.how_they_met} />
              <Field label={QL.wedding_story} value={responses.wedding_story} />
              <Field label={QL.children} value={responses.children} />
              <Field label={QL.parenting_style} value={responses.parenting_style} />
            </ResponseGroup>
            <ResponseGroup label="האדם שמאחורי הסיפור">
              <Field label={QL.personality_traits} value={responses.personality_traits} />
              <Field label={QL.known_for} value={responses.known_for} />
              <Field label={QL.favorite_sayings} value={responses.favorite_sayings} />
              <Field label={QL.hobbies} value={responses.hobbies} />
              <Field label={QL.funny_detail} value={responses.funny_detail} />
            </ResponseGroup>
            <ResponseGroup label="רגעים מיוחדים">
              <Field label={QL.funny_moment} value={responses.funny_moment} />
              <Field label={QL.emotional_moment} value={responses.emotional_moment} />
              <Field label={QL.characteristic_moment} value={responses.characteristic_moment} />
            </ResponseGroup>
            <ResponseGroup label="מורשת וערכים">
              <Field label={QL.important_values} value={responses.important_values} />
              <Field label={QL.most_proud_of} value={responses.most_proud_of} />
              <Field label={QL.taught_children} value={responses.taught_children} />
            </ResponseGroup>
            <ResponseGroup label="ברכה">
              <Field label={QL.blessing_wish} value={responses.blessing_wish} />
              <Field label={QL.extra_description} value={responses.extra_description} />
            </ResponseGroup>
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Preview status section ──────────────────────────────────────────────────

const PREVIEW_STATUS_LABELS: Record<PreviewStatus, string> = {
  draft: "טיוטה",
  sent_to_customer: "נשלח ללקוח",
  changes_requested: "הלקוח ביקש שינויים",
  approved: "אושר ע״י הלקוח",
};

const PREVIEW_STATUS_COLORS: Record<PreviewStatus, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-300",
  sent_to_customer: "bg-blue-100 text-blue-700 border-blue-300",
  changes_requested: "bg-orange-100 text-orange-700 border-orange-300",
  approved: "bg-green-100 text-green-700 border-green-300",
};

function PreviewStatusSection({
  previewStatus,
  previewRound,
  previewSentAt,
  previewFeedback,
  previewFeedbackAt,
  previewApprovedAt,
}: {
  previewStatus: PreviewStatus;
  previewRound: number;
  previewSentAt: string | null;
  previewFeedback: string | null;
  previewFeedbackAt: string | null;
  previewApprovedAt: string | null;
}) {
  const colorClass = PREVIEW_STATUS_COLORS[previewStatus] ?? "bg-gray-50 text-gray-600 border-gray-200";
  const statusLabel = PREVIEW_STATUS_LABELS[previewStatus] ?? previewStatus;

  return (
    <section className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">סטטוס תצוגה מקדימה</h2>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${colorClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="flex gap-6 text-sm text-muted-foreground">
        {previewRound > 0 && <span>סבב: {previewRound}</span>}
        {previewSentAt && <span>נשלח: {fmtDate(previewSentAt)}</span>}
        {previewApprovedAt && <span>אושר: {fmtDate(previewApprovedAt)}</span>}
      </div>

      {previewStatus === "changes_requested" && previewFeedback && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-orange-700">
            <span className="font-medium">הערות מהלקוח</span>
            {previewFeedbackAt && <span>{fmtDate(previewFeedbackAt)}</span>}
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {previewFeedback}
          </p>
        </div>
      )}
    </section>
  );
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 space-y-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function SideField({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground shrink-0">{label}</dt>
      <dd
        className={`text-sm text-end ${mono ? "font-mono text-xs" : ""} ${
          !value || value === "—" ? "text-muted-foreground" : ""
        }`}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground mb-0.5">{label}</dt>
      <dd className={`text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function ResponseGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-2 border-b pb-1">
        {label}
      </h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        {children}
      </dl>
    </div>
  );
}
