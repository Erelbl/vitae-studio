export interface GenerateVoiceSamplesInput {
  filmProjectId: string;
  /** Short sample text to generate with both voices */
  sampleText: string;
}

export interface GenerateVoiceSamplesResult {
  sampleAPath: string;
  sampleBPath: string;
}

/**
 * Generates two voice samples (A and B) for an admin to compare and choose.
 * Uses the two configured ElevenLabs voice IDs.
 *
 * TODO: Implement:
 * - Read voice IDs from filmEnv
 * - Call textToSpeech for each voice
 * - Upload audio to film storage
 * - Update film_project with sample paths and voice_choice_status = 'samples_ready'
 */
export async function generateVoiceSamples(
  _input: GenerateVoiceSamplesInput
): Promise<GenerateVoiceSamplesResult> {
  // TODO: Implement
  throw new Error("generateVoiceSamples not yet implemented");
}
