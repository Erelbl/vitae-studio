/**
 * Generates a Kling 2.6 video for a single illustration page.
 *
 * Steps:
 *   1. Classify the page image with Gemini vision → SceneType
 *   2. Select the matching prompt from the library
 *   3. Submit to Kie/Kling and wait for the video
 *   4. Download the generated MP4
 *   5. Upload to Supabase films/ bucket
 *   6. Return the storage path
 *
 * Returns null on any failure — the caller falls back to Remotion CSS motion.
 * This function NEVER throws.
 */

import { classifyPageImage } from "./classify-page";
import { getKlingPrompt }    from "./prompt-library";
import { klingImageToVideo } from "./kie-client";
import { uploadFilmAsset }   from "@/services/film/storage/film-storage";

export interface GeneratePageVideoInput {
  /** Signed HTTPS URL to the page illustration — used for classification and passed to Kling. */
  imageUrl:      string;
  /** "right" or "left" — used for logging and storage path. */
  side:          "right" | "left";
  orderId:       string;
  filmProjectId: string;
  sceneId:       string;
}

/**
 * Returns the storage path inside the films bucket on success, or null on failure.
 * Safe to call in the render worker — failures are logged but never propagated.
 */
export async function generatePageVideo(
  input: GeneratePageVideoInput
): Promise<string | null> {
  const { imageUrl, side, orderId, filmProjectId, sceneId } = input;
  const tag = `[kling/${side}]`;

  try {
    // 1. Classify
    const sceneType = await classifyPageImage(imageUrl);
    console.log(`${tag} scene_type=${sceneType}`);

    // 2. Select prompt
    const prompt = getKlingPrompt(sceneType);
    console.log(`${tag} prompt="${prompt.slice(0, 90)}…" model=${process.env.KIE_VIDEO_MODEL ?? "kling-v2-6"}`);

    // 3. Generate video (blocks until Kling finishes or timeout)
    const { videoUrl } = await klingImageToVideo({ imageUrl, prompt });
    console.log(`${tag} video ready`);

    // 4. Download
    const dlResp = await fetch(videoUrl);
    if (!dlResp.ok) {
      throw new Error(`Download failed: HTTP ${dlResp.status}`);
    }
    const videoBuffer = Buffer.from(await dlResp.arrayBuffer());
    console.log(`${tag} downloaded ${(videoBuffer.byteLength / 1024).toFixed(0)} KB`);

    // 5. Upload to Supabase films/ bucket
    const storagePath = `${orderId}/${filmProjectId}/scenes/${sceneId}/${side}-page.mp4`;
    await uploadFilmAsset(storagePath, videoBuffer, "video/mp4");
    console.log(`${tag} uploaded → ${storagePath}`);

    return storagePath;
  } catch (err) {
    console.warn(
      `${tag} FAILED — falling back to Remotion CSS motion:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}
