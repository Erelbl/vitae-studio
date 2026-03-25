/**
 * Page image classifier using Gemini vision (text-output model).
 *
 * Sends the illustration to Gemini and returns one of the SceneType labels.
 * Falls back to "fallback" on any error — this must never block rendering.
 *
 * Uses GOOGLE_AI_API_KEY (already required by the illustration pipeline).
 * Model: gemini-2.0-flash (cheap, fast, multimodal text output).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SceneType } from "./prompt-library";

const CLASSIFIER_MODEL = "gemini-2.0-flash";

const CLASSIFY_PROMPT = `You are a scene type classifier for illustrated book pages (watercolor style).

Inspect this illustration and return ONLY one of the following labels — nothing else, no explanation:

single_character    — one human or animal character is the clear main focus
multiple_characters — two or more human or animal characters appear together
landscape           — scenery, nature, or background with no visible characters
character_action    — a character is clearly performing an action (running, jumping, dancing, playing)
fallback            — none of the above fit well, or the content is unclear

Reply with exactly one label.`;

const VALID_TYPES: SceneType[] = [
  "single_character",
  "multiple_characters",
  "landscape",
  "character_action",
  "fallback",
];

/**
 * Classify a page illustration by image URL.
 * Returns a SceneType string; never throws.
 */
export async function classifyPageImage(imageUrl: string): Promise<SceneType> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn("[kling-classify] GOOGLE_AI_API_KEY not set — defaulting to fallback");
    return "fallback";
  }

  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) {
      console.warn(`[kling-classify] Image fetch failed (${resp.status}) — defaulting to fallback`);
      return "fallback";
    }
    const buf = await resp.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const ct = resp.headers.get("content-type") ?? "image/jpeg";
    const mimeType: "image/jpeg" | "image/png" | "image/webp" = ct.startsWith("image/png")
      ? "image/png"
      : ct.startsWith("image/webp")
      ? "image/webp"
      : "image/jpeg";

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: CLASSIFIER_MODEL });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: CLASSIFY_PROMPT },
          ],
        },
      ],
    });

    const raw = result.response
      .text()
      .trim()
      .toLowerCase()
      .replace(/[^a-z_]/g, "");

    const detected = VALID_TYPES.find((t) => t === raw) ?? "fallback";
    console.log(`[kling-classify] → ${detected}`);
    return detected;
  } catch (err) {
    console.warn(
      "[kling-classify] Classification failed — defaulting to fallback:",
      err instanceof Error ? err.message : err
    );
    return "fallback";
  }
}
