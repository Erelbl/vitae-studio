import { createAdminClient } from "@/lib/supabase/admin";
import { filmEnv } from "@/lib/film-env";
import { textToSpeech } from "./elevenlabs";
import { uploadVoiceSample } from "../storage/film-storage";
import type { FilmProject } from "@/types/film";

/** Max characters to use from page text for the voice sample */
const MAX_SAMPLE_CHARS = 300;

/** Fallback sample text when no album pages exist yet */
const FALLBACK_SAMPLE_TEXT =
  "ספר חיים מלא, שנה אחר שנה, כל רגע חקוק בלב לעדי עד. " +
  "ימים של אהבה וחום, ורגעים שנשארים בזיכרון לנצח.";

export interface GenerateVoiceSamplesInput {
  filmProjectId: string;
}

export interface GenerateVoiceSamplesResult {
  filmProject: FilmProject;
  sampleAPath: string;
  sampleBPath: string;
}

/**
 * Generates two voice samples (A and B) for a film project.
 *
 * - Fetches the first available page text from the order's album as sample content
 * - Calls ElevenLabs TTS with ELEVENLABS_VOICE_ID_A and VOICE_ID_B
 * - Uploads both MP3s to film storage
 * - Persists paths + voice IDs to film_projects
 * - Sets voice_choice_status = 'samples_ready'
 */
export async function generateVoiceSamples(
  input: GenerateVoiceSamplesInput
): Promise<GenerateVoiceSamplesResult> {
  const adminClient = createAdminClient();

  // ── Resolve voice IDs ────────────────────────────────────────────────────
  const voiceIdA = filmEnv.elevenLabsVoiceIdA;
  const voiceIdB = filmEnv.elevenLabsVoiceIdB;

  if (!voiceIdA || !voiceIdB) {
    throw new Error(
      "ELEVENLABS_VOICE_ID_A and ELEVENLABS_VOICE_ID_B must both be set to generate voice samples"
    );
  }

  // ── Load film project ────────────────────────────────────────────────────
  const { data: filmProject, error: fpError } = await adminClient
    .from("film_projects")
    .select("*")
    .eq("id", input.filmProjectId)
    .single();

  if (fpError || !filmProject) {
    throw new Error(`Film project not found: ${input.filmProjectId}`);
  }

  const orderId = filmProject.order_id as string;

  // ── Get sample text from album pages ────────────────────────────────────
  const sampleText = await resolveSampleText(adminClient, orderId);

  // ── Generate both samples in parallel ───────────────────────────────────
  const [resultA, resultB] = await Promise.all([
    textToSpeech({ text: sampleText, voiceId: voiceIdA }),
    textToSpeech({ text: sampleText, voiceId: voiceIdB }),
  ]);

  // ── Upload to storage ────────────────────────────────────────────────────
  const [sampleAPath, sampleBPath] = await Promise.all([
    uploadVoiceSample(orderId, input.filmProjectId, "sample-a", resultA.audioBuffer),
    uploadVoiceSample(orderId, input.filmProjectId, "sample-b", resultB.audioBuffer),
  ]);

  // ── Persist to film_projects ─────────────────────────────────────────────
  const { data: updated, error: updateError } = await adminClient
    .from("film_projects")
    .update({
      voice_sample_a_path: sampleAPath,
      voice_sample_b_path: sampleBPath,
      voice_sample_a_voice_id: voiceIdA,
      voice_sample_b_voice_id: voiceIdB,
      voice_choice_status: "samples_ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.filmProjectId)
    .select()
    .single();

  if (updateError || !updated) {
    throw new Error(
      `Failed to persist voice samples: ${updateError?.message ?? "no row returned"}`
    );
  }

  return {
    filmProject: updated as unknown as FilmProject,
    sampleAPath,
    sampleBPath,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveSampleText(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  orderId: string
): Promise<string> {
  const { data: pages } = await adminClient
    .from("pages")
    .select("text_content, page_number")
    .eq("order_id", orderId)
    .not("text_content", "is", null)
    .order("page_number")
    .limit(3);

  if (!pages || pages.length === 0) {
    return FALLBACK_SAMPLE_TEXT;
  }

  // Concatenate first page(s) up to MAX_SAMPLE_CHARS
  let combined = "";
  for (const page of pages) {
    const text = (page.text_content as string).trim();
    if (!text) continue;
    combined = combined ? `${combined}\n${text}` : text;
    if (combined.length >= MAX_SAMPLE_CHARS) break;
  }

  if (!combined) return FALLBACK_SAMPLE_TEXT;

  return combined.slice(0, MAX_SAMPLE_CHARS).trim();
}
