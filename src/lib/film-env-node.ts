/**
 * Film-related environment variables — Node-safe version.
 *
 * Identical to film-env.ts but WITHOUT `import "server-only"`, so it can be
 * imported from scripts that run outside Next.js (e.g. the render worker).
 *
 * Do NOT import this from Next.js server components or API routes — use
 * film-env.ts there so the server-only guard stays in place.
 */

function required(name: string): string {
  const val = process.env[name];
  if (!val)
    throw new Error(
      `[film-env] Missing required environment variable: ${name}\n` +
        `  Make sure .env.local is loaded (the render worker does this via dotenv/config).`
    );
  return val;
}

function optional(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

function optionalInt(name: string, fallback: number): number {
  const val = process.env[name];
  return val ? parseInt(val, 10) : fallback;
}

/** Access film env vars. Call lazily — throws at access time, not import time. */
export const filmEnv = {
  get elevenLabsApiKey() {
    return required("ELEVENLABS_API_KEY");
  },
  get elevenLabsVoiceIdA() {
    return optional("ELEVENLABS_VOICE_ID_A");
  },
  get elevenLabsVoiceIdB() {
    return optional("ELEVENLABS_VOICE_ID_B");
  },
  get defaultFps() {
    return optionalInt("FILM_DEFAULT_FPS", 30);
  },
  get defaultWidth() {
    return optionalInt("FILM_DEFAULT_WIDTH", 1920);
  },
  get defaultHeight() {
    return optionalInt("FILM_DEFAULT_HEIGHT", 1080);
  },
  get storageBucket() {
    return optional("FILM_STORAGE_BUCKET", "films");
  },
  get inngestEventKey() {
    return optional("INNGEST_EVENT_KEY");
  },
  get inngestSigningKey() {
    return optional("INNGEST_SIGNING_KEY");
  },
  get inngestDev() {
    return optional("INNGEST_DEV");
  },
};
