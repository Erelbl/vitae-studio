import type { QuestionnaireConfig } from "./types";

export const singleConfig: QuestionnaireConfig = {
  albumType: "single",
  steps: [
    {
      key: "introduction",
      label: "ספרו לנו",
      fields: [
        { name: "person_name", label: "שם הגיבור/ה", type: "text", required: true },
        {
          name: "person_gender",
          label: "מגדר",
          type: "select",
          required: true,
          options: [
            { label: "זכר", value: "זכר" },
            { label: "נקבה", value: "נקבה" },
          ],
        },
        { name: "person_birth_date", label: "תאריך לידה", type: "date", required: false, dir: "ltr" },
        { name: "nickname", label: "כינוי חיבה", type: "text", required: false },
      ],
    },
    {
      key: "childhood_roots",
      label: "ילדות ושורשים",
      fields: [
        { name: "person_birth_city", label: "איפה נולד/ה", type: "text", required: true, placeholder: "למשל: חיפה" },
        { name: "parent_names", label: "שמות ההורים", type: "text", required: false },
        { name: "childhood_city", label: "איפה גדל/ה", type: "text", required: true, placeholder: "למשל: באר שבע" },
        { name: "siblings", label: "כמה אחים ואחיות ומה מקומו/ה ביניהם", type: "text", required: true, placeholder: "למשל: 4 אחים, הבן השלישי" },
        { name: "childhood_memories", label: "איך היית מתאר/ת אותו/ה כילד/ה", type: "textarea", required: true, placeholder: "למשל: שובב, סקרן, חברותי ואהוב", maxLength: 300 },
        { name: "childhood_special_memory", label: "זיכרון ילדות מיוחד", type: "textarea", required: false, placeholder: "ספרו על רגע קטן, מצחיק או מרגש מהילדות", maxLength: 400 },
        { name: "childhood_hobbies", label: "תחביבים בילדות", type: "text", required: false, placeholder: "למשל: כדורגל, ציור, רכיבה על אופניים" },
      ],
    },
    {
      key: "milestones",
      label: "תחנות משמעותיות",
      fields: [
        { name: "military_service", label: "שירות צבאי", type: "text", required: false },
        { name: "profession", label: "עיסוק מרכזי בחיים", type: "text", required: true },
        { name: "work_characteristics", label: "מה הכי אפיין אותו/ה בעבודה", type: "textarea", required: true, maxLength: 300 },
        { name: "cities_over_years", label: "מקומות מגורים לאורך השנים", type: "text", required: false },
        { name: "defining_moments", label: "רגע משמעותי בחיים", type: "textarea", required: false, maxLength: 400 },
      ],
    },
    {
      key: "family_love",
      label: "אהבה ומשפחה",
      fields: [
        { name: "partner", label: "בן/בת זוג", type: "text", required: false },
        { name: "how_they_met", label: "איך הכירו", type: "textarea", required: false, maxLength: 400 },
        { name: "wedding_story", label: "סיפור חתונה", type: "textarea", required: false, maxLength: 400 },
        { name: "children", label: "ילדים ושמותיהם", type: "text", required: false },
        { name: "parenting_style", label: "איך היית מתאר/ת אותו/ה כהורה", type: "textarea", required: false, maxLength: 300 },
      ],
    },
    {
      key: "personality",
      label: "האדם שמאחורי הסיפור",
      fields: [
        { name: "personality_traits", label: "שלוש התכונות הבולטות ביותר", type: "textarea", required: true, maxLength: 300 },
        { name: "known_for", label: "מה הדבר הכי אופייני לו/לה", type: "textarea", required: true, maxLength: 300 },
        { name: "one_sentence_description", label: "תיאור במשפט אחד", type: "textarea", required: true, maxLength: 200 },
        { name: "first_impression", label: "מה הדבר הראשון שאנשים שמים לב אליו?", type: "text", required: false },
        { name: "favorite_sayings", label: "משפט שהוא/היא תמיד אומר/ת", type: "text", required: false },
        { name: "hobbies", label: "תחביבים", type: "text", required: false },
        { name: "funny_detail", label: "פרט מצחיק", type: "textarea", required: false, maxLength: 300 },
      ],
    },
    {
      key: "special_moments",
      label: "רגעים מיוחדים",
      fields: [
        { name: "funny_moment", label: "רגע מצחיק", type: "textarea", required: false, maxLength: 500 },
        { name: "emotional_moment", label: "רגע מרגש", type: "textarea", required: false, maxLength: 500 },
        { name: "characteristic_moment", label: "רגע שמאפיין אותו/ה", type: "textarea", required: false, maxLength: 500 },
      ],
    },
    {
      key: "legacy",
      label: "מורשת וערכים",
      fields: [
        { name: "important_values", label: "ערכים חשובים", type: "textarea", required: false, maxLength: 300 },
        { name: "most_proud_of", label: "במה הוא/היא הכי גאים", type: "textarea", required: false, maxLength: 400 },
        { name: "taught_children", label: "מה לימדו את הילדים", type: "textarea", required: false, maxLength: 400 },
      ],
    },
    {
      key: "blessing",
      label: "הקדשה",
      fields: [
        { name: "blessing_wish", label: "הקדשה לספר", type: "textarea", required: true, maxLength: 400 },
        { name: "extra_description", label: "דברים נוספים", type: "textarea", required: false, maxLength: 300 },
      ],
    },
    {
      key: "buyer_details",
      label: "פרטי המזמין",
      fields: [
        { name: "buyer_name", label: "שם המזמין/ה", type: "text", required: true },
        { name: "relationship_to_buyer", label: "קשר לגיבור/ה שלנו", type: "text", required: true, placeholder: "למשל: בת, בן זוג, נכדה, חבר קרוב" },
        { name: "buyer_phone", label: "טלפון", type: "text", required: true, placeholder: "למשל: 052-1234567", dir: "ltr" },
        { name: "buyer_email", label: "אימייל", type: "text", required: false, placeholder: "למשל: dana@example.com", dir: "ltr" },
        { name: "additional_notes", label: "הערות נוספות", type: "textarea", required: false, placeholder: "כל דבר נוסף שחשוב שנדע לפני כתיבת הסיפור", maxLength: 500 },
      ],
    },
  ],
};
