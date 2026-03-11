import { z } from "zod/v4";

// Step 1: About the Person
export const aboutPersonSchema = z.object({
  person_name: z.string().min(2, "נדרשים לפחות 2 תווים"),
  person_birth_date: z.string().min(1, "נדרש תאריך לידה"),
  person_birth_city: z.string().min(2, "נדרשים לפחות 2 תווים"),
  person_gender: z.enum(["male", "female"], {
    error: "יש לבחור מגדר",
  }),
  relationship_to_buyer: z.string().min(2, "נדרשים לפחות 2 תווים"),
});

// Step 2: Childhood
export const childhoodSchema = z.object({
  childhood_city: z.string().min(2, "נדרשים לפחות 2 תווים"),
  siblings: z.string().optional().default(""),
  childhood_memories: z.string().min(10, "נדרשים לפחות 10 תווים"),
  childhood_hobbies: z.string().optional().default(""),
});

// Step 3: Youth & Education
export const youthSchema = z.object({
  schools: z.string().optional().default(""),
  military_service: z.string().optional().default(""),
  formative_experiences: z.string().min(10, "נדרשים לפחות 10 תווים"),
});

// Step 4: Career & Life
export const careerSchema = z.object({
  profession: z.string().min(2, "נדרשים לפחות 2 תווים"),
  achievements: z.string().optional().default(""),
  passions: z.string().optional().default(""),
  defining_moments: z.string().optional().default(""),
});

// Step 5: Family
export const familySchema = z.object({
  partner: z.string().optional().default(""),
  children: z.string().optional().default(""),
  grandchildren: z.string().optional().default(""),
  family_traditions: z.string().optional().default(""),
});

// Step 6: Character & Values
export const characterSchema = z.object({
  personality_traits: z.string().min(5, "נדרשים לפחות 5 תווים"),
  favorite_sayings: z.string().optional().default(""),
  known_for: z.string().min(5, "נדרשים לפחות 5 תווים"),
});

// Step 7: Special Requests
export const specialRequestsSchema = z.object({
  dedications: z.string().optional().default(""),
  specific_events: z.string().optional().default(""),
  tone_preference: z.enum(["humorous", "emotional", "mixed"], {
    error: "יש לבחור סגנון",
  }),
});

// Step 8: Buyer Details
export const buyerDetailsSchema = z.object({
  buyer_name: z.string().min(2, "נדרשים לפחות 2 תווים"),
  buyer_email: z.email("כתובת אימייל לא תקינה"),
  buyer_phone: z.string().min(9, "מספר טלפון לא תקין"),
  occasion: z.enum(["birthday", "retirement", "memorial", "anniversary", "other"], {
    error: "יש לבחור אירוע",
  }),
});

export const STEP_SCHEMAS = [
  aboutPersonSchema,
  childhoodSchema,
  youthSchema,
  careerSchema,
  familySchema,
  characterSchema,
  specialRequestsSchema,
  buyerDetailsSchema,
] as const;

// Full questionnaire schema (union of all steps)
export const fullQuestionnaireSchema = aboutPersonSchema
  .merge(childhoodSchema)
  .merge(youthSchema)
  .merge(careerSchema)
  .merge(familySchema)
  .merge(characterSchema)
  .merge(specialRequestsSchema)
  .merge(buyerDetailsSchema);

export type FullQuestionnaire = z.infer<typeof fullQuestionnaireSchema>;
