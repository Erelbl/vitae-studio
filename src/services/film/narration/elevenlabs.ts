import { filmEnv } from "@/lib/film-env";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
// eleven_turbo_v2_5 accepts an explicit language_code, which prevents the model
// from defaulting to the voice's training language (e.g. Arabic or English)
// when the input text is Hebrew. eleven_multilingual_v2 ignores language_code
// and relies on auto-detection, which is the root cause of this bug.
const DEFAULT_MODEL_ID = "eleven_turbo_v2_5";

export interface TextToSpeechInput {
  text: string;
  voiceId: string;
  /** Optional model override. Defaults to "eleven_turbo_v2_5" */
  modelId?: string;
  /** ISO 639-1 language code. Defaults to "he" (Hebrew). */
  languageCode?: string;
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
  const languageCode = input.languageCode ?? "he";

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
        language_code: languageCode,
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
