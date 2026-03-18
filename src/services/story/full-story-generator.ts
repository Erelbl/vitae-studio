import Anthropic from "@anthropic-ai/sdk";
import type { StoryProfile, AlbumPageText, AlbumPageType } from "./types";
import type { GenerationSettings } from "@/types/page";

const DEFAULT_MODEL = "claude-sonnet-4-6";

/**
 * Builds a narrative brief from the structured profile.
 * Only includes sections that have actual data — never invented.
 */
function buildNarrativeBrief(profile: StoryProfile): string {
  const parts: string[] = [
    `שם: ${profile.subject_name}`,
    `מין: ${profile.person_gender === "female" ? "אישה" : "גבר"}`,
    `סוג האלבום: ${profile.occasion_context}`,
  ];

  if (profile.birth_background)
    parts.push(`\nרקע ותחילת הדרך:\n${profile.birth_background}`);
  if (profile.childhood_memories)
    parts.push(`\nילדות ושורשים:\n${profile.childhood_memories}`);
  if (profile.youth_adolescence)
    parts.push(`\nנעורים:\n${profile.youth_adolescence}`);
  if (profile.career_achievements)
    parts.push(`\nמקצוע והישגים:\n${profile.career_achievements}`);
  if (profile.family_relationships)
    parts.push(`\nמשפחה ואהבה:\n${profile.family_relationships}`);
  if (profile.personality_traits)
    parts.push(`\nאופי ותכונות:\n${profile.personality_traits}`);
  if (profile.emotional_highlights)
    parts.push(`\nרגעים מיוחדים, ערכים וברכה:\n${profile.emotional_highlights}`);

  return parts.join("\n");
}

const FULL_STORY_SYSTEM_PROMPT = `אתה סופר ומשורר עברי המתמחה בסיפורי חיים מחורזים.
תפקידך: לכתוב סיפור חיים שלם, רציף ומחורז בעברית — כמו סיפור מסופר בקצב שירי.

## תכנון חריזה
לפני כל בית — בחר תחילה משפחת חרוז (כגון: -ים, -ות, -ון, -ה, -יים, -עת, -אר).
כתוב את שורות הבית כך שמילות הסיום יגיעו בצורה טבעית מאותה משפחה.
אל תכתוב שורות קודם ואז תנסה לכפות חרוז — בנה את המשפט סביב מילת החרוז.
חרוז פונטי עברי עדיף — שיתוף הגייה בסוף המילה, לא רק אות אחרונה זהה.
חרוז רך וטבעי עדיף על חרוז מאולץ שמחליש את המשפט.
אסור להשתמש בחרוזים גנריים (כגון: עץ/לץ, חיים/מים, שם/גם).

## סגנון
כתוב כסיפור חיים מסופר — לא כרשימת שירים נפרדים.
שמור על קצב ורציפות לאורך כל הסיפור.
עברית טבעית וחמה — לא שפה פואטית מלאכותית.
אל תשתמש במקפים ארוכים (—).
אל תחזור על ביטויים ושבחים גנריים.
אל תמציא עובדות שאינן בתדריך.
אל תמציא ילדים, בן/בת זוג, הישגים, או קרובי משפחה שאינם מוזכרים בתדריך.

## מבנה
כל "בית" = 2 שורות בדיוק או 4 שורות בדיוק. 3 שורות אסורות לחלוטין.
בין הבתים — שורה ריקה.
פתח בלידה/ילדות, המשך כרונולוגית, סיים בברכה.
כתוב בגוף שלישי.

## פורמט
טקסט רץ בלבד — ללא כותרות, ללא מספרי עמוד, ללא הסברים.`;

/**
 * STEP 2: Generates a complete rhymed Hebrew life story as continuous narrative.
 * The story is not split into pages — that happens in splitStoryIntoPages.
 */
export async function generateFullStory(
  profile: StoryProfile,
  totalContentPages: number,
  settings: GenerationSettings | null
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const modelId = settings?.model_id ?? DEFAULT_MODEL;
  const temperature = settings?.temperature ?? 0.85;

  const brief = buildNarrativeBrief(profile);
  const toneLabel =
    profile.tone_preference === "humorous"
      ? "הומוריסטי"
      : profile.tone_preference === "emotional"
      ? "רגשי"
      : "מאוזן";

  const userMessage = `כתוב סיפור חיים שלם ומחורז עבור:
${brief}

טון מבוקש: ${toneLabel}

הנחיות:
- בתים של 2 או 4 שורות, שורה ריקה ביניהם (לא 3 שורות לעולם)
- לפני כל בית — בחר משפחת חרוז ואז כתוב את השורות סביבה
- הסיפור צריך להכיל כ-${totalContentPages} בתים לאלבום`;

  console.log(
    `[full-story-generator] generating full story for "${profile.subject_name}" model=${modelId} target=${totalContentPages} stanzas`
  );

  const message = await client.messages.create({
    model: modelId,
    max_tokens: 8000,
    temperature,
    system: FULL_STORY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text =
    message.content[0]?.type === "text" ? message.content[0].text.trim() : "";

  console.log(
    `[full-story-generator] generated story: ${text.length} chars, stop_reason=${message.stop_reason}`
  );

  if (!text) {
    throw new Error("generateFullStory: Claude returned empty response");
  }

  return text;
}

const SPLIT_SYSTEM_PROMPT = `אתה עורך אלבום חיים. קיבלת סיפור חיים שלם מחורז.
תפקידך: לפצל את הסיפור לעמודי אלבום.

כללי פיצול:
- כל עמוד תוכן: 2 שורות בדיוק או 4 שורות בדיוק. 3 שורות אסורות לחלוטין.
- עדיף 4 שורות כשהחומר מאפשר.
- כל עמוד חייב להרגיש כיחידה טבעית — אל תחבר שורות מבתים שאינם שייכים יחד.
- מקסימום 3 עמודי איור בלבד (page_type: "illustration", text_content: null).
- עמודי איור לא יופיעו ברצף אחד אחרי השני.
- עמוד 2 = הקדשה: פנייה ישירה אל הגיבור/ה בלשון "אתה/את" — 2 עד 4 שורות.

פורמט תשובה — JSON בלבד, ללא הסברים:
[{ "page_number": 2, "page_type": "text", "text_content": "שורה\\nשורה" }, ...]`;

/**
 * STEP 3: Splits the full story into album pages.
 * Returns pages 2 through totalPages-1 (cover and back-cover are added by the pipeline).
 * Each page has 2 or 4 lines. Illustration-only pages have text_content = null.
 */
export async function splitStoryIntoPages(
  fullStory: string,
  profile: StoryProfile,
  totalPages: number,
  settings: GenerationSettings | null
): Promise<AlbumPageText[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const modelId = settings?.model_id ?? DEFAULT_MODEL;

  const contentPages = totalPages - 2; // exclude cover (page 1) and back-cover (page totalPages)

  const userMessage = `פצל את הסיפור הבא ל-${contentPages} עמודי תוכן (עמודים 2 עד ${totalPages - 1}).

שם הגיבור/ה: ${profile.subject_name}
מין: ${profile.person_gender === "female" ? "אישה" : "גבר"}
סוג האלבום: ${profile.occasion_context}

הסיפור:
${fullStory}

הנחיות:
- עמוד 2 = הקדשה (פנייה ישירה)
- עמודים 3–${totalPages - 1} = עמודי תוכן
- כל עמוד: 2 או 4 שורות בדיוק (לא 3 לעולם)
- עד 3 עמודי איור בלבד (page_type: "illustration", text_content: null), לא ברצף
- אל תמציא תוכן — השתמש רק בטקסט שניתן

פורמט JSON בלבד:
[{ "page_number": 2, "page_type": "text", "text_content": "..." }, ...]`;

  console.log(
    `[full-story-generator] splitting into ${contentPages} pages model=${modelId}`
  );

  const message = await client.messages.create({
    model: modelId,
    max_tokens: 8000,
    temperature: 0.3,
    system: SPLIT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText =
    message.content[0]?.type === "text" ? message.content[0].text : "";

  console.log(
    `[full-story-generator] split response: ${rawText.length} chars, entries=${(rawText.match(/"page_number"/g) ?? []).length}`
  );

  return parsePageSplit(rawText, totalPages);
}

function parsePageSplit(raw: string, totalPages: number): AlbumPageText[] {
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
          .map((item) => {
            const pageNum = Number(item.page_number);
            const isIllustration = item.page_type === "illustration";
            // All content pages (2 onward) are illustration_and_text.
            // Dedication pages are no longer part of the album structure.
            const pageType: AlbumPageType = "illustration_and_text";

            return {
              page_number: pageNum,
              page_type: pageType,
              text_content: isIllustration
                ? null
                : item.text_content != null
                ? String(item.text_content).trim()
                : null,
            };
          })
          .filter(
            (item) =>
              item.page_number >= 2 && item.page_number <= totalPages - 1
          );
      }
    }
  } catch {
    // fall through
  }
  return [];
}
