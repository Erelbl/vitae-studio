import Anthropic from "@anthropic-ai/sdk";
import type { StoryProfile, AlbumOutlineItem, AlbumPageType } from "./types";
import type { GenerationSettings } from "@/types/page";

const DEFAULT_MODEL = "claude-sonnet-4-6";

const DEFAULT_SYSTEM_PROMPT = `אתה מומחה ליצירת אלבומי חיים מחורזים בעברית.
תפקידך ליצור תוכנית מפורטת ל-40 עמודי אלבום שמספרת את סיפור חייו של אדם בצורה כרונולוגית ורגשית.

כללי מבנה:
- עמוד 1: כריכה קדמית (cover)
- עמוד 2: הקדשה (dedication)
- עמודים 3–39: תוכן הסיפור (illustration_and_text או text_only)
- עמוד 40: כריכה אחורית (back_cover)

עקרונות ליצירת התוכנית:
- התקדמות כרונולוגית: לידה → ילדות → נעורים → קריירה → משפחה → הווה
- זרימה רגשית: פתיחה בחמימות, עלייה לשמחה, סיום בהכרת תודה ואהבה
- כ-20% מעמודי התוכן יהיו text_only לגיוון
- אל תמציא עובדות — בסס אך ורק על הפרופיל שניתן
- אם אין מידע על שלב חיים מסוים, דלג עליו בחן

החזר JSON בלבד: מערך של בדיוק 40 אובייקטים.`;

export async function generateAlbumOutline(
  profile: StoryProfile,
  settings: GenerationSettings | null
): Promise<AlbumOutlineItem[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const modelId = settings?.model_id ?? DEFAULT_MODEL;
  const systemPrompt = settings?.system_prompt ?? DEFAULT_SYSTEM_PROMPT;
  const temperature = settings?.temperature ?? 0.8;
  const maxTokens = settings?.max_tokens ?? 4096;

  const genderLabel = profile.person_gender === "female" ? "אישה" : "גבר";
  const toneLabel =
    profile.tone_preference === "humorous"
      ? "הומוריסטי"
      : profile.tone_preference === "emotional"
      ? "רגשי"
      : "מאוזן";

  const sections = [
    profile.birth_background && `רקע לידה: ${profile.birth_background}`,
    profile.childhood_memories && `ילדות: ${profile.childhood_memories}`,
    profile.youth_adolescence && `נעורים: ${profile.youth_adolescence}`,
    profile.career_achievements && `קריירה: ${profile.career_achievements}`,
    profile.family_relationships && `משפחה: ${profile.family_relationships}`,
    profile.personality_traits && `אופי: ${profile.personality_traits}`,
    profile.emotional_highlights &&
      `רגעים מיוחדים:\n${profile.emotional_highlights}`,
  ]
    .filter(Boolean)
    .join("\n");

  const userMessage = `צור תוכנית ל-40 עמודי אלבום עבור:
שם: ${profile.subject_name}
מין: ${genderLabel}
טון: ${toneLabel}
סוג האלבום: ${profile.occasion_context}

פרטי הסיפור:
${sections || "אין פרטים — השתמש בתבנית כללית חמה"}

חשוב: ה-description של כל עמוד צריך להתבסס על הפרטים הספציפיים שניתנו לעיל (שמות, מקומות, מקצוע, אירועים). אל תשתמש בתיאורים גנריים כשיש נתונים ספציפיים.

פורמט תשובה — JSON בלבד (ללא הסברים):
[
  {
    "page_number": 1,
    "life_stage": "cover",
    "emotional_theme": "פתיחה",
    "description": "כריכה קדמית עם שם האדם",
    "page_type": "cover"
  },
  ...40 פריטים סה"כ...
]

סוגי עמוד תקפים: cover, dedication, illustration_and_text, text_only, back_cover`;

  const message = await client.messages.create({
    model: modelId,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText =
    message.content[0]?.type === "text" ? message.content[0].text : "";

  return parseOutline(rawText);
}

function parseOutline(raw: string): AlbumOutlineItem[] {
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as unknown[];
      if (Array.isArray(parsed) && parsed.length >= 35) {
        return parsed
          .filter(
            (item): item is Record<string, unknown> =>
              typeof item === "object" && item !== null
          )
          .slice(0, 40)
          .map((item, i) => ({
            page_number: (item.page_number as number) ?? i + 1,
            life_stage: String(item.life_stage ?? ""),
            emotional_theme: String(item.emotional_theme ?? ""),
            description: String(item.description ?? ""),
            page_type: coercePageType(String(item.page_type ?? "")),
          }));
      }
    }
  } catch {
    // fall through to default
  }

  return buildDefaultOutline();
}

function coercePageType(pt: string): AlbumPageType {
  const valid: AlbumPageType[] = [
    "cover",
    "dedication",
    "illustration_and_text",
    "text_only",
    "back_cover",
  ];
  return valid.includes(pt as AlbumPageType)
    ? (pt as AlbumPageType)
    : "illustration_and_text";
}

/** Fallback outline used when Claude's response cannot be parsed. */
function buildDefaultOutline(): AlbumOutlineItem[] {
  const storyStages = [
    { stage: "לידה", theme: "התחלה" },
    { stage: "ילדות מוקדמת", theme: "תמימות" },
    { stage: "ילדות", theme: "סקרנות" },
    { stage: "ילדות", theme: "משחק" },
    { stage: "ילדות", theme: "חברות" },
    { stage: "ילדות", theme: "משפחה" },
    { stage: "נעורים", theme: "גדילה" },
    { stage: "נעורים", theme: "חלומות" },
    { stage: "נעורים", theme: "חיפוש" },
    { stage: "צבא/לימודים", theme: "בגרות" },
    { stage: "צבא/לימודים", theme: "עצמאות" },
    { stage: "קריירה", theme: "יצירה" },
    { stage: "קריירה", theme: "הישגים" },
    { stage: "קריירה", theme: "תרומה" },
    { stage: "קריירה", theme: "גאווה" },
    { stage: "אהבה", theme: "פגישה" },
    { stage: "זוגיות", theme: "שותפות" },
    { stage: "בית", theme: "חמימות" },
    { stage: "הורות", theme: "שמחה" },
    { stage: "הורות", theme: "טיפול" },
    { stage: "הורות", theme: "גאווה" },
    { stage: "משפחה", theme: "חגים" },
    { stage: "משפחה", theme: "מסורות" },
    { stage: "ידידות", theme: "נאמנות" },
    { stage: "אתגרים", theme: "כוח" },
    { stage: "גדילה", theme: "חוכמה" },
    { stage: "תשוקות", theme: "יצירתיות" },
    { stage: "נכדים", theme: "המשך" },
    { stage: "זיכרונות", theme: "עושר" },
    { stage: "ערכים", theme: "מורשת" },
    { stage: "הכרת תודה", theme: "שפע" },
    { stage: "שמחה", theme: "חגיגה" },
    { stage: "אהבה", theme: "חיבוק" },
    { stage: "עתיד", theme: "תקווה" },
    { stage: "חיים", theme: "ברכה" },
    { stage: "סיכום", theme: "שלווה" },
    { stage: "סיום", theme: "אהבה" },
    { stage: "ברכה", theme: "עתיד" },
  ];

  // Album structure: page 1 = cover, pages 2–(N-1) = story, page N = back_cover.
  // No dedication page — story begins immediately on page 2.
  const items: AlbumOutlineItem[] = [
    {
      page_number: 1,
      life_stage: "cover",
      emotional_theme: "פתיחה",
      description: "כריכה קדמית",
      page_type: "cover",
    },
  ];

  storyStages.forEach((s, i) => {
    items.push({
      page_number: i + 2,
      life_stage: s.stage,
      emotional_theme: s.theme,
      description: `${s.stage} — ${s.theme}`,
      page_type: i % 6 === 5 ? "text_only" : "illustration_and_text",
    });
  });

  items.push({
    page_number: 40,
    life_stage: "back_cover",
    emotional_theme: "סיום",
    description: "כריכה אחורית",
    page_type: "back_cover",
  });

  return items;
}
