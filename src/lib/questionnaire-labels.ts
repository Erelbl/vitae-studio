/**
 * Canonical Hebrew labels for questionnaire response fields.
 * Single source of truth — import from here in both questionnaire steps
 * and admin display views.
 */
export const QUESTIONNAIRE_LABELS: Record<string, string> = {
  // Step 1
  nickname: "כינוי חיבה",
  first_impression: "מה הדבר הראשון שאנשים שמים לב אליו?",
  album_type: "סוג האלבום",

  // Step 2
  person_birth_city: "איפה נולד/ה",
  childhood_city: "איפה גדל/ה",
  siblings: "אחים ואחיות ומקומו/ה ביניהם",
  parent_names: "שמות ההורים",
  childhood_memories: "תיאור כילד/ה",
  childhood_special_memory: "זיכרון ילדות מיוחד",
  childhood_hobbies: "תחביבים בילדות",

  // Step 3
  military_service: "שירות צבאי",
  profession: "עיסוק מרכזי בחיים",
  work_characteristics: "מה הכי אפיין אותו/ה בעבודה",
  cities_over_years: "מקומות מגורים לאורך השנים",
  defining_moments: "רגע משמעותי בחיים",

  // Step 4
  partner: "בן/בת זוג",
  how_they_met: "איך הכירו",
  wedding_story: "סיפור חתונה",
  children: "ילדים ושמותיהם",
  parenting_style: "תיאור כהורה",

  // Step 5
  one_sentence_description: "תיאור במשפט אחד",
  personality_traits: "שלוש תכונות בולטות",
  known_for: "הדבר הכי אופייני לו/לה",
  favorite_sayings: "משפט שתמיד אומר/ת",
  hobbies: "תחביבים",
  funny_detail: "פרט מצחיק",

  // Step 6
  funny_moment: "רגע מצחיק",
  emotional_moment: "רגע מרגש",
  characteristic_moment: "רגע מאפיין",

  // Step 7
  important_values: "ערכים חשובים",
  most_proud_of: "במה הכי גאים",
  taught_children: "מה לימדו את הילדים",

  // Step 8
  blessing_wish: "הקדשה לספר",
  extra_description: "דברים נוספים שחשוב לדעת",
};
