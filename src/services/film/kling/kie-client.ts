/**
 * Kie.ai REST client for Kling 2.6 image-to-video generation.
 *
 * Required environment variables (set in .env.local / Vercel):
 *   KIE_API_KEY       — API key for api.kie.ai
 *   KIE_API_BASE_URL  — base URL, e.g. https://api.kie.ai (no trailing slash)
 *   KIE_VIDEO_MODEL   — model identifier, e.g. kling-2.6/image-to-video
 *
 * Flow:
 *   1. POST /api/v1/jobs/createTask        → receive data.taskId
 *   2. Poll GET /api/v1/jobs/recordInfo?taskId={id}
 *      until data.state === "success" | "fail" | timeout
 *   3. Parse data.resultJson (JSON string) → resultUrls[0]
 *
 * Kie success convention: code === 200 (not 0).
 * Task id is returned as data.taskId (camelCase).
 */

export interface KlingVideoResult {
  videoUrl: string;
  durationSeconds: number;
}

/** Poll every 8 s, give up after 7 minutes. */
const POLL_INTERVAL_MS = 8_000;
const POLL_TIMEOUT_MS  = 7 * 60 * 1_000;

function getKieEnv(): { apiKey: string; baseUrl: string; model: string } {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error("[kie-client] KIE_API_KEY is not set");
  return {
    apiKey,
    baseUrl: process.env.KIE_API_BASE_URL ?? "https://api.kie.ai",
    model:   process.env.KIE_VIDEO_MODEL   ?? "kling-2.6/image-to-video",
  };
}

/** Kie uses code 200 for success (not 0). Accept both defensively. */
function isKieSuccess(code: number): boolean {
  return code === 0 || code === 200;
}

interface CreateResponse {
  code: number;
  message?: string;
  msg?: string;
  data?: Record<string, unknown>;
}

interface PollResponse {
  code: number;
  msg?: string;
  data?: {
    taskId?:     string;
    /** Generation state from Kie recordInfo endpoint. */
    state?:      "waiting" | "queuing" | "generating" | "success" | "fail";
    /** JSON-encoded string containing { resultUrls: string[] } on success. */
    resultJson?: string;
    failCode?:   number | null;
    failMsg?:    string | null;
  };
}

/**
 * Extract the task id from a createTask response data object.
 * Kie image-to-video returns camelCase taskId; legacy snake_case fields also checked.
 */
function extractTaskId(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const id = (data.taskId  as string | undefined)
          ?? (data.task_id as string | undefined)
          ?? (data.job_id  as string | undefined)
          ?? null;
  const source = data.taskId ? "taskId" : data.task_id ? "task_id" : data.job_id ? "job_id" : "none";
  console.log(`[kie-client] task id field used: ${source} = ${id ?? "(null)"}`);
  return id;
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
      prompt:          input.prompt,
      negative_prompt: "",
      image_urls:      [input.imageUrl],
      duration,
      sound:           false,
    },
  };
  console.log(
    `[kie-client] POST ${createEndpoint}`,
    `model=${model}`,
    `image_urls=${requestBody.input.image_urls.length > 0}`,
    `duration=${duration}s`,
    `sound=false`
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

  // Log response shape to aid debugging — no secrets exposed
  console.log(
    `[kie-client] createTask response: code=${createBody.code}`,
    `msg=${createBody.msg ?? createBody.message ?? "(none)"}`,
    `data_keys=${Object.keys(createBody.data ?? {}).join(",") || "(empty)"}`
  );

  if (!isKieSuccess(createBody.code)) {
    throw new Error(
      `[kie-client] Task creation error (code ${createBody.code}): ${createBody.msg ?? createBody.message ?? JSON.stringify(createBody)}`
    );
  }

  const taskId = extractTaskId(createBody.data);
  if (!taskId) {
    throw new Error(
      `[kie-client] Task created (code ${createBody.code}) but no taskId/task_id/job_id in response data: ${JSON.stringify(createBody.data)}`
    );
  }
  console.log(`[kie-client] Task created: ${taskId} (model=${model}, duration=${duration}s)`);

  // ── 2. Poll until complete or timeout ──────────────────────────────────────
  // Endpoint: GET /api/v1/jobs/recordInfo?taskId={id}
  // Status field: data.state — "waiting" | "queuing" | "generating" | "success" | "fail"
  const pollBase = `${baseUrl}/api/v1/jobs/recordInfo`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let pollBody: PollResponse;
    try {
      const pollResp = await fetch(`${pollBase}?taskId=${encodeURIComponent(taskId)}`, {
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

    if (!isKieSuccess(pollBody.code)) {
      console.warn(`[kie-client] Poll ${taskId}: code=${pollBody.code} — retrying`);
      continue;
    }

    const state = pollBody.data?.state;
    console.log(`[kie-client] Task ${taskId}: state=${state}`);

    if (state === "success") {
      // resultJson is a JSON-encoded string containing { resultUrls: string[] }
      const resultJson = pollBody.data?.resultJson;
      let videoUrl: string | undefined;
      if (resultJson) {
        try {
          const parsed = JSON.parse(resultJson) as { resultUrls?: string[] };
          videoUrl = parsed.resultUrls?.[0];
        } catch {
          // fall through to error below
        }
      }
      if (!videoUrl) {
        throw new Error(
          `[kie-client] Task ${taskId} succeeded but no video URL in resultJson: ${resultJson?.slice(0, 200) ?? "(empty)"}`
        );
      }
      console.log(`[kie-client] Task ${taskId}: video ready`);
      return { videoUrl, durationSeconds: Number(duration) };
    }

    if (state === "fail") {
      const reason = pollBody.data?.failMsg ?? "(no failMsg)";
      throw new Error(`[kie-client] Task ${taskId} failed on Kie.ai: ${reason}`);
    }
    // "waiting" | "queuing" | "generating" — keep polling
  }

  throw new Error(
    `[kie-client] Task ${taskId} timed out after ${POLL_TIMEOUT_MS / 1000}s`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
