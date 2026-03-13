import Anthropic from "@anthropic-ai/sdk";

export interface RhymeEvaluation {
  rhyme_score: number;
  hebrew_flow_score: number;
  overall_story_score: number;
  evaluation_notes: string;
  evaluated_at: string;
}

const EVAL_SYSTEM_PROMPT = `אתה מומחה לשירה עברית ולאיכות לשונית. תפקידך לבחון טקסט שיר עברי ולהעריך אותו בצורה מקצועית וישרה.
החזר JSON בלבד — ללא הסברים נוספים.`;

/**
 * Evaluates the rhyme quality and Hebrew language quality of a generated story.
 * Runs after generation or after a rhyme-improvement pass.
 * Returns scores 1–10 and short evaluator notes in Hebrew.
 * Non-fatal: returns zero scores on any failure.
 */
export async function evaluateStoryRhyme(
  pages: { page_number: number; text_content: string | null; page_type: string }[]
): Promise<RhymeEvaluation> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const textPages = pages.filter(
    (p) =>
      p.text_content &&
      p.text_content.trim().length > 0 &&
      p.page_type !== "cover" &&
      p.page_type !== "back_cover"
  );

  if (textPages.length === 0) {
    return {
      rhyme_score: 0,
      hebrew_flow_score: 0,
      overall_story_score: 0,
      evaluation_notes: "אין עמודי טקסט להערכה.",
      evaluated_at: new Date().toISOString(),
    };
  }

  // Sample up to 20 pages to keep the evaluation prompt concise
  const sample = textPages.slice(0, 20);
  const storyText = sample
    .map((p) => `[עמוד ${p.page_number}]\n${p.text_content}`)
    .join("\n\n");

  const userMessage = `הערך את איכות השירה העברית בסיפור הבא.

${storyText}

━━━ הנחיות הערכה ━━━

• ציון חריזה (rhyme_score, 1-10):
  האם החרוזים אמיתיים ועמוקים בהגייה עברית?
  האם מילות החרוז מתאימות סמנטית לתוכן המשפט?
  האם ישנם חרוזים מזויפים (חולקים אות אחת בלבד) או מאולצים?
  1 = חרוזים כמעט נעדרים / מזויפים לחלוטין
  10 = חרוזים עמוקים, טבעיים, מתאימים סמנטית

• ציון עברית / זרימה (hebrew_flow_score, 1-10):
  האם העברית טבעית ומודרנית?
  האם הניסוח זורם לקריאה בקול?
  האם ישנם ביטויים רובוטיים, מלאכותיים, או חזרות מייגעות?
  1 = רובוטי ומאולץ לחלוטין
  10 = עברית יפה, טבעית, חמה

• ציון כללי (overall_story_score, 1-10):
  כמה הסיפור מרגש, אישי וזורם כנרטיב שלם?
  האם יש הרגשה שמדובר באדם אמיתי וספציפי?
  1 = גנרי ומשעמם
  10 = מרגש, אישי, ייחודי

• הערות (evaluation_notes):
  כתוב 2-4 משפטים קצרים בעברית המציינים:
  - מה עובד טוב
  - אילו עמודים (אם יש) יש בהם חרוזים חלשים במיוחד
  - האם העברית נשמעת טבעית בכלל
  - המלצה קצרה לשיפור (אם נדרש)

החזר JSON בלבד:
{
  "rhyme_score": <1-10>,
  "hebrew_flow_score": <1-10>,
  "overall_story_score": <1-10>,
  "evaluation_notes": "<הערות קצרות בעברית>"
}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      temperature: 0.2,
      system: EVAL_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText =
      message.content[0]?.type === "text" ? message.content[0].text : "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        rhyme_score: clamp(Number(parsed.rhyme_score) || 0),
        hebrew_flow_score: clamp(Number(parsed.hebrew_flow_score) || 0),
        overall_story_score: clamp(Number(parsed.overall_story_score) || 0),
        evaluation_notes: String(parsed.evaluation_notes ?? ""),
        evaluated_at: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error("[rhyme-evaluator] Evaluation call failed:", err);
  }

  return {
    rhyme_score: 0,
    hebrew_flow_score: 0,
    overall_story_score: 0,
    evaluation_notes: "הערכה לא הצליחה.",
    evaluated_at: new Date().toISOString(),
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(10, Math.round(n)));
}
