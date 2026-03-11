import type { IllustrationProvider } from "./types";

export type { IllustrationInput, IllustrationOutput, IllustrationProvider } from "./types";

export function getIllustrationProvider(): IllustrationProvider {
  const provider = process.env.ILLUSTRATION_PROVIDER || "gemini";
  switch (provider) {
    case "gemini": {
      const { GeminiIllustrationProvider } = require("./gemini-provider");
      return new GeminiIllustrationProvider();
    }
    default:
      throw new Error(`Unknown illustration provider: ${provider}`);
  }
}
