import { filmEnv } from "@/lib/film-env";

export interface TextToSpeechInput {
  text: string;
  voiceId: string;
  /** Optional model override. Defaults to "eleven_multilingual_v2" */
  modelId?: string;
}

export interface TextToSpeechResult {
  audioBuffer: Buffer;
  durationMs: number;
}

/**
 * Converts text to speech using ElevenLabs API.
 *
 * TODO: Implement ElevenLabs TTS call:
 * - POST to /v1/text-to-speech/{voiceId}
 * - Use eleven_multilingual_v2 model for Hebrew support
 * - Return audio buffer + duration
 */
export async function textToSpeech(
  _input: TextToSpeechInput
): Promise<TextToSpeechResult> {
  // Validate API key is present (fail fast)
  void filmEnv.elevenLabsApiKey;

  // TODO: Implement
  throw new Error("textToSpeech not yet implemented");
}

/**
 * Lists available voices from ElevenLabs.
 *
 * TODO: Implement voice listing for admin voice selection UI.
 */
export async function listVoices(): Promise<
  Array<{ voiceId: string; name: string; previewUrl: string | null }>
> {
  void filmEnv.elevenLabsApiKey;

  // TODO: Implement
  throw new Error("listVoices not yet implemented");
}
