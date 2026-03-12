import { GoogleGenerativeAI } from "@google/generative-ai";
import type { IllustrationInput, IllustrationOutput, IllustrationProvider } from "./types";

// ── Fixed watercolor style prompt ────────────────────────────────────────────
// Single shared prompt used for all photos. Easy to tweak in one place.
export const WATERCOLOR_STYLE_PROMPT = `
Transform this photograph into a beautiful watercolor illustration with these characteristics:
- Soft, painterly watercolor brush strokes with visible paper texture
- Warm, emotional family-album aesthetic — tender and timeless
- Preserve the original composition, subjects, and scene exactly as they appear
- Non-photorealistic: artistic, painterly interpretation, not realistic rendering
- Gentle warm color palette — soft creams, warm golds, muted earth tones
- Loose, expressive brushwork with subtle blending and translucent washes
- Style similar to a high-quality illustrated children's book or vintage postcard
- Clean, elegant, print-ready result — no graininess, no noise
- No text, captions, watermarks, or writing anywhere in the image
`.trim();

const MODEL_ID = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";

export class GeminiIllustrationProvider implements IllustrationProvider {
  async stylizeImage(input: IllustrationInput): Promise<IllustrationOutput> {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY is not set — cannot generate illustrations");
    }

    console.log(`[gemini] model=${MODEL_ID}`);
    console.log(`[gemini] Fetching source image from URL (${input.sourceImageUrl.slice(0, 60)}…)`);

    // Download source image
    const imageResponse = await fetch(input.sourceImageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch source image: ${imageResponse.status} ${imageResponse.statusText}`);
    }
    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageArrayBuffer).toString("base64");
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
    // Normalise MIME type to a value Gemini accepts
    const mimeType = contentType.startsWith("image/png")
      ? "image/png"
      : contentType.startsWith("image/webp")
      ? "image/webp"
      : "image/jpeg";

    console.log(`[gemini] Source image: ${(imageArrayBuffer.byteLength / 1024).toFixed(1)} KB, mimeType=${mimeType}`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_ID });

    console.log(`[gemini] Sending image to model=${MODEL_ID}`);

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Image,
              },
            },
            { text: WATERCOLOR_STYLE_PROMPT },
          ],
        },
      ],
      // responseModalities is not yet typed in the SDK; cast to any
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
      } as Record<string, unknown>,
    });

    const parts = result.response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find(
      (p) => (p as { inlineData?: { mimeType?: string; data?: string } }).inlineData?.mimeType?.startsWith("image/")
    ) as { inlineData: { mimeType: string; data: string } } | undefined;

    if (!imagePart?.inlineData?.data) {
      const textParts = parts
        .map((p) => (p as { text?: string }).text)
        .filter(Boolean)
        .join(" ");
      throw new Error(
        `Gemini did not return an image. Text response: ${textParts.slice(0, 200) || "(none)"}`
      );
    }

    const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
    console.log(`[gemini] Received illustration: ${(imageBuffer.byteLength / 1024).toFixed(1)} KB`);

    return {
      imageBuffer,
      modelUsed: MODEL_ID,
      promptUsed: WATERCOLOR_STYLE_PROMPT,
    };
  }
}
