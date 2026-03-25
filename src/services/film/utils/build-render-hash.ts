import { createHash } from "crypto";

interface RenderHashInput {
  narrationText: string | null;
  voiceId: string | null;
  motionPreset: string | null;
  transitionIn: string | null;
  transitionOut: string | null;
  pageIds: string[] | null;
  /** Include any image version info or paths that affect the render */
  imageVersions?: string[];
  /** Kling-generated page video storage paths — included so that adding/changing
   *  Kling videos changes the hash and triggers an automatic re-render. */
  klingRightPath?: string | null;
  klingLeftPath?: string | null;
}

/**
 * Computes a deterministic hash of all inputs that affect a scene's rendered output.
 * Used to skip re-rendering scenes whose inputs haven't changed.
 */
export function buildRenderHash(input: RenderHashInput): string {
  const payload = JSON.stringify({
    narrationText: input.narrationText,
    voiceId: input.voiceId,
    motionPreset: input.motionPreset,
    transitionIn: input.transitionIn,
    transitionOut: input.transitionOut,
    pageIds: input.pageIds,
    imageVersions: input.imageVersions ?? [],
    klingRightPath: input.klingRightPath ?? null,
    klingLeftPath:  input.klingLeftPath  ?? null,
  });

  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
