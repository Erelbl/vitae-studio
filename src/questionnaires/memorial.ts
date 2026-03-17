import type { QuestionnaireConfig } from "./types";

export const memorialConfig: QuestionnaireConfig = {
  albumType: "memorial",
  steps: [
    {
      key: "introduction",
      label: "ספרו לנו",
      fields: [
        { name: "person_name", label: "שם יקירכם", type: "text", required: true },
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
        { name: "person_passing_date", label: "תאריך פטירה", type: "date", required: false, dir: "ltr" },
        { name: "passing_circumstances", label: "ספרו על נסיבות הפטירה", type: "textarea", required: false, maxLength: 500 },
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
      label: "תחנות בחיים",
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
        { name: "proposal_story", label: "במידה והייתה הצעת נישואין ספרו לנו עליה", type: "textarea", required: false, maxLength: 400 },
        { name: "wedding_story", label: "סיפור חתונה", type: "textarea", required: false, maxLength: 400 },
        { name: "children", label: "ילדים ושמותיהם", type: "text", required: false },
        { name: "parenting_style", label: "איך היית מתאר/ת אותו/ה כהורה", type: "textarea", required: false, maxLength: 300 },
      ],
    },
    {
      key: "personality",
      label: "האדם שמאחורי הסיפור",
      fields: [
        { name: "known_for", label: "איזה תכונות בולטות אפיינו אותו/ה?", type: "textarea", required: true, maxLength: 300 },
        { name: "one_sentence_description", label: "תארו אותו/ה במשפט אחד", type: "textarea", required: true, maxLength: 200 },
        { name: "first_impression", label: "מה הדבר הראשון שהיית מבחין בו אצלו/ה", type: "text", required: false },
        { name: "favorite_sayings", label: "משפט שהוא/היא תמיד אמר/ה", type: "text", required: false },
        { name: "hobbies", label: "תחביבים", type: "text", required: false },
        { name: "favorite_food", label: "מאכל שהיה אהוב במיוחד עליו/ה", type: "text", required: false },
        { name: "what_we_miss", label: "מה הדבר שאתם הכי מתגעגעים לעשות יחד איתו/ה?", type: "textarea", required: false, maxLength: 400 },
      ],
    },
    {
      key: "special_moments",
      label: "רגעים שנשארו איתנו",
      fields: [
        { name: "funny_moment", label: "רגע מצחיק שתמיד נזכרים בו", type: "textarea", required: false, maxLength: 500 },
        { name: "emotional_moment", label: "רגע מרגש", type: "textarea", required: false, maxLength: 500 },
        { name: "characteristic_moment", label: "רגע שמאפיין אותו/ה", type: "textarea", required: false, maxLength: 500 },
        { name: "moments_to_treasure", label: "רגעים שחשוב לכם לשמור", type: "textarea", required: false, maxLength: 500 },
      ],
    },
    {
      key: "legacy",
      label: "מורשת וזיכרון",
      fields: [
        { name: "important_values", label: "ערכים שהוא/היא חי/ה לפיהם", type: "textarea", required: false, maxLength: 300 },
        { name: "most_proud_of", label: "במה היה/היתה הכי גאה", type: "textarea", required: false, maxLength: 400 },
        { name: "taught_children", label: "מה היה המסר שלו/ה לעולם?", type: "textarea", required: false, maxLength: 400 },
        { name: "how_they_changed_us", label: "איך הוא/היא שינה את חיינו", type: "textarea", required: false, maxLength: 400 },
      ],
    },
    {
      key: "blessing",
      label: "לזכרו/ה",
      fields: [
        { name: "blessing_wish", label: "הקדשה לספר ההנצחה", type: "textarea", required: true, maxLength: 400 },
        { name: "what_they_would_say", label: "מה הוא/היא היה רוצה שנזכור", type: "textarea", required: false, maxLength: 400 },
        { name: "extra_description", label: "דברים נוספים", type: "textarea", required: false, maxLength: 300 },
      ],
    },
    {
      key: "buyer_details",
      label: "פרטי המזמין",
      fields: [
        { name: "buyer_name", label: "שם המזמין/ה", type: "text", required: true },
        { name: "relationship_to_buyer", label: "קשר ליקיר/ה שלנו", type: "text", required: true, placeholder: "למשל: בת, בן, נכד/ה, חבר/ה קרוב/ה" },
        { name: "buyer_phone", label: "טלפון", type: "text", required: true, placeholder: "למשל: 052-1234567", dir: "ltr" },
        { name: "buyer_email", label: "אימייל", type: "text", required: false, placeholder: "למשל: dana@example.com", dir: "ltr" },
        { name: "additional_notes", label: "הערות נוספות", type: "textarea", required: false, placeholder: "כל דבר נוסף שחשוב שנדע לפני כתיבת הסיפור", maxLength: 500 },
      ],
    },
  ],
};
