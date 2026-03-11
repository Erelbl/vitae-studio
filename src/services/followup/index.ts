import type { FollowUpProvider } from "./types";

export type { FollowUpInput, FollowUpOutput, FollowUpProvider } from "./types";

export function getFollowUpProvider(): FollowUpProvider {
  const provider = process.env.FOLLOWUP_PROVIDER || "claude";
  switch (provider) {
    case "claude": {
      const { ClaudeFollowUpProvider } = require("./claude-provider");
      return new ClaudeFollowUpProvider() as FollowUpProvider;
    }
    default:
      throw new Error(`Unknown follow-up provider: ${provider}`);
  }
}
