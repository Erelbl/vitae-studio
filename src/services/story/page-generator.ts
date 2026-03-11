import Anthropic from "@anthropic-ai/sdk";
import type { StoryProfile, AlbumOutlineItem, AlbumPageText } from "./types";
import type { GenerationSettings } from "@/types/page";

const DEFAULT_MODEL = "claude-sonnet-4-6";

const DEFAULT_SYSTEM_PROMPT = `אתה משורר עברי המתמחה ביצירת ספרי חיים מחורזים לאוכלוסייה הרחבה.
עבור כל עמוד, כתוב 2–4 שורות שירה עברית רגשית ואישית.

כללי כתיבה:
- בדיוק 2–4 שורות לכל עמוד
- חריזה ברורה (לפחות השורה האחרונה חורזת עם אחת מקודמותיה)
- עברית טבעית, חמה ונגישה — לא ארכאית ולא פשטנית
- הימנע מחרוז מאולץ: עדיף חרוז חלקי טבעי על פני חרוז מלאכותי
- אל תמציא עובדות שאינן בפרופיל
- הימנע מחזרת ביטויים זהים בין עמודים
- טון: מתאים למה שביקש המזמין
- כל עמוד עומד בפני עצמו אך יוצר יחד רצף רגשי אחד

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

  const profileSections = [
    profile.birth_background && `לידה: ${profile.birth_background}`,
    profile.childhood_memories && `ילדות: ${profile.childhood_memories}`,
    profile.youth_adolescence && `נעורים: ${profile.youth_adolescence}`,
    profile.career_achievements && `קריירה: ${profile.career_achievements}`,
    profile.family_relationships && `משפחה: ${profile.family_relationships}`,
    profile.personality_traits && `אופי: ${profile.personality_traits}`,
    profile.key_anecdotes && `פרטים מיוחדים:\n${profile.key_anecdotes}`,
  ]
    .filter(Boolean)
    .join("\n");

  const outlineText = textPages
    .map(
      (item) =>
        `עמוד ${item.page_number} (${item.page_type}): ${item.life_stage} — ${item.description} [נושא: ${item.emotional_theme}]`
    )
    .join("\n");

  const pageNumbers = textPages.map((p) => p.page_number).join(", ");

  const userMessage = `כתוב שירה עברית מחורזת עבור האלבום של:
שם: ${profile.subject_name} (${genderLabel})
טון: ${toneLabel}
סוג האלבום: ${profile.occasion_context}

פרופיל האדם:
${profileSections || "אין פרטים — כתוב שירה חמה וכללית"}

תוכנית העמודים:
${outlineText}

הוראות:
- כתוב בדיוק ${textPages.length} עמודים: ${pageNumbers}
- עמוד הקדשה (2): פנייה אישית וחמה למי שמקבל את האלבום, עם התייחסות לאירוע (${profile.occasion_context})
- שאר העמודים: שירה כרונולוגית על חיי ${profile.subject_name}
- כל עמוד: 2–4 שורות, חרוז ברור, עברית טבעית
- השתמש בשמות, מקומות ופרטים ספציפיים מהפרופיל בכל מקום שניתן
- אל תמציא עובדות שאינן בפרופיל

פורמט תשובה — JSON בלבד:
[
  {
    "page_number": 2,
    "text_content": "שורה ראשונה\\nשורה שנייה\\nשורה שלישית"
  },
  ...
]`;

  const message = await client.messages.create({
    model: modelId,
    max_tokens: 8000,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText =
    message.content[0]?.type === "text" ? message.content[0].text : "";

  const parsedPages = parsePageTexts(rawText);

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
  return `כאן יופיע שיר על ${lifeStage}.\nעמוד ${pageNumber} בסיפור חייך.`;
}
