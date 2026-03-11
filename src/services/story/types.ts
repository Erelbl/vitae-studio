export interface StoryGenerationInput {
  questionnaire: Record<string, string>;
  personName: string;
  personGender: "male" | "female";
  language: "he" | "en";
  totalPages: number;
  photoDescriptions: {
    pageNumber: number;
    caption?: string;
    lifeStage: string;
  }[];
}

export interface StoryGenerationOutput {
  pages: { pageNumber: number; text: string }[];
  modelUsed: string;
  tokensUsed: number;
}

export interface StoryGenerationProvider {
  generateFullStory(
    input: StoryGenerationInput
  ): Promise<StoryGenerationOutput>;

  regeneratePageText(
    input: StoryGenerationInput,
    pageNumber: number,
    existingStory: { pageNumber: number; text: string }[]
  ): Promise<{ text: string; modelUsed: string }>;
}
