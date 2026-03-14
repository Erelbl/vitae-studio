import { filmEnv } from "@/lib/film-env";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

export interface TextToSpeechInput {
  text: string;
  voiceId: string;
  /** Optional model override. Defaults to "eleven_multilingual_v2" */
  modelId?: string;
}

export interface TextToSpeechResult {
  audioBuffer: Buffer;
  /** Estimated duration in ms (derived from text length — not exact) */
  durationMs: number;
}

/**
 * Converts text to speech using the ElevenLabs API.
 * Uses eleven_multilingual_v2 for Hebrew support.
 * Returns the raw MP3 audio buffer.
 */
export async function textToSpeech(
  input: TextToSpeechInput
): Promise<TextToSpeechResult> {
  const apiKey = filmEnv.elevenLabsApiKey; // throws if missing
  const modelId = input.modelId ?? DEFAULT_MODEL_ID;

  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${input.voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: input.text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const hint = buildErrorHint(response.status, errorBody);
    throw new Error(
      `ElevenLabs TTS failed (${response.status}): ${hint}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  return {
    audioBuffer,
    durationMs: estimateDurationMs(input.text),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Rough duration estimate based on word count.
 * Hebrew TTS runs ~2.5 words/sec at normal speed.
 */
function estimateDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / 2.5) * 1000);
}

function buildErrorHint(status: number, body: string): string {
  if (status === 401) return "Invalid or missing ELEVENLABS_API_KEY";
  if (status === 422) return `Unprocessable — text may be too long or voice invalid. ${body}`;
  if (status === 429) return "Rate limit reached — try again later";
  return body.slice(0, 200) || `HTTP ${status}`;
}
