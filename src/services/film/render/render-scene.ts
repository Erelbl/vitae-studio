/**
 * Film scene renderer — Node.js only.
 *
 * ⚠️  ENVIRONMENT REQUIREMENT
 * This module uses @remotion/renderer (Puppeteer / headless Chrome). It works in:
 *   - Local `npm run dev` / `npm run start`
 *   - A VPS or EC2 instance with Chrome installed
 *
 * It does NOT work on Vercel serverless functions (no bundled Chrome).
 * For production cloud rendering, migrate to @remotion/lambda (AWS Lambda).
 *
 * ⚠️  PRE-BUILD REQUIREMENT
 * The Remotion composition must be bundled before rendering. Run once:
 *   npm run bundle:remotion
 * Or set REMOTION_BUNDLE_PATH to point to an existing bundle directory.
 */

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as os from "os";
import * as path from "path";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildRenderHash } from "@/services/film/utils/build-render-hash";
import { uploadFilmAsset } from "@/services/film/storage/film-storage";
import { filmEnv } from "@/lib/film-env-node";
import { generatePageVideo } from "@/services/film/kling/generate-page-video";
import type { SlotImageData, ScenePageData } from "@/remotion/SceneComposition";

export interface RenderSceneInput {
  sceneId: string;
  orderId: string;
  filmProjectId: string;
  /** Override render dimensions (defaults from filmEnv). */
  width?: number;
  height?: number;
  fps?: number;
}

export interface RenderSceneResult {
  renderedPath: string;
  thumbnailPath: string;
  durationMs: number;
  renderHash: string;
}

// ── Pre-built bundle path ─────────────────────────────────────────────────────

/** Default bundle output directory — must match `--out-dir` in package.json bundle:remotion. */
const REMOTION_BUNDLE_DIR = ".remotion-bundle";

function getBundlePath(): string {
  const bundleDir =
    process.env.REMOTION_BUNDLE_PATH ??
    path.join(process.cwd(), REMOTION_BUNDLE_DIR);

  const indexHtml = path.join(bundleDir, "index.html");

  if (!fsSync.existsSync(indexHtml)) {
    const envInfo = process.env.REMOTION_BUNDLE_PATH
      ? `\n  REMOTION_BUNDLE_PATH : ${process.env.REMOTION_BUNDLE_PATH}`
      : `\n  Default bundle dir   : ${bundleDir}`;

    throw new Error(
      `[film-render] Remotion bundle not found.\n` +
        `  Looking for : ${indexHtml}\n` +
        `  process.cwd(): ${process.cwd()}${envInfo}\n` +
        `  Build the bundle first:\n` +
        `    npm run bundle:remotion\n` +
        `  To use a custom location set REMOTION_BUNDLE_PATH in .env.local.\n` +
        `  Note: rendering requires Chrome — it does not work on Vercel serverless.`
    );
  }

  return bundleDir;
}

// ── SVG frame mask paths — must match SceneComposition.tsx FRAME_MASKS exactly ──
// When a slot has a frameStyle, the mask is baked into the Kling input image so
// the generated video is already masked with the decorative shape. This avoids
// any mismatch between the CSS mask in Remotion and what Kling animates.
const FRAME_MASK_PATHS: Record<string, string> = {
  torn_top:    "M0,100 L100,100 L100,10 C93,5 87,14 80,8 C73,2 67,13 60,6 C53,1 47,12 40,5 C33,0 27,11 20,4 C13,1 7,13 0,6 Z",
  torn_bottom: "M0,0 L100,0 L100,90 C93,95 87,86 80,92 C73,98 67,87 60,94 C53,99 47,88 40,95 C33,100 27,89 20,96 C13,99 7,87 0,94 Z",
  torn_left:   "M100,0 L100,100 L10,100 C5,93 14,87 8,80 C2,73 13,67 6,60 C1,53 12,47 5,40 C0,33 11,27 4,20 C1,13 13,7 6,0 Z",
  torn_right:  "M0,0 L0,100 L90,100 C95,93 86,87 92,80 C98,73 87,67 94,60 C99,53 88,47 95,40 C100,33 89,27 96,20 C99,13 87,7 94,0 Z",
  oval:        "M50,4 C76,4 96,25 96,50 C96,75 76,96 50,96 C24,96 4,75 4,50 C4,25 24,4 50,4 Z",
  arch:        "M4,100 L4,44 C4,18 20,4 50,4 C80,4 96,18 96,44 L96,100 Z",
  diamond:     "M50,3 L97,50 L50,97 L3,50 Z",
};

// ── Kling input image preparation ────────────────────────────────────────────

/**
 * Crops the illustration to exactly the region visible in the album preview,
 * then uploads it as a short-lived temp asset and returns a signed URL for Kling.
 *
 * The preview uses this CSS crop model (ImageFill in AlbumPageView.tsx):
 *   image wrapper: width = s×100%, height = s×100%
 *                  left  = (crop_x − s/2)×100%,  top = (crop_y − s/2)×100%
 *   container overflow:hidden clips to the visible page area
 *
 * Visible region of the illustration (image-coordinate fractions 0–1):
 *   container range: ix_start_base = clamp( 0.5 − crop_x/s, 0, 1 )
 *                    ix_end_base   = clamp( ix_start_base + 1/s, 0, 1 )
 *
 * Inset crop (cropInsetLeft etc.) is applied as CSS `clipPath: inset()` on the
 * image wrapper, with percentages relative to the WRAPPER (not the visible region).
 * Since the wrapper has width = s × container, insetL fraction of the wrapper equals
 * insetL fraction of the IMAGE. The final visible range is the intersection:
 *   ix_start = max( ix_start_base, insetL )
 *   ix_end   = min( ix_end_base,   1 − insetR )
 *
 * When the crop is trivial (full image visible), the original URL is returned
 * as-is — no download, no upload.
 *
 * NOTE: Assumes square illustrations (standard for AI-generated watercolor art).
 * For non-square images objectFit:contain adds letterboxing that this function
 * does not model — the result is still a useful approximation.
 *
 * @param slot  Resolved slot data (url + crop params) for this page.
 * @param tag   Log prefix e.g. "[film-render/right]".
 * @param adminClient  Supabase admin client (needed for signed-URL creation).
 * @param storageBucket  Film storage bucket name.
 * @returns Signed HTTPS URL pointing to the crop-correct image for Kling.
 */
async function prepareCroppedImageForKling(
  slot: SlotImageData,
  tag: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  storageBucket: string
): Promise<string> {
  const s = Math.max(1, slot.scale);
  // Apply the same legacy-zero correction as the preview's resolveSlot()
  const isLegacyZero = slot.crop_x === 0 && slot.crop_y === 0;
  const cropX = isLegacyZero ? 0.5 : slot.crop_x;
  const cropY = isLegacyZero ? 0.5 : slot.crop_y;

  // Visible region in image-coordinate fractions (0 = start, 1 = end of image)
  const ixStartBase = Math.max(0, Math.min(1, 0.5 - cropX / s));
  const ixEndBase   = Math.max(0, Math.min(1, ixStartBase + 1 / s));
  const iyStartBase = Math.max(0, Math.min(1, 0.5 - cropY / s));
  const iyEndBase   = Math.max(0, Math.min(1, iyStartBase + 1 / s));

  // Apply inset crop — matches the preview's clipPath: inset() on the image wrapper.
  //
  // The preview's ImageFill applies `clipPath: inset(il%, ir%, it%, ib%)` to the
  // image wrapper div (width = scale × container). CSS inset() percentages are
  // relative to the element's own bounding box, so insetL fraction of the wrapper
  // equals insetL fraction of the IMAGE (since the image fills the wrapper).
  //
  // Container overflow:hidden constrains the visible range to [ixStartBase, ixEndBase].
  // Inset clips the image to [insetL, 1-insetR] in image coordinates.
  // Final visible region = intersection of both constraints.
  const insetT = slot.cropInsetTop    ?? 0;
  const insetR = slot.cropInsetRight  ?? 0;
  const insetB = slot.cropInsetBottom ?? 0;
  const insetL = slot.cropInsetLeft   ?? 0;
  const hasInset = insetT > 0 || insetR > 0 || insetB > 0 || insetL > 0;

  const ixStart = Math.max(ixStartBase, insetL);
  const ixEnd   = Math.min(ixEndBase,   1 - insetR);
  const iyStart = Math.max(iyStartBase, insetT);
  const iyEnd   = Math.min(iyEndBase,   1 - insetB);

  const EPSILON = 0.005;
  const isTrivialCrop =
    ixStart <= EPSILON && ixEnd >= 1 - EPSILON &&
    iyStart <= EPSILON && iyEnd >= 1 - EPSILON;

  // Always process — non-square source images (portrait/landscape illustrations)
  // must be baked onto a square canvas matching the preview's contain framing before
  // being sent to Kling. Returning the raw URL would let Kling crop non-square input
  // to fill its internal square frame, losing the side/top-bottom margins visible in
  // the preview. The contain resize below always produces 1024×1024 output.
  const hasFrameMask = !!(slot.frameStyle && FRAME_MASK_PATHS[slot.frameStyle]);

  const inputLabel = hasFrameMask
    ? `preview-crop+mask(${slot.frameStyle})`
    : isTrivialCrop
      ? "preview-contain"
      : "preview-crop";
  console.log(
    `${tag} Kling input=${inputLabel}` +
    ` scale=${s.toFixed(2)} crop=(${cropX.toFixed(2)},${cropY.toFixed(2)})` +
    ` → visible=[${ixStart.toFixed(3)},${ixEnd.toFixed(3)}]×[${iyStart.toFixed(3)},${iyEnd.toFixed(3)}]` +
    (hasInset ? ` inset=(t=${insetT},r=${insetR},b=${insetB},l=${insetL})` : "")
  );

  // Dynamic import — sharp is a native Node.js module
  const sharp = (await import("sharp")).default;

  // Download the full illustration
  const resp = await fetch(slot.url);
  if (!resp.ok) {
    throw new Error(`${tag} Failed to download illustration for cropping: HTTP ${resp.status}`);
  }
  const imgBuffer = Buffer.from(await resp.arrayBuffer());

  // Determine actual pixel dimensions
  const meta = await sharp(imgBuffer).metadata();
  const W = meta.width  ?? 1024;
  const H = meta.height ?? 1024;

  // Map fraction coords → pixel coords
  const left   = Math.max(0, Math.round(ixStart * W));
  const top    = Math.max(0, Math.round(iyStart * H));
  const width  = Math.max(1, Math.min(W - left, Math.round((ixEnd - ixStart) * W)));
  const height = Math.max(1, Math.min(H - top,  Math.round((iyEnd - iyStart) * H)));

  console.log(
    `${tag} cropping ${W}×${H} → region (${left},${top}) ${width}×${height}`
  );

  // Crop + resize base pipeline.
  // fit:"contain" always produces exactly 1024×1024 by letterboxing non-square
  // regions onto the BG_CARD background — matching the preview's contain framing
  // (objectFit:"contain" in SceneComposition ImageFill for no-mask slots).
  // fit:"inside" would produce non-square output for portrait/landscape crops,
  // causing Kling to crop the image to fill its internal square frame.
  const basePipeline = sharp(imgBuffer)
    .extract({ left, top, width, height })
    .resize(1024, 1024, { fit: "contain", background: { r: 246, g: 243, b: 233 }, withoutEnlargement: false });

  let croppedBuffer: Buffer;

  if (hasFrameMask) {
    // ── Bake the SVG frame mask into the image ───────────────────────────────
    // 1. Render to PNG (needs alpha channel for dest-in composite).
    // 2. Composite the SVG mask with dest-in — clips image to mask's white shape.
    // 3. Flatten onto BG_CARD (#F6F3E9 = 246,243,233) — converts back to opaque.
    // 4. Encode as JPEG for Kling.
    //
    // This ensures Kling receives an image that already looks like the preview's
    // decorated frame — no mismatch between what Kling animates and what Remotion shows.
    const pngBuffer = await basePipeline.png().toBuffer();
    const pngMeta   = await sharp(pngBuffer).metadata();
    const outW = pngMeta.width  ?? 1024;
    const outH = pngMeta.height ?? 1024;

    const maskSvg = Buffer.from(
      `<svg width="${outW}" height="${outH}" viewBox="0 0 100 100" ` +
      `preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="${FRAME_MASK_PATHS[slot.frameStyle!]}" fill="white"/>` +
      `</svg>`
    );

    croppedBuffer = await sharp(pngBuffer)
      .ensureAlpha()
      .composite([{ input: maskSvg, blend: "dest-in" }])
      .flatten({ background: { r: 246, g: 243, b: 233 } })
      .jpeg({ quality: 92 })
      .toBuffer();

    console.log(`${tag} mask composited: ${slot.frameStyle} @ ${outW}×${outH}`);
  } else {
    // No frame mask — standard JPEG output
    croppedBuffer = await basePipeline
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  // Upload to a short-lived temp path in the films bucket.
  // The temp file persists but is tiny (~80KB) and namespaced under _kling_crop/.
  const tempPath = `_kling_crop/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await uploadFilmAsset(tempPath, croppedBuffer, "image/jpeg");

  // Signed URL valid for 2h — long enough for Kling's 4min generation + polling
  const { data: signedData } = await adminClient.storage
    .from(storageBucket)
    .createSignedUrl(tempPath, 7200);
  if (!signedData?.signedUrl) {
    throw new Error(`${tag} Failed to create signed URL for cropped illustration`);
  }

  return signedData.signedUrl;
}

// ── Layouts that use the slot-based full-image preview (ImageFill) ────────────
// For these layouts, Kling input is produced by buildPreviewBakedKlingImage()
// (exact preview-bake), NOT by prepareCroppedImageForKling() (old math).
// Other layouts keep the old path.
const FULL_IMAGE_BAKE_LAYOUTS = new Set([
  "FULL_IMAGE",
  "FULL_IMAGE_TEXT_TOP",
  "FULL_IMAGE_TEXT_CENTER",
]);

// ── Shared upload helper ──────────────────────────────────────────────────────

async function uploadKlingAsset(
  buffer: Buffer,
  tag: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  storageBucket: string
): Promise<string> {
  const tempPath = `_kling_crop/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await uploadFilmAsset(tempPath, buffer, "image/jpeg");
  const { data: signedData } = await adminClient.storage
    .from(storageBucket)
    .createSignedUrl(tempPath, 7200);
  if (!signedData?.signedUrl) {
    throw new Error(`${tag} Failed to create signed URL for Kling asset`);
  }
  return signedData.signedUrl;
}

// ── Preview-baked Kling input (FULL_IMAGE-style) ──────────────────────────────

/**
 * Builds the Kling input image by exactly reproducing the CSS ImageFill rendering
 * onto a square canvas and returns the raw JPEG buffer.
 *
 * This is the low-level helper. Call buildPreviewBakedKlingImage() when you also
 * need the image uploaded and a signed URL returned.
 *
 * See buildPreviewBakedKlingImage() for the full CSS model documentation.
 */
async function buildPreviewBakedKlingImageBuffer(
  slot: SlotImageData,
  tag: string,
): Promise<Buffer> {
  const CANVAS_SIZE = 1024;
  const BG = { r: 246, g: 243, b: 233 }; // BG_CARD (#F6F3E9)

  // Legacy (0,0) → treat as centered (0.5,0.5), same as preview resolveSlot()
  const isLegacyZero = slot.crop_x === 0 && slot.crop_y === 0;
  const cropX = isLegacyZero ? 0.5 : slot.crop_x;
  const cropY = isLegacyZero ? 0.5 : slot.crop_y;
  const scale  = Math.max(0.1, slot.scale);

  const insetT = slot.cropInsetTop    ?? 0;
  const insetR = slot.cropInsetRight  ?? 0;
  const insetB = slot.cropInsetBottom ?? 0;
  const insetL = slot.cropInsetLeft   ?? 0;

  const hasFrameMask = !!(slot.frameStyle && FRAME_MASK_PATHS[slot.frameStyle]);
  // objectFit: cover when frame mask is active (fills decorative shape), contain otherwise
  const fitMode = hasFrameMask ? "cover" : "contain";

  // ── Step 1: Compute wrapper rect in canvas pixels ─────────────────────────
  const wW = scale * CANVAS_SIZE;
  const wH = scale * CANVAS_SIZE;
  const wL = (cropX - scale / 2) * CANVAS_SIZE;
  const wT = (cropY - scale / 2) * CANVAS_SIZE;

  // ── Step 2: Apply clipPath inset (fractions of wrapper) ──────────────────
  // CSS inset() percentages are relative to the element's own bounding box.
  // Here that element is the wrapper (wW × wH), NOT the source image or the canvas.
  const effL = wL + insetL * wW;
  const effT = wT + insetT * wH;
  const effR = wL + wW * (1 - insetR);
  const effB = wT + wH * (1 - insetB);

  // ── Step 3: Intersect effective area with canvas bounds ───────────────────
  const visL  = Math.max(0, effL);
  const visT  = Math.max(0, effT);
  const visR  = Math.min(CANVAS_SIZE, effR);
  const visB  = Math.min(CANVAS_SIZE, effB);
  const visWi = Math.round(visR - visL);
  const visHi = Math.round(visB - visT);

  console.log(
    `${tag} preview-bake` +
    ` fit=${fitMode} canvas=${CANVAS_SIZE} scale=${scale.toFixed(3)}` +
    ` crop=(${cropX.toFixed(3)},${cropY.toFixed(3)})` +
    ` wrapper=(L=${wL.toFixed(1)},T=${wT.toFixed(1)},W=${wW.toFixed(1)},H=${wH.toFixed(1)})` +
    ` inset=(t=${insetT},r=${insetR},b=${insetB},l=${insetL})` +
    ` vis=(L=${visL.toFixed(1)},T=${visT.toFixed(1)},W=${visWi},H=${visHi})` +
    (hasFrameMask ? ` frameStyle=${slot.frameStyle}` : "")
  );

  const sharp = (await import("sharp")).default;

  // Download source image
  const resp = await fetch(slot.url);
  if (!resp.ok) {
    throw new Error(`${tag} Failed to download illustration: HTTP ${resp.status}`);
  }
  const srcBuffer = Buffer.from(await resp.arrayBuffer());

  // Nothing visible → return blank BG_CARD canvas
  if (visWi <= 0 || visHi <= 0) {
    console.log(`${tag} no canvas overlap — returning blank BG_CARD canvas`);
    return sharp({
      create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: BG }
    }).jpeg({ quality: 92 }).toBuffer();
  }

  // ── Step 4: Resize source image into the full wrapper rect with objectFit ──
  // The CSS image element fills the wrapper (wW × wH) 100%×100% with objectFit.
  // Sharp's resize with fit:"contain"/"cover" exactly reproduces this behavior.
  const wWi = Math.max(1, Math.round(wW));
  const wHi = Math.max(1, Math.round(wH));

  const wrapperBuffer = await sharp(srcBuffer)
    .resize(wWi, wHi, {
      fit: fitMode,
      background: BG,      // BG_CARD fills letterbox areas (contain only)
      position: "center",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  // ── Step 5: Apply inset clip — extract the inset sub-region ──────────────
  // CSS clipPath inset() clips the wrapper element. We extract the equivalent
  // pixel region from the wrapper image.
  const insetLpx = Math.max(0, Math.round(insetL * wWi));
  const insetTpx = Math.max(0, Math.round(insetT * wHi));
  const insetRpx = Math.max(0, Math.round(insetR * wWi));
  const insetBpx = Math.max(0, Math.round(insetB * wHi));
  const effWi = Math.max(1, wWi - insetLpx - insetRpx);
  const effHi = Math.max(1, wHi - insetTpx - insetBpx);

  const insetBuffer = await sharp(wrapperBuffer)
    .extract({ left: insetLpx, top: insetTpx, width: effWi, height: effHi })
    .png()
    .toBuffer();

  // ── Step 6: Find the sub-region that lands on the canvas ─────────────────
  // The inset image top-left is at (effL, effT) in canvas space.
  // srcL/srcT: offset within inset image where canvas visible area begins.
  const srcL  = Math.max(0, Math.round(visL - effL));
  const srcT  = Math.max(0, Math.round(visT - effT));
  const destW = Math.min(visWi, Math.max(0, effWi - srcL));
  const destH = Math.min(visHi, Math.max(0, effHi - srcT));

  if (destW <= 0 || destH <= 0) {
    console.log(`${tag} effective region does not overlap canvas — returning blank`);
    return sharp({
      create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: BG }
    }).jpeg({ quality: 92 }).toBuffer();
  }

  const visibleSlice = await sharp(insetBuffer)
    .extract({ left: srcL, top: srcT, width: destW, height: destH })
    .png()
    .toBuffer();

  // ── Step 7: Composite onto BG_CARD canvas + optional frame mask ───────────
  const destL = Math.round(visL);
  const destT = Math.round(visT);

  let finalBuffer: Buffer;

  if (hasFrameMask) {
    // Composite the positioned image, then apply the SVG mask at full canvas level.
    // The CSS mask is on the absolute inset-0 container (full page), so the mask
    // SVG covers the full CANVAS_SIZE × CANVAS_SIZE area.
    const preComposite = await sharp({
      create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 4,
                background: { r: 246, g: 243, b: 233, alpha: 0 } }
    })
    .composite([{ input: visibleSlice, left: destL, top: destT }])
    .png()
    .toBuffer();

    const maskSvg = Buffer.from(
      `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 100 100" ` +
      `preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="${FRAME_MASK_PATHS[slot.frameStyle!]}" fill="white"/>` +
      `</svg>`
    );

    finalBuffer = await sharp(preComposite)
      .ensureAlpha()
      .composite([{ input: maskSvg, blend: "dest-in" }])
      .flatten({ background: BG })
      .jpeg({ quality: 92 })
      .toBuffer();

    console.log(`${tag} preview-bake mask baked: ${slot.frameStyle} @ ${CANVAS_SIZE}×${CANVAS_SIZE}`);
  } else {
    finalBuffer = await sharp({
      create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: BG }
    })
    .composite([{ input: visibleSlice, left: destL, top: destT }])
    .jpeg({ quality: 92 })
    .toBuffer();
  }

  return finalBuffer;
}

/**
 * Builds the Kling input image by exactly reproducing the CSS ImageFill rendering
 * onto a square 1024×1024 JPEG canvas, uploads it to temp storage, and returns a
 * signed URL valid for 2 hours.
 *
 * CSS model reproduced (AlbumPageView.tsx / SceneComposition.tsx ImageFill):
 *
 *   [canvas: CANVAS_SIZE × CANVAS_SIZE, background: BG_CARD]
 *     [overflow:hidden container, SVG mask applied when frameStyle is set]
 *       [wrapper:
 *          width  = scale × CANVAS_SIZE
 *          height = scale × CANVAS_SIZE
 *          left   = (cropX − scale/2) × CANVAS_SIZE
 *          top    = (cropY − scale/2) × CANVAS_SIZE
 *          clipPath: inset(insetT insetR insetB insetL)  ← fractions of WRAPPER]
 *         [img: objectFit = contain (no frameStyle) | cover (frameStyle)]
 *
 * SceneComposition renders Kling video at 100%×100% (no re-applied crop math),
 * so the baked canvas represents the full page frame exactly.
 */
async function buildPreviewBakedKlingImage(
  slot: SlotImageData,
  tag: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  storageBucket: string
): Promise<string> {
  const buf = await buildPreviewBakedKlingImageBuffer(slot, tag);
  return uploadKlingAsset(buf, tag, adminClient, storageBucket);
}

/**
 * Builds a unified spread image for Kling by compositing both album pages
 * side by side at the exact Remotion spread geometry (1920×1080 default).
 *
 * Layout matches SceneComposition.tsx spread rendering exactly:
 *   - Left  page (second page / higher page number) at (leftMargin, topMargin)
 *   - Right page (primary page / lower page number) at (leftMargin + pageSize, topMargin)
 *   - Dark (#1a1a1a) background fills the video canvas around the pages
 *
 * Uploads the composite and returns a signed URL valid for 2 hours.
 */
async function buildSpreadKlingImage(
  rightSlot: SlotImageData | null,
  leftSlot: SlotImageData | null,
  tag: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  storageBucket: string,
  videoWidth: number,
  videoHeight: number,
): Promise<string> {
  const sharp = (await import("sharp")).default;
  // Dark background matching Remotion's spread AbsoluteFill background
  const BG_VIDEO  = { r: 26,  g: 26,  b: 26  }; // #1a1a1a
  const BG_PAGE   = { r: 246, g: 243, b: 233 }; // BG_CARD fallback for blank page

  // Compute Remotion spread geometry — must match SceneComposition.tsx exactly
  const pageSize   = Math.min(videoHeight, Math.floor(videoWidth / 2));
  const topMargin  = Math.floor((videoHeight - pageSize) / 2);
  const leftMargin = Math.floor((videoWidth  - pageSize * 2) / 2);

  console.log(
    `${tag} spread canvas=${videoWidth}×${videoHeight}` +
    ` pageSize=${pageSize} top=${topMargin} left=${leftMargin}`
  );

  // Bake each page to its 1024×1024 buffer then resize to video page size
  const blankBuf = await sharp({
    create: { width: pageSize, height: pageSize, channels: 3, background: BG_PAGE }
  }).jpeg({ quality: 92 }).toBuffer();

  const resize = async (buf: Buffer): Promise<Buffer> =>
    sharp(buf).resize(pageSize, pageSize, { fit: "fill" }).png().toBuffer();

  const rightResized = rightSlot
    ? await resize(await buildPreviewBakedKlingImageBuffer(rightSlot, `${tag}/right`))
    : blankBuf;

  const leftResized = leftSlot
    ? await resize(await buildPreviewBakedKlingImageBuffer(leftSlot, `${tag}/left`))
    : blankBuf;

  // Composite onto full video canvas (dark background, pages positioned as in Remotion)
  const spreadBuf = await sharp({
    create: { width: videoWidth, height: videoHeight, channels: 3, background: BG_VIDEO }
  })
  .composite([
    { input: leftResized,  left: leftMargin,            top: topMargin },
    { input: rightResized, left: leftMargin + pageSize,  top: topMargin },
  ])
  .jpeg({ quality: 92 })
  .toBuffer();

  console.log(`${tag} spread image built: ${(spreadBuf.byteLength / 1024).toFixed(0)} KB`);

  return uploadKlingAsset(spreadBuf, tag, adminClient, storageBucket);
}

// ── Page data resolution ──────────────────────────────────────────────────────

const DEFAULT_PAGE_DATA: ScenePageData = {
  layoutType: "FULL_IMAGE",
  textContent: null,
  textSize: null,
  fontSizePx: null,
  textAlign: "start",
  textX: null,
  textY: null,
  slot1: null,
  slot2: null,
};

/**
 * Resolves layout + image slot data for ALL pages in a scene.
 *
 * Returns one ScenePageData per page ID, in the same order as pageIds.
 * For spread scenes (2 page IDs) this returns 2 entries so both pages
 * can be rendered side by side.
 *
 * Batches DB queries across all pages for efficiency.
 */
async function fetchScenePageData(
  pageIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any
): Promise<ScenePageData[]> {
  if (pageIds.length === 0) return [DEFAULT_PAGE_DATA];

  // 1. Fetch all pages in this scene
  const { data: pages } = await adminClient
    .from("pages")
    .select(
      "id, layout_type, text_content, text_size, font_size_px, text_align, text_x, text_y, illustration_storage_path"
    )
    .in("id", pageIds);

  if (!pages || pages.length === 0) return [DEFAULT_PAGE_DATA];

  // Preserve pageIds order
  const pageMap = new Map<string, (typeof pages)[0]>();
  for (const p of pages) {
    pageMap.set(p.id as string, p);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderedPages: any[] = pageIds
    .map((id) => pageMap.get(id))
    .filter(Boolean);

  if (orderedPages.length === 0) return [DEFAULT_PAGE_DATA];

  // 2. Fetch page_images for ALL pages at once
  const { data: allPageImages } = await adminClient
    .from("page_images")
    .select("page_id, slot, photo_id, crop_x, crop_y, scale, frame_style, crop_inset_top, crop_inset_right, crop_inset_bottom, crop_inset_left")
    .in("page_id", pageIds)
    .in("slot", [1, 2]);

  // 3. Fetch illustration paths for referenced photos (deduplicated)
  const photoIds = (allPageImages ?? [])
    .filter((pi: { photo_id: string | null }) => pi.photo_id)
    .map((pi: { photo_id: string }) => pi.photo_id);

  const uniquePhotoIds = [...new Set(photoIds)];
  const photoIllustrationMap = new Map<string, string>();

  if (uniquePhotoIds.length > 0) {
    const { data: photos } = await adminClient
      .from("photos")
      .select("id, illustration_storage_path")
      .in("id", uniquePhotoIds);

    for (const photo of photos ?? []) {
      if (photo.illustration_storage_path) {
        photoIllustrationMap.set(
          photo.id as string,
          photo.illustration_storage_path as string
        );
      }
    }
  }

  // 4. Signed URL resolver
  async function resolveSlotUrl(
    illustrationPath: string
  ): Promise<string | null> {
    const { data } = await adminClient.storage
      .from("illustrations")
      .createSignedUrl(illustrationPath, 3600);
    return data?.signedUrl ?? null;
  }

  // 5. Build ScenePageData for each page
  const results: ScenePageData[] = [];

  for (const page of orderedPages) {
    const pid = page.id as string;

    // Filter page_images for this page
    const pageImages = (allPageImages ?? []).filter(
      (pi: { page_id: string }) => (pi.page_id as string) === pid
    );

    const slotMap = new Map<
      number,
      {
        crop_x: number;
        crop_y: number;
        scale: number;
        photo_id: string | null;
        frame_style: string | null;
        crop_inset_top: number;
        crop_inset_right: number;
        crop_inset_bottom: number;
        crop_inset_left: number;
      }
    >();
    for (const pi of pageImages) {
      slotMap.set(pi.slot as number, {
        crop_x: (pi.crop_x as number) ?? 0.5,
        crop_y: (pi.crop_y as number) ?? 0.5,
        scale: (pi.scale as number) ?? 1,
        photo_id: pi.photo_id as string | null,
        frame_style: (pi.frame_style as string | null) ?? null,
        crop_inset_top:    (pi.crop_inset_top    as number) ?? 0,
        crop_inset_right:  (pi.crop_inset_right  as number) ?? 0,
        crop_inset_bottom: (pi.crop_inset_bottom as number) ?? 0,
        crop_inset_left:   (pi.crop_inset_left   as number) ?? 0,
      });
    }

    async function buildSlot(slot: 1 | 2): Promise<SlotImageData | null> {
      const slotData = slotMap.get(slot);

      if (slotData?.photo_id) {
        const illustPath = photoIllustrationMap.get(slotData.photo_id);
        if (illustPath) {
          const url = await resolveSlotUrl(illustPath);
          if (url) {
            return {
              url,
              crop_x:   slotData.crop_x,
              crop_y:   slotData.crop_y,
              scale:    slotData.scale,
              frameStyle:      slotData.frame_style,
              cropInsetTop:    slotData.crop_inset_top,
              cropInsetRight:  slotData.crop_inset_right,
              cropInsetBottom: slotData.crop_inset_bottom,
              cropInsetLeft:   slotData.crop_inset_left,
            };
          }
        }
      }

      // Legacy fallback: slot 1 → pages.illustration_storage_path
      // Use (0.5, 0.5) so the legacy image is centered, matching the preview's
      // legacy (0, 0) → (0.5, 0.5) correction in resolveSlot().
      if (slot === 1 && page.illustration_storage_path) {
        const url = await resolveSlotUrl(
          page.illustration_storage_path as string
        );
        if (url) {
          return { url, crop_x: 0.5, crop_y: 0.5, scale: 1 };
        }
      }

      return null;
    }

    const [slot1, slot2] = await Promise.all([buildSlot(1), buildSlot(2)]);

    results.push({
      slot1,
      slot2,
      layoutType: (page.layout_type as string) ?? "FULL_IMAGE",
      textContent: (page.text_content as string | null) ?? null,
      textSize: (page.text_size as string | null) ?? null,
      fontSizePx: (page.font_size_px as number | null) ?? null,
      textAlign: (page.text_align as string) ?? "start",
      textX: (page.text_x as number | null) ?? null,
      textY: (page.text_y as number | null) ?? null,
    });
  }

  return results.length > 0 ? results : [DEFAULT_PAGE_DATA];
}

// ── Main render function ──────────────────────────────────────────────────────

/**
 * Renders a single film scene to an MP4 video and JPEG thumbnail.
 *
 * Steps:
 * 1. Fetch scene row + resolve page layout/image data
 * 2. Pass layout-faithful props to the Remotion composition
 * 3. Render video with renderMedia() — silent (no audio in this phase)
 * 4. Render thumbnail with renderStill() at ~80% of duration (late stable frame — past text/left-page reveal, before fade-out)
 * 5. Upload both to film storage
 * 6. Update film_scenes row (status, paths, render_hash)
 *
 * Storage paths (relative to "films" bucket — no bucket-name prefix):
 *   {orderId}/{filmProjectId}/scenes/{sceneId}/scene.mp4
 *   {orderId}/{filmProjectId}/scenes/{sceneId}/thumbnail.jpg
 */
export async function renderScene(
  input: RenderSceneInput
): Promise<RenderSceneResult> {
  const { sceneId, orderId, filmProjectId } = input;
  const fps = input.fps ?? filmEnv.defaultFps;
  const width = input.width ?? filmEnv.defaultWidth;
  const height = input.height ?? filmEnv.defaultHeight;

  const adminClient = createAdminClient();

  // Fetch scene
  const { data: sceneRow, error: sceneError } = await adminClient
    .from("film_scenes")
    .select("*")
    .eq("id", sceneId)
    .single();

  if (sceneError || !sceneRow) {
    throw new Error(`Scene not found: ${sceneId}`);
  }

  if ((sceneRow.film_project_id as string) !== filmProjectId) {
    throw new Error(
      `Scene ${sceneId} does not belong to film project ${filmProjectId}`
    );
  }

  try {
    const pageIds = (sceneRow.page_ids_json as string[]) ?? [];

    // Resolve page layout + slot image data for ALL pages in the scene
    const allPagesData = await fetchScenePageData(pageIds, adminClient);
    const primaryPage = allPagesData[0];
    const secondPage =
      allPagesData.length >= 2 ? allPagesData[1] : null;
    const isSpread = secondPage !== null;

    // ── Kling page video generation ───────────────────────────────────────
    //
    // If KIE_API_KEY is configured, generate a Kling 2.6 video for each page.
    //
    // FULL_IMAGE / FULL_IMAGE_TEXT_TOP / FULL_IMAGE_TEXT_CENTER:
    //   buildPreviewBakedKlingImage() — exact CSS preview reproduction.
    //   The preview is the source of truth; crop math is NOT authoritative here.
    //
    // Other layouts:
    //   prepareCroppedImageForKling() — legacy visible-region extraction.
    //
    // Existing Kling paths are reused (no regeneration unless cleared).
    // To force re-generation after a crop change, clear right_page_video_path
    // and/or left_page_video_path — the next render will re-generate.
    //
    // Failures are non-fatal — fall back to static image silently.

    const storageBucket = filmEnv.storageBucket ?? "films";
    let rightKlingUrl: string | null = null;
    let leftKlingUrl:  string | null = null;
    // Track the actual resolved Kling storage paths for this run.
    // Hoisted outside the KIE block so the render hash and re-fetch can access them.
    let resolvedRightKlingPath:  string | null = null;
    let resolvedLeftKlingPath:   string | null = null;
    let resolvedSpreadKlingPath: string | null = null;
    let spreadKlingUrl:          string | null = null;

    // Unified spread: one panoramic Kling video spanning both pages.
    // Only valid for 2-page spread scenes with is_unified_spread = true.
    const isUnifiedSpread = Boolean(sceneRow.is_unified_spread) && isSpread;

    if (process.env.KIE_API_KEY) {
      if (isUnifiedSpread) {
        // ── Unified spread: ONE video spanning both pages ──────────────────
        // The spread video is generated from a composite image that reproduces
        // the exact Remotion open-book layout (left page | right page side by side).
        // Cached in spread_video_path — cleared when the toggle is turned off.
        console.log(`[film-render] Unified spread mode — generating one spread Kling video`);
        let spreadPath = (sceneRow.spread_video_path as string | null) ?? null;
        if (spreadPath) {
          console.log(`[film-render] Spread Kling video cached → ${spreadPath}`);
        } else {
          const rightSlot = primaryPage.slot1 ?? primaryPage.slot2 ?? null;
          const leftSlot  = secondPage!.slot1  ?? secondPage!.slot2  ?? null;
          try {
            const spreadImageUrl = await buildSpreadKlingImage(
              rightSlot, leftSlot,
              "[film-render/spread]",
              adminClient, storageBucket,
              width, height,
            );
            spreadPath = await generatePageVideo({
              imageUrl:      spreadImageUrl,
              side:          "spread",
              orderId,
              filmProjectId,
              sceneId,
            });
            if (spreadPath) {
              await adminClient
                .from("film_scenes")
                .update({ spread_video_path: spreadPath, updated_at: new Date().toISOString() })
                .eq("id", sceneId);
            }
          } catch (spreadErr) {
            console.warn(
              `[film-render] Spread Kling generation failed — falling back to static images:`,
              spreadErr instanceof Error ? spreadErr.message : String(spreadErr)
            );
          }
        }
        resolvedSpreadKlingPath = spreadPath;
        if (spreadPath) {
          const { data } = await adminClient.storage.from(storageBucket).createSignedUrl(spreadPath, 3600);
          spreadKlingUrl = data?.signedUrl ?? null;
          if (!spreadKlingUrl) console.warn(`[film-render] Failed to create signed URL for spread path: ${spreadPath}`);
        }
        // Unified spread: do NOT generate separate per-page right/left Kling videos.
        // rightKlingUrl and leftKlingUrl remain null — SceneComposition uses spreadVideoUrl.
      } else {
        // ── Normal per-page Kling generation ────────────────────────────────
        const rightPageId = pageIds[0] ?? "(none)";
        const leftPageId  = pageIds[1] ?? "(none)";
        console.log(`[film-render] Kling pages — right: ${rightPageId}, left: ${isSpread ? leftPageId : "n/a (single-page)"}`);

        // ── Right page ────────────────────────────────────────────────────
        // FULL_IMAGE-style layouts use buildPreviewBakedKlingImage() — exact
        // CSS preview reproduction. Other layouts use the legacy extraction path.
        const rightSlot = primaryPage.slot1 ?? primaryPage.slot2 ?? null;
        let rightImageUrl: string | null = null;
        if (rightSlot) {
          try {
            rightImageUrl = FULL_IMAGE_BAKE_LAYOUTS.has(primaryPage.layoutType)
              ? await buildPreviewBakedKlingImage(rightSlot, "[film-render/right]", adminClient, storageBucket)
              : await prepareCroppedImageForKling(rightSlot, "[film-render/right]", adminClient, storageBucket);
          } catch (cropErr) {
            console.warn(
              `[film-render] Right page crop-for-Kling failed — falling back to raw illustration URL:`,
              cropErr instanceof Error ? cropErr.message : String(cropErr)
            );
            rightImageUrl = rightSlot.url;
          }
        }
        let rightPath = (sceneRow.right_page_video_path as string | null) ?? null;
        if (rightPath) {
          console.log(`[film-render] Right page Kling video cached → ${rightPath}`);
        } else if (rightImageUrl) {
          console.log(`[film-render] Generating Kling video for right page (pageId=${rightPageId})`);
          rightPath = await generatePageVideo({
            imageUrl:      rightImageUrl,
            side:          "right",
            orderId,
            filmProjectId,
            sceneId,
          });
          if (rightPath) {
            await adminClient
              .from("film_scenes")
              .update({ right_page_video_path: rightPath, updated_at: new Date().toISOString() })
              .eq("id", sceneId);
          }
        } else {
          console.log(`[film-render] Right page has no resolved image — skipping Kling, using static fallback`);
        }
        resolvedRightKlingPath = rightPath;
        if (rightPath) {
          const { data } = await adminClient.storage.from(storageBucket).createSignedUrl(rightPath, 3600);
          rightKlingUrl = data?.signedUrl ?? null;
          if (!rightKlingUrl) console.warn(`[film-render] Failed to create signed URL for right Kling path: ${rightPath}`);
        }

        // ── Left page ──────────────────────────────────────────────────────
        if (secondPage) {
          const leftSlot = secondPage.slot1 ?? secondPage.slot2 ?? null;
          let leftImageUrl: string | null = null;
          if (leftSlot) {
            try {
              leftImageUrl = FULL_IMAGE_BAKE_LAYOUTS.has(secondPage.layoutType)
                ? await buildPreviewBakedKlingImage(leftSlot, "[film-render/left]", adminClient, storageBucket)
                : await prepareCroppedImageForKling(leftSlot, "[film-render/left]", adminClient, storageBucket);
            } catch (cropErr) {
              console.warn(
                `[film-render] Left page crop-for-Kling failed — falling back to raw illustration URL:`,
                cropErr instanceof Error ? cropErr.message : String(cropErr)
              );
              leftImageUrl = leftSlot.url;
            }
          }
          let leftPath = (sceneRow.left_page_video_path as string | null) ?? null;
          if (leftPath) {
            console.log(`[film-render] Left page Kling video cached → ${leftPath}`);
          } else if (leftImageUrl) {
            console.log(`[film-render] Generating Kling video for left page (pageId=${leftPageId})`);
            leftPath = await generatePageVideo({
              imageUrl:      leftImageUrl,
              side:          "left",
              orderId,
              filmProjectId,
              sceneId,
            });
            if (leftPath) {
              await adminClient
                .from("film_scenes")
                .update({ left_page_video_path: leftPath, updated_at: new Date().toISOString() })
                .eq("id", sceneId);
            }
          } else {
            console.log(`[film-render] Left page has no resolved image — skipping Kling, using static fallback`);
          }
          resolvedLeftKlingPath = leftPath;
          if (leftPath) {
            const { data } = await adminClient.storage.from(storageBucket).createSignedUrl(leftPath, 3600);
            leftKlingUrl = data?.signedUrl ?? null;
            if (!leftKlingUrl) console.warn(`[film-render] Failed to create signed URL for left Kling path: ${leftPath}`);
          }
        }
      }
    } else {
      console.log(`[film-render] KIE_API_KEY not set — skipping Kling generation, using static fallback`);
    }

    // ── Derive page type from spread key ─────────────────────────────────
    // Cover, dedication, and back_cover scenes have page_spread_key matching
    // their page_type. Content spreads have keys like "spread_01".
    const spreadKey = (sceneRow.page_spread_key as string | null) ?? "";
    const specialTypes = new Set(["cover", "dedication", "back_cover"]);
    const pageType: string | null = specialTypes.has(spreadKey) ? spreadKey : null;

    // ── Fetch person name (for cover rendering) ───────────────────────────
    // person_name is a direct column on the orders table.
    let personName: string | null = null;
    if (pageType === "cover") {
      const { data: orderRow } = await adminClient
        .from("orders")
        .select("person_name")
        .eq("id", orderId)
        .single();
      personName = (orderRow?.person_name as string | null) ?? null;
    }

    // ── Re-fetch scene row for the freshest Kling paths ──────────────────────
    // The initial sceneRow was fetched at the very start of renderScene.
    // If Kling paths were saved to DB during this run (or by a concurrent process),
    // refresh resolved paths and signed URLs before building compositionProps.
    {
      const { data: freshRow } = await adminClient
        .from("film_scenes")
        .select("right_page_video_path, left_page_video_path, spread_video_path")
        .eq("id", sceneId)
        .single();

      const freshRightPath  = (freshRow?.right_page_video_path  as string | null) ?? null;
      const freshLeftPath   = (freshRow?.left_page_video_path   as string | null) ?? null;
      const freshSpreadPath = (freshRow?.spread_video_path       as string | null) ?? null;

      if (freshRightPath && freshRightPath !== resolvedRightKlingPath) {
        resolvedRightKlingPath = freshRightPath;
        rightKlingUrl = null; // force signed URL refresh below
      }
      if (freshLeftPath && freshLeftPath !== resolvedLeftKlingPath) {
        resolvedLeftKlingPath = freshLeftPath;
        leftKlingUrl = null; // force signed URL refresh below
      }
      if (freshSpreadPath && freshSpreadPath !== resolvedSpreadKlingPath) {
        resolvedSpreadKlingPath = freshSpreadPath;
        spreadKlingUrl = null; // force signed URL refresh below
      }

      // Ensure valid signed URLs for all resolved paths (retry on initial failure)
      if (resolvedRightKlingPath && !rightKlingUrl) {
        const { data } = await adminClient.storage.from(storageBucket).createSignedUrl(resolvedRightKlingPath, 3600);
        rightKlingUrl = data?.signedUrl ?? null;
        if (!rightKlingUrl) console.warn(`[film-render] Pre-render: signed URL failed for right path: ${resolvedRightKlingPath}`);
      }
      if (resolvedLeftKlingPath && !leftKlingUrl) {
        const { data } = await adminClient.storage.from(storageBucket).createSignedUrl(resolvedLeftKlingPath, 3600);
        leftKlingUrl = data?.signedUrl ?? null;
        if (!leftKlingUrl) console.warn(`[film-render] Pre-render: signed URL failed for left path: ${resolvedLeftKlingPath}`);
      }
      if (resolvedSpreadKlingPath && !spreadKlingUrl) {
        const { data } = await adminClient.storage.from(storageBucket).createSignedUrl(resolvedSpreadKlingPath, 3600);
        spreadKlingUrl = data?.signedUrl ?? null;
        if (!spreadKlingUrl) console.warn(`[film-render] Pre-render: signed URL failed for spread path: ${resolvedSpreadKlingPath}`);
      }
    }

    // ── Narration audio signed URL ────────────────────────────────────────────
    // Bake the narration MP3 directly into the scene video via Remotion <Audio>.
    // This eliminates the separate ffmpeg mux step during final assembly.
    const audioPath = (sceneRow.audio_path as string | null) ?? null;
    let narrationUrl: string | null = null;
    if (audioPath) {
      const { data: audioData } = await adminClient.storage.from(storageBucket).createSignedUrl(audioPath, 3600);
      narrationUrl = audioData?.signedUrl ?? null;
      if (!narrationUrl) {
        console.warn(`[film-render] Failed to create signed URL for narration audio: ${audioPath}`);
      } else {
        console.log(`[film-render] Narration audio signed URL created for: ${audioPath}`);
      }
    } else {
      console.log(`[film-render] No narration audio for scene ${sceneId} — rendering silent`);
    }

    // Build render hash using the FRESH resolved Kling paths from this run.
    // Previously this read from the stale sceneRow snapshot (fetched before
    // Kling generation), which produced the same hash as the pre-Kling render
    // and caused the scene to overwrite its own path with stale hash metadata.
    const renderHash = buildRenderHash({
      narrationText: sceneRow.narration_text as string | null,
      voiceId: sceneRow.voice_id as string | null,
      motionPreset: sceneRow.motion_preset as string | null,
      transitionIn: sceneRow.transition_in as string | null,
      transitionOut: sceneRow.transition_out as string | null,
      pageIds,
      klingRightPath:  isUnifiedSpread ? null : resolvedRightKlingPath,
      klingLeftPath:   isUnifiedSpread ? null : resolvedLeftKlingPath,
      klingSpreadPath: isUnifiedSpread ? resolvedSpreadKlingPath : null,
    });

    // Compute duration
    const durationMs = (sceneRow.duration_ms as number | null) ?? 5000;
    const durationInFrames = Math.max(1, Math.round((durationMs / 1000) * fps));

    // Composition props — layout-faithful, matching SceneCompositionProps
    const compositionProps = {
      slot1: primaryPage.slot1,
      slot2: primaryPage.slot2,
      layoutType: primaryPage.layoutType,
      textContent: primaryPage.textContent,
      textSize: primaryPage.textSize,
      fontSizePx: primaryPage.fontSizePx,
      textAlign: primaryPage.textAlign,
      textX: primaryPage.textX,
      textY: primaryPage.textY,
      // Kling video for the right (primary) page — null → static resolved image.
      // For unified spread scenes rightKlingUrl is always null (spread video used instead).
      klingVideoUrl: rightKlingUrl,
      // Spread: merge left-page Kling URL into secondPage data.
      // For unified spread scenes leftKlingUrl is always null.
      secondPage: secondPage
        ? { ...secondPage, klingVideoUrl: leftKlingUrl }
        : null,
      // Unified spread: one Kling video that spans both pages.
      // When set, SceneComposition renders it as a full-width background behind both pages.
      spreadVideoUrl: isUnifiedSpread ? spreadKlingUrl : null,
      motionPreset:
        (sceneRow.motion_preset as string) === "ken_burns"
          ? "ken_burns"
          : ("static" as const),
      transitionIn:
        (sceneRow.transition_in as string) === "fade" ? "fade" : ("none" as const),
      transitionOut:
        (sceneRow.transition_out as string) === "fade" ? "fade" : ("none" as const),
      narrationDurationMs:
        (sceneRow.audio_duration_ms as number | null) ?? null,
      // Signed URL to narration MP3 — baked into the scene video via Remotion <Audio>.
      narrationUrl,
      // Special page type — triggers cover/dedication/back_cover layouts.
      // Null for standard content spreads.
      pageType,
      // Person name fetched from orders table — shown on cover page.
      personName,
    };

    // ── Pre-render inputs summary (critical debug) ───────────────────────────
    {
      const fmtSlot = (s: SlotImageData | null, label: string) => {
        if (!s) return `${label}=none`;
        const cx = s.crop_x, cy = s.crop_y, sc = s.scale;
        const fs = s.frameStyle ?? "-";
        return `${label}: crop=(${cx.toFixed(2)},${cy.toFixed(2)}) scale=${sc.toFixed(2)} frame=${fs}`;
      };
      const rightMode = isUnifiedSpread
        ? (spreadKlingUrl ? "unified-spread-kling" : "unified-spread-static")
        : (rightKlingUrl  ? "kling-video-in-frame" : "static-image-in-frame");
      const leftMode  = isUnifiedSpread
        ? "unified-spread-shared"
        : isSpread
          ? (leftKlingUrl ? "kling-video-in-frame" : "static-image-in-frame")
          : "n/a";
      console.log(
        `[film-render] FINAL INPUTS sceneId=${sceneId}`,
        `| right=${rightMode}`,
        `| left=${leftMode}`,
        `| ${fmtSlot(primaryPage.slot1, "right-slot1")}`,
        isSpread ? `| ${fmtSlot(secondPage!.slot1, "left-slot1")}` : "",
        `| hash=${renderHash}`
      );
    }

    // Resolve pre-built bundle path
    const serveUrl = getBundlePath();

    // Dynamic import of renderer (avoids parse-time failure on Vercel)
    const { renderMedia, renderStill, selectComposition } = await import(
      "@remotion/renderer"
    );

    const composition = await selectComposition({
      serveUrl,
      id: "Scene",
      inputProps: compositionProps,
    });

    const compositionWithDuration = {
      ...composition,
      durationInFrames,
      fps,
      width,
      height,
    };

    // Temp output paths
    const tmpDir = os.tmpdir();
    const tmpVideo = path.join(
      tmpDir,
      `vitae-scene-${sceneId}-${Date.now()}.mp4`
    );
    const tmpThumb = path.join(
      tmpDir,
      `vitae-thumb-${sceneId}-${Date.now()}.jpg`
    );

    try {
      // Render video (narration audio baked in via Remotion <Audio> when narrationUrl is set)
      console.log(
        `[film-render] Rendering scene ${sceneId} (${durationInFrames} frames @ ${fps}fps, layout: ${primaryPage.layoutType}, ${isSpread ? "spread" : "single-page"})`
      );
      await renderMedia({
        composition: compositionWithDuration,
        serveUrl,
        codec: "h264",
        outputLocation: tmpVideo,
        inputProps: compositionProps,
      });

      // Render thumbnail from the late stable part of the scene:
      // - target 80% (past text reveal at 65% and left-page activation for spreads)
      // - clamp before fade-out (last FADE_FRAMES frames)
      const FADE_FRAMES = 15; // matches SceneComposition constant
      const fadeOutStart = Math.max(0, durationInFrames - FADE_FRAMES);
      const thumbFrame = Math.min(Math.round(durationInFrames * 0.80), Math.max(0, fadeOutStart - 1));
      console.log(`[film-render] Rendering thumbnail at frame ${thumbFrame}`);
      await renderStill({
        composition: compositionWithDuration,
        serveUrl,
        output: tmpThumb,
        imageFormat: "jpeg",
        frame: thumbFrame,
        inputProps: compositionProps,
      });

      // Upload both to film storage
      const videoBuffer = await fs.readFile(tmpVideo);
      const thumbBuffer = await fs.readFile(tmpThumb);

      // Versioned paths — render hash ensures each unique render produces a new file.
      // The DB rendered_scene_path always points to the latest hash, so the site
      // never serves a stale cached version after re-renders.
      const videoStoragePath = `${orderId}/${filmProjectId}/scenes/${sceneId}/scene-${renderHash}.mp4`;
      const thumbStoragePath = `${orderId}/${filmProjectId}/scenes/${sceneId}/thumb-${renderHash}.jpg`;

      await uploadFilmAsset(videoStoragePath, videoBuffer, "video/mp4");
      await uploadFilmAsset(thumbStoragePath, thumbBuffer, "image/jpeg");

      // Update scene record
      const actualDurationMs = Math.round((durationInFrames / fps) * 1000);
      await adminClient
        .from("film_scenes")
        .update({
          status: "rendered",
          rendered_scene_path: videoStoragePath,
          thumbnail_path: thumbStoragePath,
          render_hash: renderHash,
          duration_ms: actualDurationMs,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);

      const rightSrc = rightKlingUrl ? "kling" : "static";
      const leftSrc  = isSpread ? (leftKlingUrl ? "kling" : "static") : "n/a";
      console.log(
        `[film-render] Scene ${sceneId} rendered successfully`,
        `→ site reads: ${videoStoragePath}`,
        `| right=${rightSrc}, left=${leftSrc}`
      );

      return {
        renderedPath: videoStoragePath,
        thumbnailPath: thumbStoragePath,
        durationMs: actualDurationMs,
        renderHash,
      };
    } finally {
      // Clean up temp files (best-effort)
      await fs.unlink(tmpVideo).catch(() => {});
      await fs.unlink(tmpThumb).catch(() => {});
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    let message = raw;
    if (raw.includes("REMOTION_BUNDLE_PATH") || raw.includes(REMOTION_BUNDLE_DIR)) {
      // Already a clear message from getBundlePath() — pass through as-is.
    } else if (
      raw.includes("Chrome") ||
      raw.includes("Chromium") ||
      raw.includes("puppeteer") ||
      raw.includes("browser")
    ) {
      message = `[film-render] Chrome not found. Rendering requires a Node.js environment with Chrome installed (not available on Vercel serverless). Original error: ${raw}`;
    } else {
      message = `[film-render] Render failed: ${raw}`;
    }
    console.error(`[film-render] Scene ${sceneId} failed: ${message}`);

    await adminClient
      .from("film_scenes")
      .update({
        status: "error",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);

    throw err;
  }
}
