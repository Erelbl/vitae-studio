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

// ─── Modular pipeline types ────────────────────────────────────────────────

export interface StoryProfile {
  subject_name: string;
  person_gender: "male" | "female";
  birth_background: string;
  childhood_memories: string;
  youth_adolescence: string;
  career_achievements: string;
  family_relationships: string;
  personality_traits: string;
  emotional_highlights: string;
  tone_preference: string;
  key_anecdotes: string;
}

export type AlbumPageType =
  | "cover"
  | "dedication"
  | "illustration_and_text"
  | "text_only"
  | "back_cover";

export interface AlbumOutlineItem {
  page_number: number;
  life_stage: string;
  emotional_theme: string;
  description: string;
  page_type: AlbumPageType;
}

export interface AlbumPageText {
  page_number: number;
  text_content: string;
  page_type: AlbumPageType;
}
