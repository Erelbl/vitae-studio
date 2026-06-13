/**
 * Shared logic for the "floating cross-spread image" layer used by the album
 * preview's full-image pages — and now also by the print/JPG export pipeline
 * (`export-album-pdf.ts`) so the two stay in sync.
 *
 * In `AlbumPreview` (src/components/album/AlbumPreview.tsx), full-image-layout
 * pages render their slot-1 image via an absolutely-positioned layer anchored
 * to the page's half of the spread with `overflow: visible`. This lets an
 * admin scale/pan an image so it bleeds across the spine into the
 * neighbouring page — an intentional "spanning image" effect.
 *
 * `isFullImagePage` mirrors the set of page types/layouts AlbumPreview treats
 * this way. `computeFloatingImageBox` mirrors the position math from
 * AlbumPreview's floating layer (see the `flatMap` block building `fi-*`
 * elements there) so exported spreads bleed identically instead of being
 * clipped per-page.
 */

import type { PreviewPage } from "@/types/page";

/**
 * Layouts where the image fills the entire page — see AlbumPreview's
 * `FULL_IMAGE_LAYOUT_SET` for the canonical definition this mirrors.
 */
export const FULL_IMAGE_LAYOUT_SET = new Set([
  "FULL_IMAGE",
  "FULL_IMAGE_TEXT_TOP",
  "FULL_IMAGE_TEXT_CENTER",
]);

/** Mirrors AlbumPreview.isFullImagePage(). */
export function isFullImagePage(page: PreviewPage): boolean {
  if (["cover", "dedication", "back_cover"].includes(page.page_type)) return true;
  return FULL_IMAGE_LAYOUT_SET.has(page.layout_type ?? "FULL_IMAGE");
}

/** Resolved slot-1 image params, as returned by each renderer's `resolveSlot`. */
export interface ResolvedImageSlot {
  url: string | null;
  cropX: number;
  cropY: number;
  scale: number;
  insetTop: number;
  insetRight: number;
  insetBottom: number;
  insetLeft: number;
}

export interface FloatingImageBoxStyles {
  /** Style for the anchor element, positioned relative to the spread container. */
  anchor: Record<string, string | number>;
  /** Style for the image-exact wrapper inside the anchor (crop/scale/inset). */
  wrapper: Record<string, string | number>;
}

/**
 * Computes the position/size of a full-image page's slot-1 image relative to
 * the 2-page spread container, allowing it to bleed across the spine.
 *
 * - Two-page spreads: the anchor covers one page's half of the spread
 *   (`width: 50%`, anchored `left`/`right`) — matches AlbumPreview, whose
 *   spread container always spans two page-widths.
 * - Singleton spreads (cover/back_cover alone): the anchor covers the full
 *   spread (`width: 100%`) since the export's singleton spread container is
 *   only one page-width wide.
 */
export function computeFloatingImageBox(
  slot: Pick<ResolvedImageSlot, "cropX" | "cropY" | "scale" | "insetTop" | "insetRight" | "insetBottom" | "insetLeft">,
  position: { isRight: boolean; isSingleton: boolean },
  zIndex: number | string = 2
): FloatingImageBoxStyles {
  const s = Math.max(0.1, slot.scale);
  const hasInset = slot.insetTop > 0 || slot.insetRight > 0 || slot.insetBottom > 0 || slot.insetLeft > 0;

  const anchor: Record<string, string | number> = {
    position: "absolute",
    top: "0",
    bottom: "0",
    width: position.isSingleton ? "100%" : "50%",
    overflow: "visible",
    zIndex,
  };
  if (position.isSingleton || !position.isRight) {
    anchor.left = "0";
  } else {
    anchor.right = "0";
  }

  const wrapper: Record<string, string | number> = {
    position: "absolute",
    width: `${s * 100}%`,
    height: `${s * 100}%`,
    left: `${(slot.cropX - s / 2) * 100}%`,
    top: `${(slot.cropY - s / 2) * 100}%`,
  };
  if (hasInset) {
    wrapper.clipPath = `inset(${slot.insetTop * 100}% ${slot.insetRight * 100}% ${slot.insetBottom * 100}% ${slot.insetLeft * 100}%)`;
  }

  return { anchor, wrapper };
}
