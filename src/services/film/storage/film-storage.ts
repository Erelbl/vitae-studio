import { createAdminClient } from "@/lib/supabase/admin";
import { filmEnv } from "@/lib/film-env";

/**
 * Upload a file to the film storage bucket.
 *
 * @param path - Storage path within the film bucket (e.g. "projects/{id}/scenes/{sceneId}/audio.mp3")
 * @param data - File contents as Buffer
 * @param contentType - MIME type
 * @returns The storage path (same as input path)
 */
export async function uploadFilmAsset(
  path: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const bucket = filmEnv.storageBucket!;
  const adminClient = createAdminClient();

  const { error } = await adminClient.storage
    .from(bucket)
    .upload(path, data, { contentType, upsert: true });

  if (error) {
    throw new Error(`Failed to upload film asset to ${path}: ${error.message}`);
  }

  return path;
}

/**
 * Get a signed URL for a film asset.
 *
 * @param path - Storage path within the film bucket
 * @param expiresIn - URL expiry in seconds (default 3600)
 */
export async function getFilmAssetUrl(
  path: string,
  expiresIn = 3600
): Promise<string> {
  const bucket = filmEnv.storageBucket!;
  const adminClient = createAdminClient();

  const { data, error } = await adminClient.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to get signed URL for ${path}: ${error?.message ?? "no URL returned"}`
    );
  }

  return data.signedUrl;
}

/**
 * Upload a voice sample MP3 for a film project.
 * Stored at: films/{orderId}/{filmProjectId}/voice-samples/{sampleName}.mp3
 *
 * @returns The stored path
 */
export async function uploadVoiceSample(
  orderId: string,
  filmProjectId: string,
  sampleName: string,
  audioBuffer: Buffer
): Promise<string> {
  const path = `films/${orderId}/${filmProjectId}/voice-samples/${sampleName}.mp3`;
  return uploadFilmAsset(path, audioBuffer, "audio/mpeg");
}

/**
 * Delete a film asset from storage.
 */
export async function deleteFilmAsset(path: string): Promise<void> {
  const bucket = filmEnv.storageBucket!;
  const adminClient = createAdminClient();

  const { error } = await adminClient.storage.from(bucket).remove([path]);

  if (error) {
    console.warn(`Failed to delete film asset ${path}: ${error.message}`);
  }
}
