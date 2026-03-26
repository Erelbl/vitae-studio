/**
 * Generates a Kling 2.6 video for a single illustration page.
 *
 * Steps:
 *   1. Classify the page image with Gemini vision → SceneType
 *   2. Select the matching prompt from the library
 *   3. Submit to Kie/Kling and wait for the video
 *      — on NSFW rejection: retry once with the family-safe prompt
 *   4. Download the generated MP4
 *   5. Upload to Supabase films/ bucket
 *   6. Return the storage path
 *
 * Returns null on any failure — the caller uses the static page image.
 * This function NEVER throws.
 */

import { classifyPageImage }              from "./classify-page";
import { getKlingPrompt, NSFW_RETRY_PROMPT } from "./prompt-library";
import { klingImageToVideo }               from "./kie-client";
import { uploadFilmAsset }                from "@/services/film/storage/film-storage";

export interface GeneratePageVideoInput {
  /** Signed HTTPS URL to the page illustration — used for classification and passed to Kling. */
  imageUrl:      string;
  /** "right" or "left" — used for logging and storage path. */
  side:          "right" | "left";
  orderId:       string;
  filmProjectId: string;
  sceneId:       string;
}

/** True when the Kie failure message indicates NSFW content moderation. */
function isNsfwError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /nsfw/i.test(msg);
}

/** True when the Kie failure message indicates a poll timeout. */
function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("timed out");
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
    const rawModel = process.env.KIE_VIDEO_MODEL ?? "kling-2.6/image-to-video";
    const effectiveModel = rawModel.replace(/\/(text|image)-to-video$/, "") + "/image-to-video";
    console.log(`${tag} prompt="${prompt.slice(0, 90)}…" model=${effectiveModel} duration=10s`);

    // 3. Generate video (blocks until Kling finishes or timeout).
    //    On NSFW rejection: one safe retry before giving up.
    let videoUrl: string;
    try {
      ({ videoUrl } = await klingImageToVideo({ imageUrl, prompt, durationSeconds: 10 }));
      console.log(`${tag} video ready`);
    } catch (firstErr) {
      if (isNsfwError(firstErr)) {
        console.warn(
          `${tag} NSFW rejection (${firstErr instanceof Error ? firstErr.message : String(firstErr)}) — retrying with family-safe prompt`
        );
        try {
          ({ videoUrl } = await klingImageToVideo({
            imageUrl,
            prompt: NSFW_RETRY_PROMPT,
            durationSeconds: 10,
          }));
          console.log(`${tag} NSFW retry succeeded`);
        } catch (retryErr) {
          console.warn(
            `${tag} NSFW retry also failed — using static image fallback:`,
            retryErr instanceof Error ? retryErr.message : String(retryErr)
          );
          return null;
        }
      } else if (isTimeoutError(firstErr)) {
        console.warn(`${tag} timeout — retrying once`);
        try {
          ({ videoUrl } = await klingImageToVideo({ imageUrl, prompt, durationSeconds: 10 }));
          console.log(`${tag} timeout retry succeeded`);
        } catch (retryErr) {
          console.warn(
            `${tag} timeout retry also failed — using static image fallback:`,
            retryErr instanceof Error ? retryErr.message : String(retryErr)
          );
          return null;
        }
      } else {
        throw firstErr;
      }
    }

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
      `${tag} FAILED — using static image fallback:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}
