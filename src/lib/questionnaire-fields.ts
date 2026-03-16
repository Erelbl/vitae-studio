/**
 * Canonical questionnaire field metadata — single source of truth for field labels.
 * Used by the read-only review screen. Labels match exactly what the step components show.
 */

export interface FieldMeta {
  key: string;
  label: string;
  /** Optional display-value map for enum fields */
  displayValues?: Record<string, string>;
}

export interface SectionMeta {
  title: string;
  fields: FieldMeta[];
}

export const QUESTIONNAIRE_SECTIONS: SectionMeta[] = [
  {
    title: "ספרו לנו",
    fields: [
      { key: "person_name", label: "שם הגיבור/ה" },
      {
        key: "album_type",
        label: "סוג האלבום",
        displayValues: {
          life_story_birthday: "סיפור חיים / יום הולדת",
          wedding: "חתונה / סיפור זוגי",
          anniversary: "יום נישואין",
          retirement: "פרישה",
          memorial: "הנצחה",
          other: "אחר",
        },
      },
      {
        key: "person_gender",
        label: "מגדר",
        displayValues: { male: "זכר", female: "נקבה" },
      },
      { key: "person_birth_date", label: "תאריך לידה" },
      { key: "nickname", label: "כינוי חיבה" },
    ],
  },
  {
    title: "ילדות ושורשים",
    fields: [
      { key: "person_birth_city", label: "איפה נולד/ה" },
      { key: "parent_names", label: "שמות ההורים" },
      { key: "childhood_city", label: "איפה גדל/ה" },
      { key: "siblings", label: "אחים ואחיות ומקום ביניהם" },
      { key: "childhood_memories", label: "איך היית מתאר/ת אותו/ה כילד/ה" },
      { key: "childhood_special_memory", label: "זיכרון ילדות מיוחד" },
      { key: "childhood_hobbies", label: "תחביבים בילדות" },
    ],
  },
  {
    title: "תחנות משמעותיות",
    fields: [
      { key: "military_service", label: "שירות צבאי" },
      { key: "profession", label: "עיסוק מרכזי בחיים" },
      { key: "work_characteristics", label: "מה הכי אפיין אותו/ה בעבודה" },
      { key: "cities_over_years", label: "מקומות מגורים לאורך השנים" },
      { key: "defining_moments", label: "רגע משמעותי בחיים" },
    ],
  },
  {
    title: "אהבה ומשפחה",
    fields: [
      { key: "partner", label: "בן/בת זוג" },
      { key: "how_they_met", label: "איך הכירו" },
      { key: "wedding_story", label: "סיפור חתונה" },
      { key: "children", label: "ילדים ושמותיהם" },
      { key: "parenting_style", label: "איך היית מתאר/ת אותו/ה כהורה" },
    ],
  },
  {
    title: "האדם שמאחורי הסיפור",
    fields: [
      { key: "personality_traits", label: "שלוש התכונות הבולטות ביותר" },
      { key: "known_for", label: "מה הדבר הכי אופייני לו/לה" },
      { key: "one_sentence_description", label: "תיאור במשפט אחד" },
      { key: "first_impression", label: "מה הדבר הראשון שאנשים שמים לב אליו?" },
      { key: "favorite_sayings", label: "משפט שהוא/היא תמיד אומר/ת" },
      { key: "hobbies", label: "תחביבים" },
      { key: "funny_detail", label: "פרט מצחיק" },
    ],
  },
  {
    title: "רגעים מיוחדים",
    fields: [
      { key: "funny_moment", label: "רגע מצחיק" },
      { key: "emotional_moment", label: "רגע מרגש" },
      { key: "characteristic_moment", label: "רגע שמאפיין אותו/ה" },
    ],
  },
  {
    title: "מורשת וערכים",
    fields: [
      { key: "important_values", label: "ערכים חשובים" },
      { key: "most_proud_of", label: "במה הוא/היא הכי גאים" },
      { key: "taught_children", label: "מה לימדו את הילדים" },
    ],
  },
  {
    title: "הקדשה",
    fields: [
      { key: "blessing_wish", label: "הקדשה לספר" },
      { key: "extra_description", label: "דברים נוספים" },
    ],
  },
  {
    title: "פרטי המזמין",
    fields: [
      { key: "buyer_name", label: "שם המזמין/ה" },
      { key: "relationship_to_buyer", label: "קשר לגיבור/ה" },
      { key: "buyer_phone", label: "טלפון" },
      { key: "buyer_email", label: "אימייל" },
      { key: "additional_notes", label: "הערות נוספות" },
    ],
  },
];
