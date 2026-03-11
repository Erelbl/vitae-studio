import { z } from "zod/v4";

export const ALBUM_TYPES = [
  "life_story_birthday",
  "wedding",
  "anniversary",
  "retirement",
  "memorial",
  "other",
] as const;

// Step 1: בואו נכיר
export const introductionSchema = z.object({
  person_name: z.string().min(2, "נדרשים לפחות 2 תווים"),
  album_type: z.enum(ALBUM_TYPES, { error: "יש לבחור סוג אלבום" }),
  one_sentence_description: z.string().min(5, "נדרשים לפחות 5 תווים"),
  person_gender: z.enum(["male", "female"], { error: "יש לבחור מגדר" }),
  nickname: z.string().optional().default(""),
  first_impression: z.string().optional().default(""),
});

// Step 2: ילדות ושורשים
export const childhoodRootsSchema = z.object({
  person_birth_city: z.string().min(2, "נדרשים לפחות 2 תווים"),
  childhood_city: z.string().min(2, "נדרשים לפחות 2 תווים"),
  siblings: z.string().min(2, "נדרשים לפחות 2 תווים"),
  childhood_memories: z.string().min(5, "נדרשים לפחות 5 תווים"),
  parent_names: z.string().optional().default(""),
  childhood_special_memory: z.string().optional().default(""),
  childhood_hobbies: z.string().optional().default(""),
});

// Step 3: תחנות משמעותיות
export const milestonesSchema = z.object({
  profession: z.string().min(2, "נדרשים לפחות 2 תווים"),
  work_characteristics: z.string().min(5, "נדרשים לפחות 5 תווים"),
  military_service: z.string().optional().default(""),
  cities_over_years: z.string().optional().default(""),
  defining_moments: z.string().optional().default(""),
});

// Step 4: אהבה ומשפחה – ALL OPTIONAL
export const familyLoveSchema = z.object({
  partner: z.string().optional().default(""),
  how_they_met: z.string().optional().default(""),
  wedding_story: z.string().optional().default(""),
  children: z.string().optional().default(""),
  parenting_style: z.string().optional().default(""),
});

// Step 5: האדם שמאחורי הסיפור
export const personalitySchema = z.object({
  personality_traits: z.string().min(5, "נדרשים לפחות 5 תווים"),
  known_for: z.string().min(5, "נדרשים לפחות 5 תווים"),
  favorite_sayings: z.string().optional().default(""),
  hobbies: z.string().optional().default(""),
  funny_detail: z.string().optional().default(""),
});

// Step 6: רגעים מיוחדים – ALL OPTIONAL
export const specialMomentsSchema = z.object({
  funny_moment: z.string().optional().default(""),
  emotional_moment: z.string().optional().default(""),
  characteristic_moment: z.string().optional().default(""),
});

// Step 7: מורשת וערכים – ALL OPTIONAL
export const legacySchema = z.object({
  important_values: z.string().optional().default(""),
  most_proud_of: z.string().optional().default(""),
  taught_children: z.string().optional().default(""),
});

// Step 8: ברכה
export const blessingSchema = z.object({
  blessing_wish: z.string().min(5, "נדרשים לפחות 5 תווים"),
  extra_description: z.string().optional().default(""),
});

// Step 9: פרטי המזמין
export const buyerDetailsSchema = z.object({
  buyer_name: z.string().min(2, "נדרשים לפחות 2 תווים"),
  relationship_to_buyer: z.string().min(2, "נדרשים לפחות 2 תווים"),
  buyer_phone: z.string().min(9, "מספר טלפון לא תקין"),
  additional_notes: z.string().optional().default(""),
});

export const STEP_SCHEMAS = [
  introductionSchema,
  childhoodRootsSchema,
  milestonesSchema,
  familyLoveSchema,
  personalitySchema,
  specialMomentsSchema,
  legacySchema,
  blessingSchema,
  buyerDetailsSchema,
] as const;

export const fullQuestionnaireSchema = introductionSchema
  .merge(childhoodRootsSchema)
  .merge(milestonesSchema)
  .merge(familyLoveSchema)
  .merge(personalitySchema)
  .merge(specialMomentsSchema)
  .merge(legacySchema)
  .merge(blessingSchema)
  .merge(buyerDetailsSchema);

export type FullQuestionnaire = z.infer<typeof fullQuestionnaireSchema>;
