import { createAdminClient } from "@/lib/supabase/admin";
import { filmEnv } from "@/lib/film-env";
import { textToSpeech } from "./elevenlabs";
import { uploadVoiceSample } from "../storage/film-storage";
import { applyTtsOverrides } from "../utils/apply-tts-overrides";
import type { FilmProject, TtsOverride } from "@/types/film";

/** Max characters to use from page text for the voice sample */
const MAX_SAMPLE_CHARS = 250;

/** Fallback sample text when no album pages exist yet */
const FALLBACK_SAMPLE_TEXT =
  "ספר חיים מלא, שנה אחר שנה, כל רגע חקוק בלב לעדי עד. " +
  "ימים של אהבה וחום, ורגעים שנשארים בזיכרון לנצח.";

// Hebrew Unicode block: U+0590–U+05FF
const HEBREW_CHAR_RE = /[\u0590-\u05FF]/g;

/**
 * Returns true if at least 40% of non-whitespace characters are Hebrew.
 * Used to catch cases where the album has no usable Hebrew text yet.
 */
function isLikelyHebrew(text: string): boolean {
  const nonSpace = text.replace(/\s/g, "");
  if (nonSpace.length === 0) return false;
  const hebrewCount = (text.match(HEBREW_CHAR_RE) ?? []).length;
  return hebrewCount / nonSpace.length >= 0.4;
}

/**
 * Cleans raw album text for use as a TTS sample:
 * - Strips markdown bold/italic markers and header prefixes
 * - Strips URLs
 * - Drops lines with very few Hebrew characters
 * - Trims to MAX_SAMPLE_CHARS at a word boundary (not mid-word)
 */
function sanitizeHebrewSampleText(raw: string): string {
  const lines = raw.split(/\r?\n/);

  const cleaned = lines
    .map((line) =>
      line
        .replace(/https?:\/\/\S+/g, "")     // strip URLs
        .replace(/\*{1,3}([^*]*)\*{1,3}/g, "$1") // strip markdown bold/italic
        .replace(/^#+\s*/, "")              // strip markdown headers
        .trim()
    )
    .filter((line) => {
      if (line.length < 3) return false;
      // Drop lines that are predominantly non-Hebrew (e.g. English metadata)
      const nonSpace = line.replace(/\s/g, "");
      const hebrewCount = (line.match(HEBREW_CHAR_RE) ?? []).length;
      return nonSpace.length === 0 || hebrewCount / nonSpace.length >= 0.3;
    });

  const joined = cleaned.join(" ").replace(/\s{2,}/g, " ").trim();

  if (joined.length <= MAX_SAMPLE_CHARS) return joined;

  // Trim at the last space before the limit — never cut mid-word
  const truncated = joined.slice(0, MAX_SAMPLE_CHARS);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.slice(0, lastSpace).trim() : truncated.trim();
}

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
  const rawSampleText = await resolveSampleText(adminClient, orderId);

  // Apply pronunciation overrides — TTS only, never mutates stored text
  const overrides = (filmProject.tts_overrides_json as TtsOverride[] | null) ?? [];
  const sampleText = applyTtsOverrides(rawSampleText, overrides);

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
    .limit(5);

  if (!pages || pages.length === 0) {
    return FALLBACK_SAMPLE_TEXT;
  }

  // Collect raw text from pages
  const rawParts: string[] = [];
  for (const page of pages) {
    const text = (page.text_content as string).trim();
    if (text) rawParts.push(text);
  }

  if (rawParts.length === 0) return FALLBACK_SAMPLE_TEXT;

  const sanitized = sanitizeHebrewSampleText(rawParts.join("\n"));

  if (!sanitized || sanitized.length < 10) {
    console.warn(
      `[voice-samples] Sanitized sample text too short for order ${orderId} — using fallback`
    );
    return FALLBACK_SAMPLE_TEXT;
  }

  if (!isLikelyHebrew(sanitized)) {
    console.error(
      `[voice-samples] Sample text for order ${orderId} does not appear to be Hebrew ` +
        `(first 60 chars: "${sanitized.slice(0, 60)}") — using fallback`
    );
    return FALLBACK_SAMPLE_TEXT;
  }

  return sanitized;
}
