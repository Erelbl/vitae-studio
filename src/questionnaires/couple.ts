import type { QuestionnaireConfig } from "./types";

export const coupleConfig: QuestionnaireConfig = {
  albumType: "couple",
  steps: [
    {
      key: "introduction",
      label: "ספרו לנו על הזוג",
      fields: [
        { name: "person1_name", label: "שם בן/בת הזוג הראשון/ה", type: "text", required: true },
        {
          name: "person1_gender",
          label: "מגדר בן/בת הזוג הראשון/ה",
          type: "select",
          required: false,
          options: [
            { label: "זכר", value: "זכר" },
            { label: "נקבה", value: "נקבה" },
            { label: "אחר", value: "אחר" },
          ],
        },
        { name: "person2_name", label: "שם בן/בת הזוג השני/ה", type: "text", required: true },
        {
          name: "person2_gender",
          label: "מגדר בן/בת הזוג השני/ה",
          type: "select",
          required: false,
          options: [
            { label: "זכר", value: "זכר" },
            { label: "נקבה", value: "נקבה" },
            { label: "אחר", value: "אחר" },
          ],
        },
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
        {
          name: "relationship_start_story",
          label: "ספרו לנו על סיפור ההיכרות (איפה ומתי זה היה)",
          type: "textarea",
          required: false,
          placeholder: "למשל: נפגשנו בקיץ 2010 בטיול לגליל, הוצג לי על ידי חבר משותף...",
          maxLength: 500,
        },
        { name: "couple_nicknames", label: "שמות חיבה של בני הזוג", type: "text", required: false, placeholder: "למשל: ניצ'קה ודוביק" },
        { name: "first_date_when", label: "יש תאריך לדייט הראשון?", type: "text", required: false, placeholder: "למשל: ינואר 2011" },
        { name: "first_date_where", label: "איפה היה הדייט הראשון?", type: "text", required: false, placeholder: "למשל: מסעדה איטלקית בתל אביב" },
      ],
    },
    {
      key: "the_beginning",
      label: "ההתחלה",
      fields: [
        {
          name: "how_they_met",
          label: "מה כל אחד מבני הזוג עשה בתקופת ההיכרות?",
          type: "textarea",
          required: true,
          placeholder: "לדוגמא: נועה הייתה סטודנטית לרפואה ומתן בהתמחות בעריכת דין",
          maxLength: 500,
        },
        { name: "first_impression", label: "רושם ראשוני אחד על השני/ה", type: "textarea", required: false, maxLength: 400 },
        { name: "early_relationship", label: "איך נראו ההתחלות", type: "textarea", required: false, placeholder: "דייטים ראשונים, רגעים מייחדים", maxLength: 500 },
        { name: "what_attracted", label: "מה כל אחד/ת מבני הזוג אוהב/ת בשני/ה?", type: "textarea", required: false, maxLength: 400 },
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
        { name: "household_chores", label: "מהי החלוקה במטלות הבית?", type: "textarea", required: false, maxLength: 400 },
        {
          name: "honeymoon_travels",
          label: "היה ירח דבש? אם כן איפה? ואם לא ותרצו שנספר על טיולים אחרים יחד ספרו לנו עליהם",
          type: "textarea",
          required: false,
          maxLength: 500,
        },
        {
          name: "current_occupations",
          label: "מה כל אחד/ת מבני הזוג עושה היום?",
          type: "textarea",
          required: false,
          placeholder: "לדוגמא: נועה רופאת ילדים ובזמנה הפנוי מפסלת בקרמיקה ומתן כבר עורך דין ומתמחה בפלילים, הוא מתאמן לריצת מרתון.",
          maxLength: 500,
        },
        { name: "what_annoys_each_other", label: "מה מעצבן כל אחד מבני הזוג בשני/ה?", type: "textarea", required: false, maxLength: 400 },
      ],
    },
    {
      key: "family",
      label: "המשפחה שבנו",
      fields: [
        { name: "living_together_when_where", label: "מתי ואיפה עברו בני הזוג לגור יחד לראשונה?", type: "text", required: false, placeholder: "למשל: 2012, דירה בתל אביב" },
        { name: "proposal_when_where", label: "מתי ואיפה התקיימה הצעת הנישואין?", type: "text", required: false, placeholder: "למשל: ספטמבר 2014, בחוף הים בצזריה" },
        { name: "proposal_story", label: "האם יש סיפור מעניין סביב הצעת הנישואין?", type: "textarea", required: false, maxLength: 500 },
        { name: "wedding_when_where", label: "מתי ואיפה התקיימה החתונה?", type: "text", required: false, placeholder: "למשל: יוני 2015, אולם בגלי כנרת" },
        { name: "wedding_story", label: "האם יש סיפור מצחיק או מרגש סביב החתונה?", type: "textarea", required: false, maxLength: 500 },
        { name: "wedding_date", label: "תאריך חתונה", type: "date", required: false, dir: "ltr" },
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
