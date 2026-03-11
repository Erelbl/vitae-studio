import type { StoryProfile } from "./types";
import type { QuestionnaireResponses, FollowUpQA } from "@/types/questionnaire";

/**
 * Converts questionnaire responses + follow-up Q&A into a structured StoryProfile
 * that downstream generators use as context for the album.
 */
export function buildStoryProfile(
  responses: Partial<QuestionnaireResponses>,
  followupQA: FollowUpQA[],
  personName: string,
  personGender: "male" | "female"
): StoryProfile {
  const answeredFollowups = followupQA.filter((qa) => qa.answer?.trim());

  const followupContext = answeredFollowups
    .map((qa) => `ש: ${qa.question}\nת: ${qa.answer}`)
    .join("\n\n");

  const birthBackground = [
    responses.person_birth_date && `תאריך לידה: ${responses.person_birth_date}`,
    responses.person_birth_city && `עיר לידה: ${responses.person_birth_city}`,
    responses.relationship_to_buyer &&
      `קשר למזמין: ${responses.relationship_to_buyer}`,
  ]
    .filter(Boolean)
    .join(". ");

  const childhoodMemories = [
    responses.childhood_city && `גדל/ה ב${responses.childhood_city}`,
    responses.siblings && `אחים ואחיות: ${responses.siblings}`,
    responses.childhood_memories,
    responses.childhood_hobbies &&
      `תחביבי ילדות: ${responses.childhood_hobbies}`,
  ]
    .filter(Boolean)
    .join(". ");

  const youthAdolescence = [
    responses.schools && `השכלה: ${responses.schools}`,
    responses.military_service &&
      `שירות צבאי: ${responses.military_service}`,
    responses.formative_experiences,
  ]
    .filter(Boolean)
    .join(". ");

  const careerAchievements = [
    responses.profession && `מקצוע: ${responses.profession}`,
    responses.achievements,
    responses.passions && `תשוקות: ${responses.passions}`,
    responses.defining_moments,
  ]
    .filter(Boolean)
    .join(". ");

  const familyRelationships = [
    responses.partner && `בן/בת זוג: ${responses.partner}`,
    responses.children && `ילדים: ${responses.children}`,
    responses.grandchildren && `נכדים: ${responses.grandchildren}`,
    responses.family_traditions &&
      `מסורות משפחתיות: ${responses.family_traditions}`,
  ]
    .filter(Boolean)
    .join(". ");

  const personalityTraits = [
    responses.personality_traits,
    responses.favorite_sayings &&
      `אמרות אהובות: ${responses.favorite_sayings}`,
    responses.known_for && `ידוע/ה בזכות: ${responses.known_for}`,
  ]
    .filter(Boolean)
    .join(". ");

  const emotionalHighlights = [
    responses.dedications,
    responses.specific_events,
    followupContext,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject_name: personName,
    person_gender: personGender,
    birth_background: birthBackground,
    childhood_memories: childhoodMemories,
    youth_adolescence: youthAdolescence,
    career_achievements: careerAchievements,
    family_relationships: familyRelationships,
    personality_traits: personalityTraits,
    emotional_highlights: emotionalHighlights,
    tone_preference: responses.tone_preference ?? "mixed",
    key_anecdotes: followupContext,
  };
}
