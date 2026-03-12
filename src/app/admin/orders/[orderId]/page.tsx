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

// Statuses from which admin can publish to customer
const PUBLISHABLE_STATUSES: OrderStatus[] = ["preview_ready", "admin_review"];

// Statuses from which admin can (re-)trigger story generation
const GENERATABLE_STATUSES: OrderStatus[] = [
  "enrichment_complete",
  "photos_uploaded",
  "revision_requested",
  "error_generation",
];

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

  // Fetch order
  const { data: order } = await adminClient
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) notFound();

  // Fetch questionnaire
  const { data: questionnaireRow } = await adminClient
    .from("questionnaire_responses")
    .select("responses, followup_questions, is_complete")
    .eq("order_id", orderId)
    .single();

  // Fetch photos (only uploaded)
  const { data: photos } = await adminClient
    .from("photos")
    .select("id, original_storage_path, original_filename, life_stage, display_order")
    .eq("order_id", orderId)
    .eq("is_uploaded", true)
    .order("display_order");

  // Resolve signed URLs for photos
  const photosWithUrls = photos
    ? await Promise.all(
        photos.map(async (photo) => {
          const { data } = await adminClient.storage
            .from("photos")
            .createSignedUrl(photo.original_storage_path as string, 3600);
          return { ...photo, signedUrl: data?.signedUrl ?? null };
        })
      )
    : [];

  const currentStatus = order.status as OrderStatus;
  const responses = (questionnaireRow?.responses ?? {}) as Partial<QuestionnaireResponses>;
  const followups = (questionnaireRow?.followup_questions ?? []) as FollowUpQA[];
  const canPublish = PUBLISHABLE_STATUSES.includes(currentStatus);
  const canGenerate = GENERATABLE_STATUSES.includes(currentStatus);

  return (
    <div className="space-y-6 max-w-4xl">
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
            <span className="text-sm">{order.person_name || orderId.slice(0, 8)}</span>
          </div>
          <h1 className="text-2xl font-bold">
            {order.person_name || "ללא שם"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            מזמין: {order.buyer_name || "—"} &middot; {order.buyer_phone || "—"}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge variant={currentStatus === "error_generation" ? "destructive" : "secondary"}>
            {STATUS_LABELS[currentStatus] || currentStatus}
          </Badge>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap gap-3 rounded-xl border bg-card p-4">
        <Link href={`/admin/orders/${orderId}/preview`}>
          <Button variant="outline" size="sm">
            צפייה בטיוטה הפנימית
          </Button>
        </Link>
        <Link href={`/admin/orders/${orderId}/draft-text`}>
          <Button variant="ghost" size="sm">
            צפייה בטקסט שנוצר
          </Button>
        </Link>
        {canGenerate && (
          <GenerateStoryButton orderId={orderId} />
        )}
        {canPublish && (
          <PublishButton orderId={orderId} />
        )}
        {currentStatus === "approved" && (
          <span className="self-center text-sm text-green-700 font-medium">
            ✓ פורסם ללקוח
          </span>
        )}
      </div>

      {/* Order summary */}
      <Section title="פרטי הזמנה">
        <Grid>
          <Field label="מזהה הזמנה" value={orderId} mono />
          <Field
            label="נוצרה"
            value={new Date(order.created_at as string).toLocaleString("he-IL")}
          />
          <Field label="שם" value={order.person_name || "—"} />
          <Field
            label="תאריך לידה"
            value={order.person_birth_date || "—"}
          />
          <Field label="מגדר" value={order.person_gender === "male" ? "זכר" : "נקבה"} />
          <Field
            label="אירוע"
            value={order.occasion ? (OCCASION_LABELS[order.occasion] ?? order.occasion) : "—"}
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
              <Field label="תיאור קצר" value={responses.one_sentence_description} />
              <Field label="כינוי" value={responses.nickname} />
              <Field label="דבר ראשון שרואים" value={responses.first_impression} />
              <Field
                label="סוג האלבום"
                value={
                  responses.album_type
                    ? ALBUM_TYPE_LABELS[responses.album_type] ?? responses.album_type
                    : undefined
                }
              />
            </ResponseGroup>
            <ResponseGroup label="ילדות ושורשים">
              <Field label="עיר לידה" value={responses.person_birth_city} />
              <Field label="עיר גדילה" value={responses.childhood_city} />
              <Field label="אחים ואחיות" value={responses.siblings} />
              <Field label="שמות ההורים" value={responses.parent_names} />
              <Field label="תיאור כילד/ה" value={responses.childhood_memories} />
              <Field label="זיכרון מיוחד" value={responses.childhood_special_memory} />
              <Field label="תחביבים בילדות" value={responses.childhood_hobbies} />
            </ResponseGroup>
            <ResponseGroup label="תחנות משמעותיות">
              <Field label="עיסוק מרכזי" value={responses.profession} />
              <Field label="אפיון בעבודה" value={responses.work_characteristics} />
              <Field label="שירות צבאי" value={responses.military_service} />
              <Field label="מקומות מגורים" value={responses.cities_over_years} />
              <Field label="רגע משמעותי" value={responses.defining_moments} />
            </ResponseGroup>
            <ResponseGroup label="אהבה ומשפחה">
              <Field label="בן/בת זוג" value={responses.partner} />
              <Field label="איך הכירו" value={responses.how_they_met} />
              <Field label="סיפור חתונה" value={responses.wedding_story} />
              <Field label="ילדים" value={responses.children} />
              <Field label="כהורה" value={responses.parenting_style} />
            </ResponseGroup>
            <ResponseGroup label="האדם שמאחורי הסיפור">
              <Field label="תכונות בולטות" value={responses.personality_traits} />
              <Field label="הדבר הכי אופייני" value={responses.known_for} />
              <Field label="משפט חוזר" value={responses.favorite_sayings} />
              <Field label="תחביבים" value={responses.hobbies} />
              <Field label="פרט מצחיק" value={responses.funny_detail} />
            </ResponseGroup>
            <ResponseGroup label="רגעים מיוחדים">
              <Field label="רגע מצחיק" value={responses.funny_moment} />
              <Field label="רגע מרגש" value={responses.emotional_moment} />
              <Field label="רגע מאפיין" value={responses.characteristic_moment} />
            </ResponseGroup>
            <ResponseGroup label="מורשת וערכים">
              <Field label="ערכים חשובים" value={responses.important_values} />
              <Field label="גאוות גדולה" value={responses.most_proud_of} />
              <Field label="מה לימדו את הילדים" value={responses.taught_children} />
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

      {/* Photos */}
      {photosWithUrls.length > 0 && (
        <Section title={`תמונות (${photosWithUrls.length})`}>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {photosWithUrls.map((photo) => (
              <div key={photo.id as string} className="space-y-1">
                {photo.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.signedUrl}
                    alt={photo.original_filename as string}
                    className="w-full aspect-square object-cover rounded-lg border"
                  />
                ) : (
                  <div className="w-full aspect-square rounded-lg border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    N/A
                  </div>
                )}
                {photo.life_stage && (
                  <p className="text-xs text-center text-muted-foreground">
                    {LIFE_STAGE_LABELS[photo.life_stage as string] ?? photo.life_stage}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {photosWithUrls.length === 0 && (
        <Section title="תמונות">
          <p className="text-sm text-muted-foreground">לא הועלו תמונות עדיין.</p>
        </Section>
      )}
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
