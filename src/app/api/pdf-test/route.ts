import { NextResponse } from "next/server";
import { generateAlbumPdf } from "@/services/pdf/generator";

/**
 * Hebrew PDF proof-of-concept endpoint.
 * Visit /api/pdf-test to generate and download a test PDF with Hebrew text.
 * This validates that @react-pdf/renderer handles Hebrew RTL correctly.
 */
export async function GET() {
  try {
    const testPages = [
      {
        pageNumber: 1,
        textContent:
          "בעיר קטנה על שפת הים\nנולד ילד עם חלום גדול בלב פנים\nהוא צעד בשבילי הילדות בשמחה\nוידע שהעולם מחכה לו מעבר לגדר",
        illustrationUrl: null,
        pageType: "illustration_and_text",
      },
      {
        pageNumber: 2,
        textContent:
          "בבית הספר היה תלמיד חכם\nשתמיד ידע לשאול ולחלום\nהמורים אמרו: הנה כוכב עולה\nוהוא חייך ואמר: אני רק מתחיל",
        illustrationUrl: null,
        pageType: "illustration_and_text",
      },
      {
        pageNumber: 3,
        textContent:
          "שנים חלפו כמו רוח בשדה\nאבל הזיכרונות נשארו - כל אחד ואחד\nמשפחה, אהבה, חברים וצחוק\nזה הסיפור שלנו - פשוט ומרגש",
        illustrationUrl: null,
        pageType: "illustration_and_text",
      },
    ];

    const pdfBuffer = await generateAlbumPdf({
      personName: "דוד כהן",
      occasion: "birthday",
      pages: testPages,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="test-hebrew-album.pdf"',
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF", details: String(error) },
      { status: 500 }
    );
  }
}
