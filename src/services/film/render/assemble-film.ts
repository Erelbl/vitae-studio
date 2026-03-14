export interface AssembleFilmInput {
  filmProjectId: string;
  /** Whether to include background music track */
  includeMusic?: boolean;
}

export interface AssembleFilmResult {
  finalVideoPath: string;
  thumbnailPath: string;
  durationSeconds: number;
}

/**
 * Concatenates all rendered scenes into the final film video.
 * Applies transitions between scenes and optionally mixes in background music.
 *
 * TODO: Implement:
 * - Fetch all rendered scenes in order
 * - Validate all scenes are in 'rendered' status
 * - Concatenate video segments with transitions
 * - Mix in music track if enabled
 * - Upload final video to film storage
 * - Update film_project with final_video_path, final_duration_seconds, last_assembled_at
 * - Set film_project.status = 'assembled'
 */
export async function assembleFilm(
  _input: AssembleFilmInput
): Promise<AssembleFilmResult> {
  // TODO: Implement
  throw new Error("assembleFilm not yet implemented");
}
