import Anthropic from "@anthropic-ai/sdk";
import type { FollowUpProvider, FollowUpInput, FollowUpOutput } from "./types";
import type { FollowUpQA } from "@/types/questionnaire";

// Haiku is sufficient for generating 3-5 targeted follow-up questions.
// Override via generation_settings.model_id for a specific order or globally.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const DEFAULT_SYSTEM_PROMPT = `אתה עוזר ליצירת ספרי חיים אישיים מחורזים בעברית.
קיבלת תשובות לשאלון ראשוני על אדם. תפקידך לזהות פערי מידע חשובים
ולנסח 3-5 שאלות המשך ממוקדות שיעשירו את הסיפור.

הנחיות:
- שאל שאלות ספציפיות שהתשובות עליהן יוסיפו צבע ועומק לסיפור
- הימנע מחזרה על מה שכבר נאמר בשאלון
- התמקד ברגעים מכוננים, פרטים חושיים, ציטוטים, קשרים אישיים
- כתוב בעברית בלבד
- החזר תשובה בפורמט JSON בלבד: {"questions": ["שאלה 1", "שאלה 2", ...]}`
;

export class ClaudeFollowUpProvider implements FollowUpProvider {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async generateQuestions(input: FollowUpInput): Promise<FollowUpOutput> {
    const { questionnaire, personName, personGender, language, settings } = input;

    const modelId = settings?.model_id ?? DEFAULT_MODEL;
    const systemPrompt = settings?.system_prompt ?? DEFAULT_SYSTEM_PROMPT;
    const temperature = settings?.temperature ?? 0.7;
    const maxTokens = settings?.max_tokens ?? 512;

    const genderLabel = personGender === "female" ? "אישה" : "גבר";
    const questionnaireText = Object.entries(questionnaire)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const userMessage = `פרטי האדם:
שם: ${personName}
מין: ${genderLabel}

תשובות לשאלון:
${questionnaireText}

נסח ${language === "he" ? "בעברית" : "באנגלית"} 3-5 שאלות המשך לעשרת הסיפור.`;

    const message = await this.client.messages.create({
      model: modelId,
      max_tokens: maxTokens,
      temperature: temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText =
      message.content[0]?.type === "text" ? message.content[0].text : "";

    const questions = parseQuestionsFromResponse(rawText);

    const followupQA: FollowUpQA[] = questions.map((q) => ({
      question: q,
      answer: "",
    }));

    return {
      questions: followupQA,
      modelUsed: modelId,
      settingsId: settings?.id ?? null,
    };
  }
}

function parseQuestionsFromResponse(raw: string): string[] {
  // Try to extract JSON array from response
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { questions?: unknown };
      if (Array.isArray(parsed.questions)) {
        return parsed.questions.filter((q): q is string => typeof q === "string").slice(0, 5);
      }
    }
  } catch {
    // Fall through to line-based parsing
  }

  // Fallback: extract numbered or bulleted lines
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/^[\s\d\.\-\*•]+/, "").trim())
    .filter((l) => l.length > 10 && l.endsWith("?"));

  return lines.slice(0, 5);
}
