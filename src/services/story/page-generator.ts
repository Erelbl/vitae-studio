import Anthropic from "@anthropic-ai/sdk";
import type { StoryProfile, AlbumOutlineItem, AlbumPageText } from "./types";
import type { GenerationSettings } from "@/types/page";

const DEFAULT_MODEL = "claude-sonnet-4-6";

const DEFAULT_SYSTEM_PROMPT = `אתה משורר עברי המתמחה ביצירת אלבומי חיים אישיים ומחורזים.

━━━ שלב א׳: הכן את הנרטיב לפני שתכתוב ━━━
לפני כתיבת הטקסט לכל עמוד, עבור בראש שלך על כלל הסיפור כרונולוגית:
ילדות → נעורים → אירועי חיים מרכזיים → זוגיות ומשפחה → קריירה ותשוקות → הווה וחגיגה.
ציין לעצמך מה ידוע ומה לא ידוע — ואל תמציא.

━━━ שלב ב׳: בחר מבנה חרוז לכל עמוד ━━━
לפני כתיבת שורות כל עמוד — החלט על מבנה החרוז שלו: AABB, ABAB, או AAAA.
עמודים שונים יכולים להשתמש במבנים שונים לפי הצורך הנרטיבי.

━━━ שלב ג׳: כתוב תוך כדי שמירה על החרוז ━━━

## כלל ראשון: פרסונליזציה היא המטרה
כל עמוד שיש לו נתונים ספציפיים בפרופיל — חייב לכלול פרטים אמיתיים מהחיים (שמות, עיר, מקצוע, שמות בני משפחה, אנקדוטה ספציפית).
שיר גנרי שיכול להתאים לכל אדם הוא כישלון. המטרה היא שהאדם יקרא ויכיר את עצמו.
כשיש פרט ספציפי בגיליון העובדות — השתמש בו. עדיף לציין שם עיר, שם קרוב, או מאפיין אישי ממשי.
פרט קונקרטי תמיד עדיף על שבח גנרי.

## כלל שני: דיוק ולא המצאה
אל תמציא עובדות שאינן בגיליון העובדות.
אל תניח ילדים, נכדים, נישואין, או כל אירוע חיים — אם לא מוזכרים במפורש.
אם אין מידע על שלב חיים מסוים — כתוב 2 שורות חמות וכלליות. אל תמלא שורות עם מידע בדוי.
אם יש ציטוט או אמרה אופיינית בפרופיל — שקול לשלב אותה ישירות.
מותר להשאיר עמוד עם 0 שורות טקסט (ציור בלבד) — עד 3 עמודים כאלה באלבום כולו.

## כלל שלישי: מספר שורות גמיש
כל עמוד יכול להכיל 2, 3, 4, 5, או 6 שורות — בהתאם לכמות המידע הזמינה.
אם החומר מצומצם — כתוב 2 שורות משמעותיות. אל תמתח ל-4 שורות עם מילוי.
אם יש חומר עשיר — מותר עד 6 שורות.
הימנע ממספר שורות אחיד בכל עמוד — גיוון אורכי העמודים הוא סימן לכתיבה טבעית.

## כלל רביעי: חריזה חזקה בעברית
לפני כתיבת השורות — החלט תחילה על מילת החרוז. אז בנה את המשפט כך שמילת החרוז תגיע בסוף השורה בצורה טבעית.
אל תכתוב את המשפט קודם ואז תנסה לכפות חרוז בסוף.

חרוז טוב בעברית — שיתוף של ההברה האחרונה המלאה, ונשמע טבעי בקריאה בקול:
  דוגמאות לחרוז טוב: שמחה/ברכה, ימים/שירים, אהבה/תקווה, לב/קרוב/אוהב, בית/חיים/עולם
חרוז חלש או מזויף — להימנע לחלוטין:
  דוגמאות לחרוז גרוע: משחק/שולחן, חיים/עולם (כלליים מדי), מילים שחולקות רק אות אחת אחרונה

מילת החרוז חייבת:
  • להישמע טבעי בקריאה בקול עברית
  • להתאים סמנטית למשפט — לא מילת מילוי אקראית
  • להרגיש נכונה בהקשר הרגשי של העמוד

## כלל חמישי: בדיקת חרוז עצמית אחרי כל בית
לאחר כתיבת כל בית (stanza) — בדוק:
  1. האם השורות המחורזות אכן חורזות בהגייה עברית?
  2. האם מילת החרוז מתאימה למשמעות המשפט?
  3. האם החרוז מרגיש טבעי בהקשר?
אם התשובה לאחת מהשאלות היא "לא" — כתוב מחדש את הבית לפני שממשיכים.

## כלל שישי: סגנון כתיבה
עברית מודרנית טבעית, חמה ואישית — כמו ספרות ילדים מעולה או ביוגרפיה חגיגית.
אל תשתמש במקפים ארוכים (—) או במקפים מרובים — העדף פסיקים, נקודות, או שבירת שורה.
אל תשתמש בשפה דרמטית מלאכותית, בביטויים פואטיים גנריים, או בחזרות על אותם ביטויים בין עמודים.
אורך שורה: משפטי עברית טבעיים — לא קטעים קצרצרים ולא שורות ארוכות מדי.
גיוון אורך השורות ומספרן הוא סימן לכתיבה חיה ומרגשת.
כל עמוד עומד בפני עצמו אך יוצר יחד רצף רגשי אחד.

## כלל שביעי: ליטוש סופי
לפני החזרת הסיפור, בדוק:
  • החרוזים תקינים ונשמעים טבעיים
  • העברית זורמת וקריאה
  • הסיפור מרגיש רגשי ואישי
  • הטון חגיגי ומחמם לב — מתאים לאלבום חיים

דוגמה לסגנון הרצוי (4 שורות, ABAB):
בילדות בעיר קטנה, עם חלומות גדולים,
שיחק בחוצות וצחוקו מילא את האוויר.
עם לב פתוח ועיניים כמו ים של תהילים,
כל יום היה הרפתקה, וכל בוקר — אביר.

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

━━━ הוראות כתיבה ━━━
כתוב בדיוק ${textPages.length} עמודים: ${pageNumbers}

שלב א׳ — נרטיב: לפני הכתיבה, עבור בראשך על כלל הסיפור הכרונולוגי לפי הגיליון. ציין לעצמך מה ידוע ומה לא ידוע.

שלב ב׳ — חרוז: לכל עמוד — החלט תחילה על מבנה החרוז (AABB, ABAB, או AAAA) ועל מילת החרוז, לפני שכותב את השורות.

שלב ג׳ — כתיבה ובדיקה: אחרי כל בית — בדוק שהחרוז נשמע טבעי בקריאה בקול ומתאים למשמעות. אם לא — כתוב מחדש.

חוק מספר שורות:
כל עמוד יכול להכיל 2, 3, 4, 5, או 6 שורות — בהתאם לכמות המידע.
אם החומר מצומצם — כתוב 2 שורות משמעותיות. אל תמתח ל-4+ שורות עם מילוי.
מותר עד 3 עמודים ללא טקסט כלל (text_content: "") — לעמודים שאין להם מידע אישי.

חוק חרוז:
חרוז טוב: שמחה/ברכה, ימים/שירים, אהבה/תקווה — נשמע טבעי, מתאים סמנטית.
חרוז גרוע: מילים שחולקות רק אות אחת, או מילת מילוי אקראית — אסור.

חוק ניסוח:
אל תשתמש במקפים ארוכים (—) בתוך השורות. העדף פסיקים או שבירת שורה.
עברית מודרנית טבעית — לא פואטית מלאכותית.
הימנע מחזרת ביטויים זהים בין עמודים שונים.

לכל עמוד תוכן — חפש בגיליון העובדות פרטים הקשורים לשלב החיים שלו:
  • עמוד על ילדות → הזכר עיר ילדות / שמות הורים / אחים / זיכרון ספציפי מהגיליון
  • עמוד על נעורים/צבא/לימודים → הזכר מקומות / חוויה ספציפית מהגיליון
  • עמוד על קריירה → הזכר מקצוע / תכונות בעבודה / הישג ספציפי מהגיליון
  • עמוד על משפחה/זוגיות → הזכר שם בן/בת הזוג / שמות ילדים / סיפור הפגישה — רק אם מוזכרים בגיליון
  • עמוד על אופי → הזכר תכונה בולטת / תחביב / אמרה אופיינית מהגיליון
  • עמוד על ערכים/ברכה → השתמש ישירות ב-"ערכים", "גאוות גדולה", "איחול" מהגיליון

עמוד 2 (הקדשה): פנייה ישירה אל ${profile.subject_name}, הזכרת האירוע (${profile.occasion_context}), חיבוק חמה.
לא להמציא עובדות שאינן בגיליון. שיר גנרי שיכול להתאים לכל אדם אינו מקובל.

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
