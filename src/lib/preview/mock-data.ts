import type { PreviewPage } from "@/types/page";

export const MOCK_PERSON_NAME = "מרים לוי";

export function getMockPreviewPages(personName = MOCK_PERSON_NAME): PreviewPage[] {
  // Feminine forms used by default — generation pipeline will produce gender-matched content
  void personName; // personName available for future gender-aware mock copy
  return [
    {
      id: "mock-cover",
      page_number: 1,
      page_type: "cover",
      text_content: null,
      image_url: null,
    },
    {
      id: "mock-dedication",
      page_number: 2,
      page_type: "dedication",
      text_content: "לכל אוהביה ואוהבותיה,\nשהפכו את חייה לסיפור.",
      image_url: null,
    },
    {
      id: "mock-page-3",
      page_number: 3,
      page_type: "illustration_and_text",
      text_content:
        "בימי ילדות באביב,\nהיה הבית מלא חיים,\nצחוק ושיר בכל פינה,\nולב פתוח לחלומות.",
      image_url: null,
    },
    {
      id: "mock-page-4",
      page_number: 4,
      page_type: "illustration_and_text",
      text_content:
        "עלתה וגדלה בדרך מלאה חן,\nלמדה את החיים מפה אל פה,\nמכל מורה קיבלה חוכמת זמן,\nומכל רעה — חסד ואהבה.",
      image_url: null,
    },
    {
      id: "mock-page-5",
      page_number: 5,
      page_type: "illustration_and_text",
      text_content:
        "בנפש יצירתית ובידיים מוכשרות,\nבנתה בית חמים ומלא אור,\nהדליקה נרות לשבת בניגונים,\nופרשה כנפיים לכל אחד ואחת.",
      image_url: null,
    },
    {
      id: "mock-page-6",
      page_number: 6,
      page_type: "text_only",
      text_content:
        "כי כל חייו של אדם הם שיר,\nיש בהם קצב ומנגינה,\nואת — לבד — המלחנת האמיצה\nשל נעימה המורכבת מאהבה.",
      image_url: null,
    },
    {
      id: "mock-page-7",
      page_number: 7,
      page_type: "illustration_and_text",
      text_content:
        "ועכשיו, לאחר עשורים ושנים,\nהעיניים צופות אל העתיד בשמחה,\nכל צעד היה לימוד ונדיבות —\nחיים של תפארת, אהבה, ושלווה.",
      image_url: null,
    },
    {
      id: "mock-back-cover",
      page_number: 8,
      page_type: "back_cover",
      text_content: "באהבה, ממשפחה שמחה בך.",
      image_url: null,
    },
  ];
}
