import { filmEnv } from "@/lib/film-env";
import { patchMp3XingFrameCount } from "@/services/film/utils/mp3-duration";
import { appendMp3Silence } from "@/services/film/utils/mp3-silence";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
// eleven_v3 is ElevenLabs' latest model and handles Hebrew natively via
// automatic language detection from the input text. It does not accept a
// language_code parameter (causes 422). eleven_turbo_v2_5 / eleven_multilingual_v2
// both had issues with non-Hebrew-trained voices defaulting to their own language.
const FILM_MODEL_ID = "eleven_v3";

export interface TextToSpeechInput {
  text: string;
  voiceId: string;
  /** Optional model override. Defaults to "eleven_v3". */
  modelId?: string;
}

export interface TextToSpeechResult {
  audioBuffer: Buffer;
  /** Estimated duration in ms (derived from text length — not exact) */
  durationMs: number;
}

/**
 * Converts text to speech using the ElevenLabs API.
 * Uses eleven_v3 for reliable Hebrew support via automatic language detection.
 * Returns the raw MP3 audio buffer.
 */
export async function textToSpeech(
  input: TextToSpeechInput
): Promise<TextToSpeechResult> {
  const apiKey = filmEnv.elevenLabsApiKey; // throws if missing
  const modelId = input.modelId ?? FILM_MODEL_ID;

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
        // NOTE: language_code is intentionally omitted — eleven_v3 rejects it
        // and detects Hebrew automatically from the input text.
        // Explicit CBR format keeps our buffer-size duration estimate accurate
        // (128 kbps = 16 000 bytes/sec) and produces a properly-framed MP3 file.
        output_format: "mp3_44100_128",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const hint = buildErrorHint(response.status, errorBody, modelId);
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${hint}`);
  }

  // Read the response body as a stream to ensure all bytes are captured.
  // response.arrayBuffer() can silently drop the final chunk(s) in some
  // Node.js / edge-network environments, causing the last word to be cut off.
  const chunks: Buffer[] = [];
  const reader = response.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.length) chunks.push(Buffer.from(value));
  }
  const rawBuffer = Buffer.concat(chunks);

  // Step 1 — append real silence to the MP3 file before upload.
  // ElevenLabs ends the stream at the last speech frame. Strict decoders
  // (QuickTime, WMP, some mobile players) discard the unflushed decoder-delay
  // samples that follow — cutting off the last word. Physical silence frames
  // after the speech give every decoder room to finish flushing without losing
  // real audio. See src/services/film/utils/mp3-silence.ts for details.
  const withSilence = appendMp3Silence(rawBuffer, 900); // 900 ms ≈ 34 frames at 44.1 kHz

  // Step 2 — patch the Xing/Info VBR header frame count.
  // ElevenLabs' streaming encoder writes the Xing header before encoding
  // completes, so the stored count can be lower than the actual frame count
  // (including the silence frames we just appended). Patching here ensures
  // every player computes the correct total duration and plays to the true end.
  const { buffer: audioBuffer, xingCount, actualCount, patched } =
    patchMp3XingFrameCount(withSilence);

  if (patched) {
    const deltaMs = Math.round((actualCount - xingCount!) * 1152 / 44100 * 1000);
    console.log(
      `[elevenlabs] Xing frame count patched: declared=${xingCount} actual=${actualCount}` +
      ` (+${deltaMs} ms recovered, ${rawBuffer.length} bytes)`
    );
  } else if (xingCount !== null) {
    console.log(
      `[elevenlabs] Xing frame count verified: ${xingCount} frames (${actualCount} actual, no patch needed)`
    );
  } else {
    console.log(
      `[elevenlabs] No Xing header (CBR or headerless); actualCount=${actualCount}, ${rawBuffer.length} bytes`
    );
  }

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

function buildErrorHint(status: number, body: string, modelId: string): string {
  const modelTag = `model=${modelId}`;
  if (status === 401) return `Invalid or missing ELEVENLABS_API_KEY (${modelTag})`;
  if (status === 422)
    return `Unprocessable — check voice ID or model compatibility (${modelTag}). ${body.slice(0, 200)}`;
  if (status === 429) return `Rate limit reached — try again later (${modelTag})`;
  return `${body.slice(0, 200) || `HTTP ${status}`} (${modelTag})`;
}
