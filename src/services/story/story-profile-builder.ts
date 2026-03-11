import type { StoryProfile } from "./types";
import type { QuestionnaireResponses, FollowUpQA } from "@/types/questionnaire";

const ALBUM_TYPE_LABELS: Record<string, string> = {
  life_story_birthday: "אלבום יום הולדת",
  wedding: "אלבום חתונה",
  anniversary: "אלבום יובל / זוגיות",
  retirement: "אלבום פרישה לגמלאות",
  memorial: "אלבום זיכרון",
  other: "אלבום חיים",
};

function deriveOccasionContext(
  albumType: string | undefined,
  relationship: string | undefined
): string {
  const label = ALBUM_TYPE_LABELS[albumType ?? ""] ?? "אלבום חיים";
  return relationship ? `${label} — מוגש על ידי: ${relationship}` : label;
}

function deriveTonePreference(albumType: string | undefined): string {
  if (albumType === "memorial") return "emotional";
  if (albumType === "wedding" || albumType === "anniversary") return "emotional";
  if (albumType === "retirement") return "mixed";
  return "mixed";
}

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
    responses.person_birth_city && `עיר לידה: ${responses.person_birth_city}`,
    responses.childhood_city && `גדל/ה ב: ${responses.childhood_city}`,
    responses.relationship_to_buyer &&
      `קשר למזמין: ${responses.relationship_to_buyer}`,
    responses.nickname && `כינוי: ${responses.nickname}`,
    responses.one_sentence_description,
    responses.first_impression &&
      `הדבר הראשון שאנשים שמים לב אליו: ${responses.first_impression}`,
  ]
    .filter(Boolean)
    .join(". ");

  const childhoodMemories = [
    responses.siblings && `אחים ואחיות: ${responses.siblings}`,
    responses.parent_names && `הורים: ${responses.parent_names}`,
    responses.childhood_memories,
    responses.childhood_special_memory &&
      `זיכרון מיוחד: ${responses.childhood_special_memory}`,
    responses.childhood_hobbies &&
      `תחביבי ילדות: ${responses.childhood_hobbies}`,
  ]
    .filter(Boolean)
    .join(". ");

  const youthAdolescence = [
    responses.military_service &&
      `שירות צבאי: ${responses.military_service}`,
    responses.cities_over_years &&
      `מקומות מגורים: ${responses.cities_over_years}`,
  ]
    .filter(Boolean)
    .join(". ");

  const careerAchievements = [
    responses.profession && `מקצוע: ${responses.profession}`,
    responses.work_characteristics,
    responses.defining_moments,
  ]
    .filter(Boolean)
    .join(". ");

  const familyRelationships = [
    responses.partner && `בן/בת זוג: ${responses.partner}`,
    responses.how_they_met && `איך הכירו: ${responses.how_they_met}`,
    responses.wedding_story && `סיפור חתונה: ${responses.wedding_story}`,
    responses.children && `ילדים: ${responses.children}`,
    responses.parenting_style &&
      `כהורה: ${responses.parenting_style}`,
  ]
    .filter(Boolean)
    .join(". ");

  const personalityTraits = [
    responses.personality_traits,
    responses.known_for && `הדבר הכי אופייני: ${responses.known_for}`,
    responses.favorite_sayings &&
      `משפט חוזר: ${responses.favorite_sayings}`,
    responses.hobbies && `תחביבים: ${responses.hobbies}`,
    responses.funny_detail && `פרט מצחיק: ${responses.funny_detail}`,
  ]
    .filter(Boolean)
    .join(". ");

  const emotionalHighlights = [
    responses.funny_moment && `רגע מצחיק: ${responses.funny_moment}`,
    responses.emotional_moment && `רגע מרגש: ${responses.emotional_moment}`,
    responses.characteristic_moment &&
      `רגע מאפיין: ${responses.characteristic_moment}`,
    responses.important_values && `ערכים: ${responses.important_values}`,
    responses.most_proud_of && `גאוות גדולה: ${responses.most_proud_of}`,
    responses.taught_children &&
      `מה לימד את הילדים: ${responses.taught_children}`,
    responses.blessing_wish && `איחול: ${responses.blessing_wish}`,
    responses.extra_description,
    followupContext,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject_name: personName,
    person_gender: personGender,
    album_type: responses.album_type ?? "life_story_birthday",
    occasion_context: deriveOccasionContext(
      responses.album_type,
      responses.relationship_to_buyer
    ),
    birth_background: birthBackground,
    childhood_memories: childhoodMemories,
    youth_adolescence: youthAdolescence,
    career_achievements: careerAchievements,
    family_relationships: familyRelationships,
    personality_traits: personalityTraits,
    emotional_highlights: emotionalHighlights,
    tone_preference: deriveTonePreference(responses.album_type),
    key_anecdotes: followupContext,
  };
}
