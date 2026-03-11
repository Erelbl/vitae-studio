import type { StoryGenerationProvider } from "./types";

export type { StoryGenerationInput, StoryGenerationOutput, StoryGenerationProvider } from "./types";

export function getStoryProvider(): StoryGenerationProvider {
  const provider = process.env.STORY_PROVIDER || "claude";
  switch (provider) {
    case "claude": {
      const { ClaudeStoryProvider } = require("./claude-provider");
      return new ClaudeStoryProvider();
    }
    default:
      throw new Error(`Unknown story provider: ${provider}`);
  }
}
