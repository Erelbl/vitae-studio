import type {
  StoryGenerationProvider,
  StoryGenerationInput,
  StoryGenerationOutput,
} from "./types";
import { buildStoryProfile } from "./story-profile-builder";
import { generateAlbumOutline } from "./outline-generator";
import { generatePageTexts } from "./page-generator";
import { reviewAndFixStory } from "./story-review";

/**
 * Claude implementation of StoryGenerationProvider.
 * Orchestrates the full modular pipeline:
 *   buildStoryProfile → generateAlbumOutline → generatePageTexts → reviewAndFixStory
 */
export class ClaudeStoryProvider implements StoryGenerationProvider {
  async generateFullStory(
    input: StoryGenerationInput
  ): Promise<StoryGenerationOutput> {
    const profile = buildStoryProfile(
      input.questionnaire as Record<string, string>,
      [],
      input.personName,
      input.personGender
    );

    const outline = await generateAlbumOutline(profile, null);
    const pages = await generatePageTexts(profile, outline, null);
    const { pages: reviewed } = await reviewAndFixStory(pages, null);

    return {
      pages: reviewed.map((p) => ({
        pageNumber: p.page_number,
        text: p.text_content,
      })),
      modelUsed: "claude-sonnet-4-6",
      tokensUsed: 0,
    };
  }

  async regeneratePageText(
    input: StoryGenerationInput,
    pageNumber: number,
    existingStory: { pageNumber: number; text: string }[]
  ): Promise<{ text: string; modelUsed: string }> {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const context = existingStory
      .filter((p) => Math.abs(p.pageNumber - pageNumber) <= 2)
      .map((p) => `עמוד ${p.pageNumber}: ${p.text}`)
      .join("\n---\n");

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      temperature: 0.9,
      system:
        "אתה משורר עברי. כתוב 2–4 שורות שירה חמה ומחורזת לעמוד האלבום המבוקש. החזר רק את הטקסט.",
      messages: [
        {
          role: "user",
          content: `עבור ${input.personName}, כתוב עמוד ${pageNumber}.\n\nהקשר:\n${context || "אין"}`,
        },
      ],
    });

    const text =
      message.content[0]?.type === "text"
        ? message.content[0].text.trim()
        : `[עמוד ${pageNumber}]`;

    return { text, modelUsed: "claude-sonnet-4-6" };
  }
}
