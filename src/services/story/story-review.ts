import Anthropic from "@anthropic-ai/sdk";
import type { AlbumPageText } from "./types";
import type { GenerationSettings } from "@/types/page";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface PageIssue {
  page_number: number;
  issue: string;
}

export interface ReviewResult {
  issues: PageIssue[];
  regenerated_count: number;
}

/**
 * Analyzes the generated album pages for quality issues and regenerates
 * only the problematic ones. Non-fatal: original page is kept on any error.
 */
export async function reviewAndFixStory(
  pages: AlbumPageText[],
  settings: GenerationSettings | null
): Promise<{ pages: AlbumPageText[]; review: ReviewResult }> {
  const issues = detectIssues(pages);

  if (issues.length === 0) {
    return { pages, review: { issues: [], regenerated_count: 0 } };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const modelId = settings?.model_id ?? DEFAULT_MODEL;

  const fixedPages = [...pages];
  let regenerated_count = 0;

  for (const issue of issues) {
    const pageIndex = fixedPages.findIndex(
      (p) => p.page_number === issue.page_number
    );
    if (pageIndex === -1) continue;

    const page = fixedPages[pageIndex];
    if (page.text_content == null) continue;

    // Provide 2 pages of context before the problem page
    const context = fixedPages
      .slice(Math.max(0, pageIndex - 2), pageIndex)
      .map((p) => p.text_content ?? "")
      .join("\n---\n");

    try {
      const message = await client.messages.create({
        model: modelId,
        max_tokens: 300,
        temperature: 0.9,
        system: `אתה משורר עברי. תקן את הבית הבא שיש בו בעיה: "${issue.issue}".
כתוב 2–4 שורות בעברית חמה ומחורזת.
אל תשתמש במקפים ארוכים (—) — העדף פסיקים או שבירת שורה.
החזר רק את הטקסט המתוקן — ללא הסברים.`,
        messages: [
          {
            role: "user",
            content: `הקשר (עמודים קודמים):\n${context || "אין"}\n\nעמוד לתיקון:\n${page.text_content ?? ""}\n\nכתוב גרסה משופרת:`,
          },
        ],
      });

      const newText =
        message.content[0]?.type === "text"
          ? message.content[0].text.trim()
          : "";

      // Accept only if we got at least 2 lines
      if (newText && newText.split("\n").filter((l) => l.trim()).length >= 2) {
        fixedPages[pageIndex] = { ...page, text_content: newText };
        regenerated_count++;
      }
    } catch {
      // Non-fatal: keep original
    }
  }

  return {
    pages: fixedPages,
    review: { issues, regenerated_count },
  };
}

function detectIssues(pages: AlbumPageText[]): PageIssue[] {
  const issues: PageIssue[] = [];

  // Track 5-word phrases across all pages to catch repetition
  const phraseToPage = new Map<string, number>();

  for (const page of pages) {
    // Illustration-only pages have no text — skip quality checks
    if (page.text_content == null) continue;

    const lines = page.text_content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // Too few lines
    if (lines.length < 2) {
      issues.push({
        page_number: page.page_number,
        issue: "פחות משתי שורות — יש להוסיף שורות",
      });
      continue;
    }

    // Too short overall
    if (page.text_content.replace(/\s/g, "").length < 15) {
      issues.push({
        page_number: page.page_number,
        issue: "טקסט קצר מדי",
      });
      continue;
    }

    // Detect repeated 5-word phrases
    const words = page.text_content.split(/\s+/);
    let foundRepeat = false;
    for (let i = 0; i <= words.length - 5 && !foundRepeat; i++) {
      const phrase = words.slice(i, i + 5).join(" ");
      const seenOn = phraseToPage.get(phrase);
      if (seenOn !== undefined && seenOn !== page.page_number) {
        issues.push({
          page_number: page.page_number,
          issue: `ביטוי חוזר מעמוד ${seenOn}: "${phrase}"`,
        });
        foundRepeat = true;
      } else if (seenOn === undefined) {
        phraseToPage.set(phrase, page.page_number);
      }
    }
  }

  return issues;
}
