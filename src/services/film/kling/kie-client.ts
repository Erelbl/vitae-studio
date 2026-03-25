/**
 * Kie.ai REST client for Kling 2.6 image-to-video generation.
 *
 * Required environment variables (set in .env.local / Vercel):
 *   KIE_API_KEY       — API key for api.kie.ai
 *   KIE_API_BASE_URL  — base URL, e.g. https://api.kie.ai (no trailing slash)
 *   KIE_VIDEO_MODEL   — model identifier, e.g. kling-2.6/image-to-video
 *
 * Flow:
 *   1. POST /api/v1/jobs/createTask → receive task_id
 *   2. Poll GET /api/v1/jobs/fetchTask/{task_id} until succeed | failed | timeout
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
    model:   process.env.KIE_VIDEO_MODEL   ?? "kling-2.6/image-to-video",
  };
}

interface CreateResponse {
  code: number;
  message?: string;
  msg?: string;
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
}): Promise<KlingVideoResult> {
  const { apiKey, baseUrl, model: rawModel } = getKieEnv();
  // Always use image-to-video variant regardless of KIE_VIDEO_MODEL value.
  // Strip any existing task-type suffix (e.g. /text-to-video) and enforce /image-to-video.
  const baseModel = rawModel.replace(/\/(text|image)-to-video$/, "");
  const model = `${baseModel}/image-to-video`;
  const duration = String(input.durationSeconds ?? 5);

  const createEndpoint = `${baseUrl}/api/v1/jobs/createTask`;
  const requestBody = {
    model,
    input: {
      prompt:           input.prompt,
      negative_prompt:  "",
      image_urls:       [input.imageUrl],
      duration,
      sound:            false,
    },
  };
  console.log(
    `[kie-client] POST ${createEndpoint}`,
    `model=${model}`,
    `image_urls=${requestBody.input.image_urls.length > 0}`,
    `duration=${duration}`,
    `sound=${requestBody.input.sound}`,
    `callback=false`
  );

  // ── 1. Create task ─────────────────────────────────────────────────────────
  const createResp = await fetch(createEndpoint, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
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
      `[kie-client] Task creation error: ${createBody.message ?? createBody.msg ?? JSON.stringify(createBody)}`
    );
  }

  const taskId = createBody.data.task_id;
  console.log(`[kie-client] Task created: ${taskId} (model=${model}, duration=${duration}s)`);

  // ── 2. Poll until complete or timeout ──────────────────────────────────────
  const pollEndpoint = `${baseUrl}/api/v1/jobs/fetchTask/${taskId}`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let pollBody: PollResponse;
    try {
      const pollResp = await fetch(pollEndpoint, {
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
      return { videoUrl: video.url, durationSeconds: video.duration ?? Number(duration) };
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
