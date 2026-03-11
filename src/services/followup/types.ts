import type { QuestionnaireResponses, FollowUpQA } from "@/types/questionnaire";
import type { GenerationSettings } from "@/types/page";

export interface FollowUpInput {
  questionnaire: Partial<QuestionnaireResponses>;
  personName: string;
  personGender: "male" | "female";
  language: "he" | "en";
  /** Resolved generation settings. Null means no settings found — provider must use defaults. */
  settings: GenerationSettings | null;
}

export interface FollowUpOutput {
  /** 3-5 follow-up questions with empty answer strings (answers filled in later). */
  questions: FollowUpQA[];
  modelUsed: string;
  settingsId: string | null;
}

export interface FollowUpProvider {
  generateQuestions(input: FollowUpInput): Promise<FollowUpOutput>;
}
