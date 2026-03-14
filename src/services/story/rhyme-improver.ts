import Anthropic from "@anthropic-ai/sdk";
import type { StoryProfile, AlbumPageType } from "./types";
import type { GenerationSettings } from "@/types/page";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface PageForImprovement {
  page_number: number;
  text_content: string | null;
  page_type: string;
}

/**
 * Takes the current story pages and returns improved versions with better
 * Hebrew rhymes and more natural language flow.
 *
 * Rules:
 * - Preserves story structure, chronology, and all specific facts
 * - Does NOT invent new information
 * - Improves weak/forced rhymes by choosing better rhyme words
 * - Improves unnatural or robotic phrasing
 * - Keeps the same emotional tone
 * - Returns the same number of pages; cover/back_cover are passed through unchanged
 */
export async function improveStoryRhyme(
  pages: PageForImprovement[],
  profile: StoryProfile,
  settings: GenerationSettings | null
): Promise<PageForImprovement[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const modelId = settings?.model_id ?? DEFAULT_MODEL;

  const textPages = pages.filter(
    (p) =>
      p.text_content &&
      p.text_content.trim().length > 0 &&
      p.page_type !== "cover" &&
      p.page_type !== "back_cover"
  );

  if (textPages.length === 0) return pages;

  // Serialize current story as JSON input
  const currentStoryJson = JSON.stringify(
    textPages.map((p) => ({
      page_number: p.page_number,
      page_type: p.page_type,
      text_content: p.text_content,
    })),
    null,
    2
  );

  const systemPrompt = `אתה עורך שירה עברית בכיר המתמחה בשיפור חרוזים ואיכות לשונית.
תפקידך לשפר את הסיפור הנתון — לא לכתוב סיפור חדש.

כללים מוחלטים:
• שמור בדיוק על אותן עובדות — שמות, מקומות, מקצוע, אירועים
• אל תמציא שום פרט חדש שאינו בטקסט המקורי
• אל תשנה את הסדר הכרונולוגי של הסיפור
• שמור על מספר עמודים זהה — אל תמחק עמודים ואל תוסיף
• מספר שורות לעמוד: 2–6 (כמו במקור, אלא אם הוספת/הסרת שורה משפרת את החרוז)
• שמור על הטון הרגשי המקורי — אל תהפוך לגנרי
• אל תשתמש במקפים ארוכים (—) או במקפים כפולים. העדף פסיקים, נקודות, או שבירת שורה.

מה לשפר:
• חרוזים חלשים: בחר מילות חרוז טובות יותר שנשמעות טבעיות בקריאה בקול
• ניסוח מאולץ: שפר משפטים שנשמעים רובוטיים או מלאכותיים
• מילות מילוי ריקות: החלף במילים עם משמעות ותוכן
• חזרות: הימנע מחזרת אותם ביטויים בין עמודים שונים
• מקפים ארוכים (—): הסר אותם והחלף בפסיק או בשבירת שורה

עמודים שהחרוזים והניסוח שלהם כבר טובים — החזר כמות שהם.
אל תשפר לשמע שיפור — רק אם יש שיפור ממשי.

החזר JSON בלבד.`;

  const userMessage = `שפר את החרוזים ואיכות העברית בסיפור הבא עבור ${profile.subject_name}.

━━━ הסיפור הנוכחי (JSON) ━━━
${currentStoryJson}

━━━ תהליך העבודה ━━━
שלב א׳ — סרוק: עבור על כל עמוד וסמן לעצמך:
  • אילו חרוזים חלשים, מאולצים, או לא נשמעים טבעיים בעברית
  • אילו משפטים נשמעים רובוטיים או גנריים

שלב ב׳ — שפר: לכל עמוד עם בעיות — כתב מחדש תוך:
  • בחירת מילת חרוז טובה יותר לפני כתיבת השורה
  • שמירה מלאה על העובדות המקוריות
  • שיפור הניסוח תוך שמירה על המשמעות

שלב ג׳ — בדוק: וודא שכל החרוזים נשמעים טבעיים בקריאה בקול עברית.

━━━ פורמט תשובה — JSON בלבד ━━━
[
  {
    "page_number": <מספר>,
    "page_type": "<סוג>",
    "text_content": "<טקסט משופר>"
  },
  ...
]

חשוב: החזר את כל העמודים שקיבלת (כולל אלה שלא שינית).`;

  try {
    const message = await client.messages.create({
      model: modelId,
      max_tokens: 8000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText =
      message.content[0]?.type === "text" ? message.content[0].text : "";
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as unknown[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Build a map of improved pages by page_number
        const improvedMap = new Map<
          number,
          { text_content: string | null; page_type: string }
        >();

        for (const item of parsed) {
          if (typeof item === "object" && item !== null) {
            const rec = item as Record<string, unknown>;
            const pageNum = Number(rec.page_number);
            if (pageNum > 0) {
              improvedMap.set(pageNum, {
                text_content: rec.text_content
                  ? String(rec.text_content)
                  : null,
                page_type: String(rec.page_type ?? "illustration_and_text"),
              });
            }
          }
        }

        console.log(
          `[rhyme-improver] Received ${improvedMap.size} improved pages from Claude`
        );

        // Merge: use improved text where available, fall back to original
        return pages.map((p) => {
          const improved = improvedMap.get(p.page_number);
          if (improved) {
            return {
              ...p,
              text_content: improved.text_content,
              page_type: (improved.page_type as AlbumPageType) ?? p.page_type,
            };
          }
          return p;
        });
      }
    }
  } catch (err) {
    console.error("[rhyme-improver] Improvement call failed:", err);
  }

  // Fall back to originals if Claude call or parsing fails
  console.warn("[rhyme-improver] Returning original pages (improvement failed)");
  return pages;
}
