// ─────────────────────────────────────────────────────────────────────────────
// Supabase Storage image URL helpers with optional transforms for UI display.
//
// Profiles:
//   thumb               — 300px, q70  (admin galleries, small pickers)
//   questionnairePreview — 400px, q70  (customer photo review grids)
//   albumPreview        — 1400px, q75  (browser album preview & editor)
//   original            — no transform (print/PDF/film — full quality)
//
// NOTE: Supabase Image Transformations must be enabled on the project (Pro plan).
// If not enabled, transforms are silently ignored and originals are served.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

export type ImageProfile =
  | "thumb"
  | "questionnairePreview"
  | "albumPreview"
  | "original";

const TRANSFORM_PROFILES: Record<
  Exclude<ImageProfile, "original">,
  { width: number; quality: number }
> = {
  thumb: { width: 300, quality: 70 },
  questionnairePreview: { width: 400, quality: 70 },
  albumPreview: { width: 1400, quality: 75 },
};

/**
 * Create a single signed URL with optional image transform.
 * Use "original" for print/PDF/film flows that need full quality.
 */
export async function createSignedImageUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn: number,
  profile: ImageProfile = "original"
): Promise<string | null> {
  const transform =
    profile !== "original" ? TRANSFORM_PROFILES[profile] : undefined;
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn, transform ? { transform } : undefined);
  return data?.signedUrl ?? null;
}

/**
 * Batch create signed URLs with optional image transform.
 *
 * When profile is "original", uses efficient batch signing (single API call).
 * When a transform profile is specified, uses parallel individual calls
 * (Supabase batch signing doesn't support transforms).
 */
export async function createSignedImageUrls(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
  expiresIn: number,
  profile: ImageProfile = "original"
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  if (paths.length === 0) return urlMap;

  if (profile === "original") {
    const { data: signedResults } = await supabase.storage
      .from(bucket)
      .createSignedUrls(paths, expiresIn);
    for (const item of signedResults ?? []) {
      if (item.signedUrl && item.path) {
        urlMap.set(item.path, item.signedUrl);
      }
    }
    return urlMap;
  }

  const transform = TRANSFORM_PROFILES[profile];
  const results = await Promise.all(
    paths.map(async (path) => {
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn, { transform });
      return { path, url: data?.signedUrl ?? null };
    })
  );
  for (const { path, url } of results) {
    if (url) urlMap.set(path, url);
  }
  return urlMap;
}
