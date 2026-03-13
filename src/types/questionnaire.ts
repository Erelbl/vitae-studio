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

export const ALBUM_TYPES = [
  "life_story_birthday",
  "wedding",
  "anniversary",
  "retirement",
  "memorial",
  "other",
] as const;
export type AlbumType = (typeof ALBUM_TYPES)[number];

export const OCCASIONS = [
  "birthday",
  "retirement",
  "memorial",
  "anniversary",
  "other",
] as const;
export type Occasion = (typeof OCCASIONS)[number];

export interface QuestionnaireResponses {
  // Step 1: ספרו לנו
  person_name: string;
  album_type: AlbumType;
  person_gender: "male" | "female";
  person_birth_date: string;
  nickname: string;

  // Step 2: ילדות ושורשים
  person_birth_city: string;
  childhood_city: string;
  siblings: string;
  childhood_memories: string;
  parent_names: string;
  childhood_special_memory: string;
  childhood_hobbies: string;

  // Step 3: תחנות משמעותיות
  profession: string;
  work_characteristics: string;
  military_service: string;
  cities_over_years: string;
  defining_moments: string;

  // Step 4: אהבה ומשפחה
  partner: string;
  how_they_met: string;
  wedding_story: string;
  children: string;
  parenting_style: string;

  // Step 5: האדם שמאחורי הסיפור
  personality_traits: string;
  known_for: string;
  one_sentence_description: string;
  first_impression: string;
  favorite_sayings: string;
  hobbies: string;
  funny_detail: string;

  // Step 6: רגעים מיוחדים
  funny_moment: string;
  emotional_moment: string;
  characteristic_moment: string;

  // Step 7: מורשת וערכים
  important_values: string;
  most_proud_of: string;
  taught_children: string;

  // Step 8: ברכה
  blessing_wish: string;
  extra_description: string;

  // Step 9: פרטי המזמין
  buyer_name: string;
  relationship_to_buyer: string;
  buyer_phone: string;
  buyer_email: string;
  additional_notes: string;
  shipping_address: string;
  shipping_house_number: string;
  shipping_floor: string;
  shipping_zip: string;
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
  { key: "introduction", label: "ספרו לנו" },
  { key: "childhood_roots", label: "ילדות ושורשים" },
  { key: "milestones", label: "תחנות משמעותיות" },
  { key: "family_love", label: "אהבה ומשפחה" },
  { key: "personality", label: "האדם שמאחורי הסיפור" },
  { key: "special_moments", label: "רגעים מיוחדים" },
  { key: "legacy", label: "מורשת וערכים" },
  { key: "blessing", label: "הקדשה" },
  { key: "buyer_details", label: "פרטי המזמין" },
] as const;
