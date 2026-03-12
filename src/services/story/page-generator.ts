import Anthropic from "@anthropic-ai/sdk";
import type { StoryProfile, AlbumOutlineItem, AlbumPageText } from "./types";
import type { GenerationSettings } from "@/types/page";

const DEFAULT_MODEL = "claude-sonnet-4-6";

const DEFAULT_SYSTEM_PROMPT = `אתה משורר עברי המתמחה ביצירת אלבומי חיים אישיים ומחורזים.

## כלל ראשון: פרסונליזציה היא המטרה
כל עמוד שיש לו נתונים ספציפיים בפרופיל — חייב לכלול פרטים אמיתיים מהחיים (שמות, עיר, מקצוע, שמות בני משפחה, אנקדוטה ספציפית).
שיר גנרי שיכול להתאים לכל אדם הוא כישלון. המטרה היא שהאדם יקרא ויכיר את עצמו.
כשיש פרט ספציפי בגיליון העובדות — השתמש בו. עדיף לציין שם עיר, שם קרוב, או מאפיין אישי ממשי.
פרט קונקרטי תמיד עדיף על שבח גנרי.

## כלל שני: דיוק
אל תמציא עובדות שאינן בגיליון העובדות.
אם אין מידע על שלב חיים מסוים — כתוב 2 שורות חמות וכלליות לאותו שלב. אל תמלא ב-4 שורות ריקות.
אם יש ציטוט או אמרה אופיינית בפרופיל — שקול לשלב אותה ישירות.

## כלל שלישי: מבנה עמוד
כל עמוד חייב להכיל בדיוק 2 שורות או בדיוק 4 שורות. אסור לכתוב 3 שורות.
אם החומר מצומצם — כתוב 2 שורות משמעותיות. אל תמתח ל-4 שורות עם מילוי.

## כלל רביעי: חריזה בעברית
לפני כתיבת השורות — החלט תחילה על מילת החרוז.
אז בנה את המשפט כך שמילת החרוז תגיע בסוף השורה בצורה טבעית.
אל תכתוב את המשפט קודם ואז תנסה לכפות חרוז בסוף.

מבני חריזה מועדפים: AABB או ABAB.
חרוז טוב בעברית: שיתוף של ההברה האחרונה המלאה (לא רק האות האחרונה).
דוגמאות לחרוז טוב: לב / קרוב / אוהב / שוב
חרוז חלש (להימנע): מילים שחולקות רק אות אחת אחרונה.
אם חרוז מכריח משפט מאולץ — עדיף משמעות וחמימות על פני חרוז.

## כלל חמישי: סגנון כתיבה
עברית טבעית, חמה ואישית — כמו אלבום חיים אמיתי.
אל תשתמש במקפים ארוכים (—) או במקפים מרובים.
העדף פסיקים, נקודות, או שבירת שורה.
אל תשתמש בשפה דרמטית מלאכותית או בביטויים פואטיים גנריים.
אורך שורה: משפטי עברית טבעיים — לא קטעים קצרצרים ולא שורות ארוכות מדי.
הימנע מחזרת ביטויים זהים בין עמודים.
כל עמוד עומד בפני עצמו אך יוצר יחד רצף רגשי אחד.

דוגמה לסגנון הרצוי:
בילדות בעיר קטנה
כבר חלם רחוק

עם לב גדול וצחוק מתגלגל
ואהבה של כל הסובבים

החזר JSON בלבד: מערך של אובייקטים עם page_number ו-text_content.`;

/**
 * Generates Hebrew rhymed text for every story page (dedication + content pages).
 * Cover and back-cover pages are excluded — they use structural text.
 * All pages are generated in a single Claude call for coherence.
 */
export async function generatePageTexts(
  profile: StoryProfile,
  outline: AlbumOutlineItem[],
  settings: GenerationSettings | null
): Promise<AlbumPageText[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const modelId = settings?.model_id ?? DEFAULT_MODEL;
  const systemPrompt = settings?.system_prompt ?? DEFAULT_SYSTEM_PROMPT;
  const temperature = settings?.temperature ?? 0.85;

  // Structural pages whose text is set elsewhere
  const textPages = outline.filter(
    (item) => item.page_type !== "cover" && item.page_type !== "back_cover"
  );

  const genderLabel = profile.person_gender === "female" ? "אישה" : "גבר";
  const toneLabel =
    profile.tone_preference === "humorous"
      ? "הומוריסטי"
      : profile.tone_preference === "emotional"
      ? "רגשי"
      : "מאוזן";

  // Build a structured fact-sheet from profile — each section labeled clearly
  const factLines: string[] = [];
  if (profile.birth_background)
    factLines.push(`• רקע ותחילת הדרך: ${profile.birth_background}`);
  if (profile.childhood_memories)
    factLines.push(`• ילדות ושורשים: ${profile.childhood_memories}`);
  if (profile.youth_adolescence)
    factLines.push(`• נעורים ומיקומים: ${profile.youth_adolescence}`);
  if (profile.career_achievements)
    factLines.push(`• מקצוע והישגים: ${profile.career_achievements}`);
  if (profile.family_relationships)
    factLines.push(`• משפחה ואהבה: ${profile.family_relationships}`);
  if (profile.personality_traits)
    factLines.push(`• אופי ותכונות: ${profile.personality_traits}`);
  if (profile.emotional_highlights)
    factLines.push(`• רגעים מיוחדים, ערכים וברכה:\n${profile.emotional_highlights}`);

  const factSheet = factLines.length > 0
    ? factLines.join("\n\n")
    : null;

  // Warn if profile is very thin — admin should see this in server logs
  const hasRichProfile = factLines.length >= 3;
  if (!hasRichProfile) {
    console.warn(
      `[page-generator] Thin profile for subject "${profile.subject_name}": ` +
        `only ${factLines.length} non-empty sections. Story will be generic.`
    );
  }

  const outlineText = textPages
    .map(
      (item) =>
        `עמוד ${item.page_number} (${item.page_type}): ${item.life_stage} — ${item.description} [נושא: ${item.emotional_theme}]`
    )
    .join("\n");

  const pageNumbers = textPages.map((p) => p.page_number).join(", ");

  const factSheetBlock = factSheet
    ? factSheet
    : "⚠️ השאלון לא מולא — כתוב שירה חמה וכללית בלבד (אין פרטים אישיים זמינים)";

  const userMessage = `כתוב שירה עברית מחורזת ואישית עבור האלבום של ${profile.subject_name} (${genderLabel}).
סוג האלבום: ${profile.occasion_context}
טון מבוקש: ${toneLabel}

━━━ גיליון עובדות — השתמש בפרטים אלה בשיר ━━━
${factSheetBlock}

━━━ תוכנית עמודים ━━━
${outlineText}

━━━ הוראות ━━━
כתוב בדיוק ${textPages.length} עמודים: ${pageNumbers}

חוק מספר שורות — חשוב מאוד:
כל עמוד חייב להכיל בדיוק 2 שורות או בדיוק 4 שורות.
3 שורות אסורות לחלוטין.
אם החומר מצומצם — כתוב 2 שורות טובות. אל תמתח ל-4 שורות עם מילוי.

חוק ניסוח:
אל תשתמש במקפים ארוכים (—) בתוך השורות.
העדף פסיקים או שבירת שורה.

תכנון חרוז:
לפני כל עמוד — החלט תחילה מה מילת החרוז, ואז בנה את השורות סביבה.

לכל עמוד תוכן — חפש בגיליון העובדות פרטים הקשורים לשלב החיים שלו:
  • עמוד על ילדות → הזכר עיר ילדות / שמות הורים / אחים / זיכרון ספציפי מהגיליון
  • עמוד על נעורים/צבא/לימודים → הזכר מקומות / חוויה ספציפית מהגיליון
  • עמוד על קריירה → הזכר מקצוע / תכונות בעבודה / הישג ספציפי מהגיליון
  • עמוד על משפחה/זוגיות → הזכר שם בן/בת הזוג / שמות ילדים / סיפור הפגישה מהגיליון
  • עמוד על אופי → הזכר תכונה בולטת / תחביב / אמרה אופיינית מהגיליון
  • עמוד על ערכים/ברכה → השתמש ישירות ב-"ערכים", "גאוות גדולה", "איחול" מהגיליון

עמוד 2 (הקדשה): פנייה ישירה אל ${profile.subject_name}, הזכרת האירוע (${profile.occasion_context}), חיבוק חמה.
לא להמציא עובדות שאינן בגיליון.
שיר גנרי שיכול להתאים לכל אדם אינו מקובל. כל עמוד חייב לשקף את ${profile.subject_name} ספציפית.

פורמט תשובה — JSON בלבד:
[
  {
    "page_number": 2,
    "text_content": "שורה ראשונה\\nשורה שנייה"
  },
  ...
]`;

  console.log(`[DIAG][page-generator] sending to Claude: model=${modelId} temp=${temperature} userMessage=${userMessage.length} chars factSheet=${factSheetBlock.slice(0, 120)}`);

  const message = await client.messages.create({
    model: modelId,
    max_tokens: 8000,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText =
    message.content[0]?.type === "text" ? message.content[0].text : "";

  console.log(`[DIAG][page-generator] Claude response: stop_reason=${message.stop_reason} rawText=${rawText.length} chars rawTextStart=${rawText.slice(0, 80)}`);

  const parsedPages = parsePageTexts(rawText);
  console.log(`[DIAG][page-generator] parsedPages: ${parsedPages.length} pages parsed from Claude response`);

  // Merge with outline: every text page must have an entry
  return textPages.map((item) => {
    const generated = parsedPages.find((p) => p.page_number === item.page_number);
    return {
      page_number: item.page_number,
      text_content:
        generated?.text_content?.trim() ||
        buildPlaceholder(item.page_number, item.life_stage),
      page_type: item.page_type,
    };
  });
}

function parsePageTexts(
  raw: string
): { page_number: number; text_content: string }[] {
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as unknown[];
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (item): item is Record<string, unknown> =>
              typeof item === "object" && item !== null
          )
          .map((item) => ({
            page_number: Number(item.page_number),
            text_content: String(item.text_content ?? "").trim(),
          }))
          .filter((item) => item.page_number > 0 && item.text_content.length > 0);
      }
    }
  } catch {
    // fall through
  }
  return [];
}

function buildPlaceholder(pageNumber: number, lifeStage: string): string {
  // Prefixed with ⚠️ so admins can instantly spot un-generated pages in the draft-text view
  console.warn(`[page-generator] Placeholder used for page ${pageNumber} (${lifeStage}) — Claude did not return text for this page`);
  return `⚠️ [עמוד ${pageNumber} — ${lifeStage}]\nהטקסט לא נוצר. יש להפעיל מחדש את יצירת הסיפור.`;
}
