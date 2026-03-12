import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATUS_LABELS } from "@/lib/state-machine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrderStatus } from "@/types/order";
import type { QuestionnaireResponses, FollowUpQA } from "@/types/questionnaire";
import { PublishButton } from "@/components/admin/PublishButton";
import { GenerateStoryButton } from "@/components/admin/GenerateStoryButton";
import { DraftStatusPoller } from "@/components/admin/DraftStatusPoller";
import { AdminPhotosGallery } from "@/components/admin/AdminPhotosGallery";
import type { PhotoForGallery } from "@/components/admin/AdminPhotosGallery";

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
  life_story_birthday: "סיפור חיים / יום הולדת",
  wedding: "חתונה / סיפור זוגי",
  anniversary: "יום נישואין",
  retirement: "פרישה",
  memorial: "הנצחה",
  other: "אחר",
};

const OCCASION_LABELS: Record<string, string> = {
  birthday: "יום הולדת",
  retirement: "פרישה",
  memorial: "זיכרון",
  anniversary: "יובל",
  other: "אחר",
};

// Statuses where "פרסם ללקוח" is enabled
const PUBLISHABLE_STATUSES: OrderStatus[] = ["preview_ready", "admin_review"];

// Statuses that indicate generation is actively running
const GENERATING_IN_PROGRESS_STATUSES: OrderStatus[] = [
  "generating_text",
  "text_ready",
  "generating_illustrations",
];

// A processing_job that has been "processing" longer than this is stale
const STALE_JOB_MS = 10 * 60 * 1000; // 10 minutes

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
    .select("responses, followup_questions, is_complete")
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

  // Resolve signed URLs for original photos (originals bucket) + illustrations (illustrations bucket)
  const photosForGallery: PhotoForGallery[] = photos
    ? await Promise.all(
        photos.map(async (photo) => {
          const [originalResult, illustrationResult] = await Promise.all([
            adminClient.storage
              .from("originals")
              .createSignedUrl(photo.original_storage_path as string, 3600),
            photo.illustration_storage_path
              ? adminClient.storage
                  .from("illustrations")
                  .createSignedUrl(photo.illustration_storage_path as string, 3600)
              : Promise.resolve({ data: null }),
          ]);

          return {
            id: photo.id as string,
            original_filename: photo.original_filename as string,
            life_stage: photo.life_stage as string | null,
            originalUrl: originalResult.data?.signedUrl ?? null,
            illustrationUrl: illustrationResult.data?.signedUrl ?? null,
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
  // If the order is stuck in a generating state and the latest job is old,
  // reset the order to error_generation so the admin can retry.
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

      // Mark the stale processing job as failed if it's still in processing state
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
  // Group distinct version_numbers from page_versions for this order's pages.
  // Each version_number corresponds to one generation run (see run-generation-pipeline.ts).
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

  // ── Derive display state ──
  const currentStatus = order.status as OrderStatus;
  const responses = (questionnaireRow?.responses ?? {}) as Partial<QuestionnaireResponses>;
  const followups = (questionnaireRow?.followup_questions ?? []) as FollowUpQA[];

  const canPublish = PUBLISHABLE_STATUSES.includes(currentStatus);

  // Disable generate while actively generating or if delivered
  const isGenerating = GENERATING_IN_PROGRESS_STATUSES.includes(currentStatus);
  const generateDisabled = isGenerating || currentStatus === "delivered";

  // Poll for completion when order is actively generating
  const pollerActive = isGenerating;

  // Latest job (after recovery, so reflects updated status if we just marked one failed)
  const latestJob = genJobs?.[0];
  const latestJobIsActive =
    latestJob?.status === "processing" &&
    GENERATING_IN_PROGRESS_STATUSES.includes(currentStatus);

  return (
    <div className="space-y-6 max-w-4xl">
      <DraftStatusPoller active={pollerActive} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/admin"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              הזמנות
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm">
              {order.person_name || orderId.slice(0, 8)}
            </span>
          </div>
          <h1 className="text-2xl font-bold">
            {order.person_name || "ללא שם"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            מזמין: {order.buyer_name || "—"} &middot;{" "}
            {order.buyer_phone || "—"}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge
            variant={
              currentStatus === "error_generation" ? "destructive" : "secondary"
            }
          >
            {STATUS_LABELS[currentStatus] || currentStatus}
          </Badge>
        </div>
      </div>

      {/* ── Story / generation section ── */}
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
            <PublishButton orderId={orderId} disabled={!canPublish} />
            {currentStatus === "approved" && (
              <span className="text-sm text-green-700 font-medium">✓ פורסם</span>
            )}
          </div>
        </div>

        {/* Active generation notice */}
        {isGenerating && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span>
              יצירת הסיפור בתהליך... הדף יתרענן אוטומטית עם השלמתה.
            </span>
          </div>
        )}

        {/* View links (only when pages exist) */}
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

        {/* Empty state */}
        {pageCount === 0 && !isGenerating && (
          <p className="text-sm text-muted-foreground">
            לא נוצר סיפור עדיין. לחץ על &ldquo;צור סיפור חדש&rdquo; כדי להתחיל.
          </p>
        )}

        {/* Text version history */}
        {textVersions.length > 0 && (
          <div className="border-t border-border/60 pt-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              גרסאות טקסט
            </p>
            {textVersions.map((v) => (
              <div
                key={v.version_number}
                className="flex items-center gap-3 text-xs py-1"
              >
                <span className="text-muted-foreground shrink-0">
                  {fmtDate(v.created_at)}
                </span>
                <span className="font-medium shrink-0">
                  גרסה {v.version_number}
                  {v.version_number === maxTextVersion && (
                    <span className="ms-1 text-muted-foreground font-normal">(עדכנית)</span>
                  )}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {v.count} עמודים
                </span>
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

        {/* Generation history from processing_jobs */}
        {genJobs && genJobs.length > 0 && (
          <div className="border-t border-border/60 pt-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              היסטוריית יצירה
            </p>
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
                <div
                  key={job.id as string}
                  className="flex items-center gap-3 text-xs py-1"
                >
                  {/* Status dot */}
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

      {/* Order summary */}
      <Section title="פרטי הזמנה">
        <Grid>
          <Field label="מזהה הזמנה" value={orderId} mono />
          <Field
            label="נוצרה"
            value={fmtDate(order.created_at as string)}
          />
          <Field label="שם" value={order.person_name || "—"} />
          <Field label="תאריך לידה" value={order.person_birth_date || "—"} />
          <Field
            label="מגדר"
            value={order.person_gender === "male" ? "זכר" : "נקבה"}
          />
          <Field
            label="אירוע"
            value={
              order.occasion
                ? (OCCASION_LABELS[order.occasion] ?? order.occasion)
                : "—"
            }
          />
          <Field label="מזמין" value={order.buyer_name || "—"} />
          <Field label="אימייל" value={order.buyer_email || "—"} />
          <Field label="טלפון" value={order.buyer_phone || "—"} />
          <Field
            label="תשלום"
            value={order.payment_status === "paid" ? "שולם" : "ממתין"}
          />
        </Grid>
      </Section>

      {/* Questionnaire responses */}
      {questionnaireRow && (
        <Section title="תשובות השאלון">
          <div className="space-y-4">
            <ResponseGroup label="בואו נכיר">
              <Field
                label="תיאור קצר"
                value={responses.one_sentence_description}
              />
              <Field label="כינוי" value={responses.nickname} />
              <Field
                label="דבר ראשון שרואים"
                value={responses.first_impression}
              />
              <Field
                label="סוג האלבום"
                value={
                  responses.album_type
                    ? ALBUM_TYPE_LABELS[responses.album_type] ??
                      responses.album_type
                    : undefined
                }
              />
            </ResponseGroup>
            <ResponseGroup label="ילדות ושורשים">
              <Field label="עיר לידה" value={responses.person_birth_city} />
              <Field label="עיר גדילה" value={responses.childhood_city} />
              <Field label="אחים ואחיות" value={responses.siblings} />
              <Field label="שמות ההורים" value={responses.parent_names} />
              <Field
                label="תיאור כילד/ה"
                value={responses.childhood_memories}
              />
              <Field
                label="זיכרון מיוחד"
                value={responses.childhood_special_memory}
              />
              <Field
                label="תחביבים בילדות"
                value={responses.childhood_hobbies}
              />
            </ResponseGroup>
            <ResponseGroup label="תחנות משמעותיות">
              <Field label="עיסוק מרכזי" value={responses.profession} />
              <Field
                label="אפיון בעבודה"
                value={responses.work_characteristics}
              />
              <Field label="שירות צבאי" value={responses.military_service} />
              <Field
                label="מקומות מגורים"
                value={responses.cities_over_years}
              />
              <Field
                label="רגע משמעותי"
                value={responses.defining_moments}
              />
            </ResponseGroup>
            <ResponseGroup label="אהבה ומשפחה">
              <Field label="בן/בת זוג" value={responses.partner} />
              <Field label="איך הכירו" value={responses.how_they_met} />
              <Field label="סיפור חתונה" value={responses.wedding_story} />
              <Field label="ילדים" value={responses.children} />
              <Field label="כהורה" value={responses.parenting_style} />
            </ResponseGroup>
            <ResponseGroup label="האדם שמאחורי הסיפור">
              <Field
                label="תכונות בולטות"
                value={responses.personality_traits}
              />
              <Field label="הדבר הכי אופייני" value={responses.known_for} />
              <Field label="משפט חוזר" value={responses.favorite_sayings} />
              <Field label="תחביבים" value={responses.hobbies} />
              <Field label="פרט מצחיק" value={responses.funny_detail} />
            </ResponseGroup>
            <ResponseGroup label="רגעים מיוחדים">
              <Field label="רגע מצחיק" value={responses.funny_moment} />
              <Field label="רגע מרגש" value={responses.emotional_moment} />
              <Field
                label="רגע מאפיין"
                value={responses.characteristic_moment}
              />
            </ResponseGroup>
            <ResponseGroup label="מורשת וערכים">
              <Field label="ערכים חשובים" value={responses.important_values} />
              <Field label="גאוות גדולה" value={responses.most_proud_of} />
              <Field
                label="מה לימדו את הילדים"
                value={responses.taught_children}
              />
            </ResponseGroup>
            <ResponseGroup label="ברכה">
              <Field label="איחול" value={responses.blessing_wish} />
              <Field label="משפט נוסף" value={responses.extra_description} />
            </ResponseGroup>
          </div>
        </Section>
      )}

      {/* Follow-up Q&A */}
      {followups.length > 0 && (
        <Section title={`שאלות המשך (${followups.length})`}>
          <ol className="space-y-4 list-decimal list-inside">
            {followups.map((qa, i) => (
              <li key={i} className="space-y-1">
                <p className="font-medium text-sm">{qa.question}</p>
                <p className="text-sm text-muted-foreground ps-4">
                  {qa.answer || <span className="italic">ללא תשובה</span>}
                </p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Photos + Illustration generation */}
      <Section title={`תמונות (${photosForGallery.length})`}>
        <AdminPhotosGallery orderId={orderId} photos={photosForGallery} />
      </Section>
    </div>
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

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
      {children}
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
