/**
 * Kie.ai REST client for Kling 2.6 image-to-video generation.
 *
 * Required environment variables (set in .env.local / Vercel):
 *   KIE_API_KEY       — API key for api.kie.ai
 *   KIE_API_BASE_URL  — base URL, e.g. https://api.kie.ai (no trailing slash)
 *   KIE_VIDEO_MODEL   — model identifier, e.g. kling-v2-6
 *
 * Flow:
 *   1. POST /v1/videos/image2video → receive task_id
 *   2. Poll GET /v1/videos/image2video/{task_id} until succeed | failed | timeout
 *   3. Return the video URL from task_result
 */

export interface KlingVideoResult {
  videoUrl: string;
  durationSeconds: number;
}

/** Poll every 8 s, give up after 4 minutes. */
const POLL_INTERVAL_MS = 8_000;
const POLL_TIMEOUT_MS  = 4 * 60 * 1_000;

function getKieEnv(): { apiKey: string; baseUrl: string; model: string } {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error("[kie-client] KIE_API_KEY is not set");
  return {
    apiKey,
    baseUrl: process.env.KIE_API_BASE_URL ?? "https://api.kie.ai",
    model:   process.env.KIE_VIDEO_MODEL   ?? "kling-v2-6",
  };
}

interface CreateResponse {
  code: number;
  message?: string;
  data?: { task_id: string; status?: string };
}

interface PollResponse {
  code: number;
  data?: {
    task_id: string;
    status: "pending" | "processing" | "succeed" | "failed";
    task_result?: {
      videos?: Array<{ url: string; duration: number }>;
    };
  };
}

/**
 * Submit an image-to-video task and poll until the video is ready.
 * Throws on API error or poll timeout.
 */
export async function klingImageToVideo(input: {
  imageUrl: string;
  prompt: string;
  durationSeconds?: 5 | 10;
  mode?: "std" | "pro";
}): Promise<KlingVideoResult> {
  const { apiKey, baseUrl, model } = getKieEnv();
  const duration = input.durationSeconds ?? 5;
  const mode     = input.mode           ?? "std";

  // ── 1. Create task ─────────────────────────────────────────────────────────
  const createResp = await fetch(`${baseUrl}/v1/videos/image2video`, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_name: model,
      image:      input.imageUrl,
      prompt:     input.prompt,
      duration,
      mode,
    }),
  });

  if (!createResp.ok) {
    const body = await createResp.text();
    throw new Error(
      `[kie-client] Task creation failed (HTTP ${createResp.status}): ${body.slice(0, 200)}`
    );
  }

  const createBody = (await createResp.json()) as CreateResponse;
  if (createBody.code !== 0 || !createBody.data?.task_id) {
    throw new Error(
      `[kie-client] Task creation error: ${createBody.message ?? JSON.stringify(createBody)}`
    );
  }

  const taskId = createBody.data.task_id;
  console.log(`[kie-client] Task created: ${taskId} (model=${model}, ${duration}s, mode=${mode})`);

  // ── 2. Poll until complete or timeout ──────────────────────────────────────
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let pollBody: PollResponse;
    try {
      const pollResp = await fetch(`${baseUrl}/v1/videos/image2video/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!pollResp.ok) {
        console.warn(`[kie-client] Poll ${taskId}: HTTP ${pollResp.status} — retrying`);
        continue;
      }
      pollBody = (await pollResp.json()) as PollResponse;
    } catch (fetchErr) {
      console.warn(`[kie-client] Poll ${taskId}: network error — retrying:`, fetchErr);
      continue;
    }

    if (pollBody.code !== 0) {
      console.warn(`[kie-client] Poll ${taskId}: code=${pollBody.code} — retrying`);
      continue;
    }

    const status = pollBody.data?.status;
    console.log(`[kie-client] Task ${taskId}: ${status}`);

    if (status === "succeed") {
      const video = pollBody.data?.task_result?.videos?.[0];
      if (!video?.url) {
        throw new Error(`[kie-client] Task ${taskId} succeeded but no video URL in response`);
      }
      return { videoUrl: video.url, durationSeconds: video.duration ?? duration };
    }

    if (status === "failed") {
      throw new Error(`[kie-client] Task ${taskId} failed on Kie.ai`);
    }
    // "pending" | "processing" — keep polling
  }

  throw new Error(
    `[kie-client] Task ${taskId} timed out after ${POLL_TIMEOUT_MS / 1000}s`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
