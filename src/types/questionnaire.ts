export const LIFE_STAGES = [
  "baby",
  "childhood",
  "youth",
  "military",
  "career",
  "wedding",
  "family",
  "recent",
  "other",
] as const;
export type LifeStage = (typeof LIFE_STAGES)[number];

export const TONE_PREFERENCES = [
  "humorous",
  "emotional",
  "mixed",
] as const;
export type TonePreference = (typeof TONE_PREFERENCES)[number];

export const OCCASIONS = [
  "birthday",
  "retirement",
  "memorial",
  "anniversary",
  "other",
] as const;
export type Occasion = (typeof OCCASIONS)[number];

export interface QuestionnaireResponses {
  // Step 1: About the Person
  person_name: string;
  person_birth_date: string;
  person_birth_city: string;
  person_gender: "male" | "female";
  relationship_to_buyer: string;

  // Step 2: Childhood
  childhood_city: string;
  siblings: string;
  childhood_memories: string;
  childhood_hobbies: string;

  // Step 3: Youth & Education
  schools: string;
  military_service: string;
  formative_experiences: string;

  // Step 4: Career & Life
  profession: string;
  achievements: string;
  passions: string;
  defining_moments: string;

  // Step 5: Family
  partner: string;
  children: string;
  grandchildren: string;
  family_traditions: string;

  // Step 6: Character & Values
  personality_traits: string;
  favorite_sayings: string;
  known_for: string;

  // Step 7: Special Requests
  dedications: string;
  specific_events: string;
  tone_preference: TonePreference;

  // Step 8: Buyer Details
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  occasion: Occasion;
}

export interface FollowUpQA {
  question: string;
  answer: string;
}

export interface QuestionnaireResponse {
  id: string;
  order_id: string;
  created_at: string;
  updated_at: string;
  responses: Partial<QuestionnaireResponses>;
  followup_questions: FollowUpQA[];
  is_complete: boolean;
}

export interface Photo {
  id: string;
  order_id: string;
  created_at: string;
  original_storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  width: number | null;
  height: number | null;
  life_stage: LifeStage | null;
  display_order: number;
  caption: string | null;
  /** True once the client has completed the direct-to-storage upload. */
  is_uploaded: boolean;
}

export const QUESTIONNAIRE_STEPS = [
  { key: "about", label: "על האדם" },
  { key: "childhood", label: "ילדות" },
  { key: "youth", label: "נעורים והשכלה" },
  { key: "career", label: "קריירה וחיים" },
  { key: "family", label: "משפחה" },
  { key: "character", label: "אופי וערכים" },
  { key: "special", label: "בקשות מיוחדות" },
  { key: "buyer", label: "פרטי המזמין" },
] as const;
