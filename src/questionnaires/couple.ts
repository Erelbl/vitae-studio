import type { QuestionnaireConfig } from "./types";

export const coupleConfig: QuestionnaireConfig = {
  albumType: "couple",
  steps: [
    {
      key: "introduction",
      label: "ספרו לנו על הזוג",
      fields: [
        { name: "person1_name", label: "שם בן/בת הזוג הראשון/ה", type: "text", required: true },
        { name: "person2_name", label: "שם בן/בת הזוג השני/ה", type: "text", required: true },
        {
          name: "couple_occasion",
          label: "לאיזה אירוע מיועד הסיפור",
          type: "select",
          required: true,
          options: [
            { label: "חתונה", value: "חתונה" },
            { label: "יום נישואין", value: "יום נישואין" },
            { label: "סיפור זוגי", value: "סיפור זוגי" },
            { label: "אחר", value: "אחר" },
          ],
        },
        { name: "relationship_start_date", label: "מתי התחילו להיות ביחד", type: "text", required: false, placeholder: "למשל: 1995, או אביב 2010" },
        { name: "wedding_date", label: "תאריך חתונה", type: "date", required: false, dir: "ltr" },
      ],
    },
    {
      key: "the_beginning",
      label: "ההתחלה",
      fields: [
        { name: "how_they_met", label: "איך הם הכירו", type: "textarea", required: true, placeholder: "ספרו את סיפור ההכרות", maxLength: 500 },
        { name: "first_impression", label: "רושם ראשוני אחד על השני/ה", type: "textarea", required: false, maxLength: 400 },
        { name: "early_relationship", label: "איך נראו ההתחלות", type: "textarea", required: false, placeholder: "דייטים ראשונים, רגעים מייחדים", maxLength: 500 },
        { name: "what_attracted", label: "מה משך אחד לשני/ה", type: "textarea", required: false, maxLength: 400 },
      ],
    },
    {
      key: "the_journey",
      label: "המסע המשותף",
      fields: [
        { name: "key_moments", label: "רגעים משמעותיים במסע המשותף", type: "textarea", required: true, maxLength: 500 },
        { name: "challenges_overcome", label: "אתגרים שעברו ביחד", type: "textarea", required: false, maxLength: 400 },
        { name: "adventures_together", label: "הרפתקאות משותפות", type: "textarea", required: false, placeholder: "טיולים, חוויות, רגעים בלתי נשכחים", maxLength: 500 },
        { name: "shared_dreams", label: "חלומות משותפים", type: "textarea", required: false, maxLength: 400 },
      ],
    },
    {
      key: "family",
      label: "המשפחה שבנו",
      fields: [
        { name: "children", label: "ילדים ושמותיהם", type: "text", required: false },
        { name: "family_life", label: "איך נראים החיים המשפחתיים שלהם", type: "textarea", required: false, maxLength: 400 },
        { name: "home_atmosphere", label: "מה מאפיין את הבית שלהם", type: "textarea", required: false, maxLength: 400 },
        { name: "family_traditions", label: "מסורות משפחתיות", type: "textarea", required: false, maxLength: 400 },
      ],
    },
    {
      key: "their_bond",
      label: "הקשר שביניהם",
      fields: [
        { name: "what_makes_them_special", label: "מה מיוחד בזוגיות שלהם", type: "textarea", required: true, maxLength: 400 },
        { name: "how_they_complement", label: "איך הם משלימים אחד את השני/ה", type: "textarea", required: false, maxLength: 400 },
        { name: "funny_habits", label: "הרגלים מצחיקים או חמודים ביניהם", type: "textarea", required: false, maxLength: 400 },
        { name: "love_language", label: "איך הם מביעים אהבה", type: "textarea", required: false, maxLength: 300 },
      ],
    },
    {
      key: "special_moments",
      label: "רגעים מיוחדים",
      fields: [
        { name: "funny_moment", label: "רגע מצחיק ביחד", type: "textarea", required: false, maxLength: 500 },
        { name: "emotional_moment", label: "רגע מרגש ביחד", type: "textarea", required: false, maxLength: 500 },
        { name: "characteristic_moment", label: "רגע שמאפיין את הזוגיות שלהם", type: "textarea", required: false, maxLength: 500 },
      ],
    },
    {
      key: "legacy",
      label: "מה שבנו ביחד",
      fields: [
        { name: "what_they_taught", label: "מה הם מלמדים את הסביבה על אהבה", type: "textarea", required: false, maxLength: 400 },
        { name: "their_love_legacy", label: "מה המורשת של הזוגיות שלהם", type: "textarea", required: false, maxLength: 400 },
        { name: "wish_for_future", label: "מה מאחלים להם", type: "textarea", required: false, maxLength: 400 },
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
        { name: "relationship_to_buyer", label: "קשר לזוג", type: "text", required: true, placeholder: "למשל: בת, חבר/ה קרוב/ה, אח" },
        { name: "buyer_phone", label: "טלפון", type: "text", required: true, placeholder: "למשל: 052-1234567", dir: "ltr" },
        { name: "buyer_email", label: "אימייל", type: "text", required: false, placeholder: "למשל: dana@example.com", dir: "ltr" },
        { name: "additional_notes", label: "הערות נוספות", type: "textarea", required: false, placeholder: "כל דבר נוסף שחשוב שנדע לפני כתיבת הסיפור", maxLength: 500 },
      ],
    },
  ],
};
