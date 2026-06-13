/**
 * Client-side album PDF export using DOM snapshots.
 *
 * Renders each spread/cover as a hidden DOM element, captures it with
 * html2canvas-pro, then assembles into a jsPDF document.
 *
 * Output:
 *   - Cover page (square)
 *   - Inner spreads (2:1 landscape — two pages side by side)
 *   - Back cover (square)
 *
 * This matches what the user sees in the AlbumPreview exactly.
 */

import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import type { PreviewData, PreviewPage, LayoutType, PageImageSlot } from "@/types/page";
import { parseCoverText } from "@/components/album/AlbumPageView";
import {
  isFullImagePage,
  computeFloatingImageBox,
  type ResolvedImageSlot,
} from "@/lib/album-spread-image";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Render size for each page square (px). Higher = better quality but slower.
 *  1200 → html2canvas at scale:2 yields 2400px ≈ 289 DPI for a 25 cm page.
 */
const PAGE_SIZE_PX = 1200;

/** Physical album page size in mm (25 cm = 250 mm). */
const PAGE_MM = 250;

/**
 * JPEG quality for the print-ready spread export (0–1). 0.92 sits in the
 * 90–95 "high quality" range with a reasonable file size for a ZIP of ~20 spreads.
 */
const JPG_QUALITY = 0.92;

/**
 * Approximate pixel width of one album page as seen in the admin editor preview.
 * Admin layout: max-w-6xl (1152px) – px-4 (32px) – controls col (380px) – gap-6 (24px) = 716px
 * AlbumPreview uses grid-cols-2 for spreads → each page ≈ 358px.
 * Font sizes and paddings in AlbumPageView are sized for this reference width.
 */
const PREVIEW_REFERENCE_PX = 358;

/**
 * Multiply all preview px values by this factor to match the PDF render container.
 * ≈ 3.35 — prevents text appearing ~3× smaller in the PDF than in the preview.
 */
const PDF_SCALE = PAGE_SIZE_PX / PREVIEW_REFERENCE_PX;

/** Scale a preview-sized px value to the PDF render size, returning a CSS string. */
function sp(px: number): string {
  return `${Math.round(px * PDF_SCALE)}px`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Spread = [PreviewPage, PreviewPage | null];

// ─── Spread builder (mirrors AlbumPreview.buildSpreads) ─────────────────────

function buildSpreads(pages: PreviewPage[]): Spread[] {
  const spreads: Spread[] = [];
  let i = 0;
  while (i < pages.length) {
    const page = pages[i];
    if (page.page_type === "cover" || page.page_type === "back_cover") {
      spreads.push([page, null]);
      i += 1;
    } else {
      spreads.push([pages[i], pages[i + 1] ?? null]);
      i += 2;
    }
  }
  return spreads;
}

// ─── DOM builders ───────────────────────────────────────────────────────────

/** Resolve a slot's image URL + crop params, matching AlbumPageView.resolveSlot. */
function resolveSlot(
  page: PreviewPage,
  slot: 1 | 2
): ResolvedImageSlot {
  const slotData = (page.images ?? []).find((i: PageImageSlot) => i.slot === slot);
  if (slotData) {
    const isLegacyZero = slotData.crop_x === 0 && slotData.crop_y === 0;
    return {
      url: slotData.image_url,
      cropX: isLegacyZero ? 0.5 : slotData.crop_x,
      cropY: isLegacyZero ? 0.5 : slotData.crop_y,
      scale: slotData.scale,
      insetTop:    slotData.crop_inset_top    ?? 0,
      insetRight:  slotData.crop_inset_right  ?? 0,
      insetBottom: slotData.crop_inset_bottom ?? 0,
      insetLeft:   slotData.crop_inset_left   ?? 0,
    };
  }
  if (slot === 1) {
    return { url: page.image_url, cropX: 0.5, cropY: 0.5, scale: 1, insetTop: 0, insetRight: 0, insetBottom: 0, insetLeft: 0 };
  }
  return { url: null, cropX: 0.5, cropY: 0.5, scale: 1, insetTop: 0, insetRight: 0, insetBottom: 0, insetLeft: 0 };
}

/** Resolve font size from legacy enum or numeric px, scaled to the PDF render size. */
function resolveTextSize(textSize?: string | null, fontSizePx?: number | null): string {
  let base: number;
  if (fontSizePx != null && fontSizePx > 0) {
    base = fontSizePx;
  } else {
    switch (textSize) {
      case "sm": base = 12; break;
      case "lg": base = 18; break;
      case "xl": base = 22; break;
      default:   base = 15;
    }
  }
  return sp(base);
}

/** Build a full-bleed image element for a page. */
function buildImageFill(
  url: string,
  cropX: number,
  cropY: number,
  scale: number,
  container: HTMLElement,
  insetTop = 0,
  insetRight = 0,
  insetBottom = 0,
  insetLeft = 0
) {
  // Outer wrapper: fills the container, clips overflow for pan/zoom.
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
  });

  const s = Math.max(0.1, scale);
  const hasInset = insetTop > 0 || insetRight > 0 || insetBottom > 0 || insetLeft > 0;

  // Image-exact wrapper: same position/size as the image — clip-path applied HERE
  // so inset percentages are relative to the image's own bounds, not the container.
  const imgWrapper = document.createElement("div");
  Object.assign(imgWrapper.style, {
    position: "absolute",
    width: `${s * 100}%`,
    height: `${s * 100}%`,
    left: `${(cropX - s / 2) * 100}%`,
    top: `${(cropY - s / 2) * 100}%`,
    ...(hasInset ? { clipPath: `inset(${insetTop * 100}% ${insetRight * 100}% ${insetBottom * 100}% ${insetLeft * 100}%)` } : {}),
  });

  const img = document.createElement("img");
  img.crossOrigin = "anonymous";
  img.src = url;
  Object.assign(img.style, {
    width: "100%",
    height: "100%",
    maxWidth: "none",
    objectFit: "contain",
  });

  imgWrapper.appendChild(img);
  wrapper.appendChild(imgWrapper);
  container.appendChild(wrapper);
  return img;
}

/** Build a text overlay at the bottom of a page (gradient). */
function buildTextOverlay(
  text: string,
  page: PreviewPage,
  position: "bottom" | "top" | "center",
  container: HTMLElement
) {
  const fontSize = resolveTextSize(
    page.text_size as string | null,
    page.font_size_px
  );
  const align = page.text_align ?? "center";
  const isBlack = page.text_color === "black";
  const color = isBlack ? "#1a1a1a" : "white";
  const shadow = isBlack
    ? "0 1px 2px rgba(255,255,255,0.7)"
    : "0 1px 4px rgba(0,0,0,0.6)";
  const lh = String(page.line_height ?? 1.4);
  const widthPct = page.text_width_pct != null ? `${page.text_width_pct}%` : "84%";

  // Custom position (admin-dragged)
  if (page.text_x != null && page.text_y != null) {
    const outer = document.createElement("div");
    Object.assign(outer.style, {
      position: "absolute",
      inset: "0",
      zIndex: "10",
    });
    const inner = document.createElement("div");
    Object.assign(inner.style, {
      position: "absolute",
      left: `${page.text_x * 100}%`,
      top: `${page.text_y * 100}%`,
      transform: "translate(-50%, -50%)",
      width: widthPct,
      textAlign: align,
    });
    const p = document.createElement("p");
    Object.assign(p.style, {
      fontFamily: "YardenAlbum, serif",
      fontSize,
      textAlign: align,
      color,
      textShadow: shadow,
      whiteSpace: "pre-line",
      lineHeight: lh,
      maxWidth: widthPct,
    });
    p.textContent = text;
    inner.appendChild(p);
    outer.appendChild(inner);
    container.appendChild(outer);
    return;
  }

  const overlay = document.createElement("div");
  if (position === "bottom") {
    Object.assign(overlay.style, {
      position: "absolute",
      left: "0",
      right: "0",
      bottom: "0",
      background: "linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0.4), transparent)",
      padding: `${sp(64)} ${sp(20)} ${sp(24)} ${sp(20)}`,
      zIndex: "10",
    });
  } else if (position === "top") {
    Object.assign(overlay.style, {
      position: "absolute",
      left: "0",
      right: "0",
      top: "0",
      background: "linear-gradient(to bottom, rgba(0,0,0,0.72), rgba(0,0,0,0.4), transparent)",
      padding: `${sp(24)} ${sp(20)} ${sp(64)} ${sp(20)}`,
      zIndex: "10",
    });
  } else {
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: sp(24),
      zIndex: "10",
    });
  }

  const p = document.createElement("p");
  Object.assign(p.style, {
    fontFamily: "YardenAlbum, serif",
    fontSize,
    textAlign: align,
    color,
    textShadow: shadow,
    whiteSpace: "pre-line",
    lineHeight: lh,
    maxWidth: widthPct,
    marginLeft: "auto",
    marginRight: "auto",
  });
  p.textContent = text;

  if (position === "center") {
    const pill = document.createElement("div");
    const pillWidth = page.text_width_pct != null ? `${page.text_width_pct}%` : "86%";
    Object.assign(pill.style, {
      background: "rgba(0,0,0,0.45)",
      backdropFilter: "blur(6px)",
      borderRadius: sp(16),
      padding: `${sp(16)} ${sp(20)}`,
      maxWidth: pillWidth,
      textAlign: align,
    });
    pill.appendChild(p);
    overlay.appendChild(pill);
  } else {
    overlay.appendChild(p);
  }
  container.appendChild(overlay);
}

/** Map layout_type to the text overlay position for full-image layouts. */
function getOverlayPosition(layout: string): "bottom" | "top" | "center" | null {
  switch (layout) {
    case "FULL_IMAGE": return "bottom";
    case "FULL_IMAGE_TEXT_TOP": return "top";
    case "FULL_IMAGE_TEXT_CENTER": return "center";
    default: return null;
  }
}

/**
 * Result of building a single page's DOM element.
 *
 * `floatingSlot1` is non-null when the page is a "full-image" page (cover,
 * dedication, back_cover, or a FULL_IMAGE* layout) with a slot-1 image. These
 * images are NOT drawn inside `el` (which clips with `overflow: hidden`) —
 * instead the caller renders them via a spread-relative floating layer (see
 * `buildFloatingImageLayer`) so they can bleed across the spine, matching
 * AlbumPreview.
 */
interface PageElementResult {
  el: HTMLElement;
  floatingSlot1: ResolvedImageSlot | null;
}

/** Build a single page square DOM element. */
function buildPageElement(page: PreviewPage, personName: string): PageElementResult {
  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "relative",
    width: `${PAGE_SIZE_PX}px`,
    height: `${PAGE_SIZE_PX}px`,
    overflow: "hidden",
    backgroundColor: page.bg_color ?? "#FAF8F2", // bg-secondary default
    direction: "rtl",
    flexShrink: "0",
  });

  const layout = (page.layout_type ?? "FULL_IMAGE") as LayoutType;
  const slot1 = resolveSlot(page, 1);
  const floatingSlot1 = isFullImagePage(page) && slot1.url ? slot1 : null;

  // Cover page
  if (page.page_type === "cover") {
    const hasImage = Boolean(slot1.url);
    // Gradient overlay — zIndex 10 so it stays above the floating cross-spread
    // image layer (zIndex 2), matching CoverPage in AlbumPageView.
    const grad = document.createElement("div");
    Object.assign(grad.style, {
      position: "absolute",
      inset: "0",
      zIndex: "10",
      background: hasImage
        ? "linear-gradient(to bottom, rgba(0,0,0,0.22) 0%, transparent 45%, rgba(0,0,0,0.30) 100%)"
        : "linear-gradient(135deg, rgba(143,159,122,0.10) 0%, transparent 50%, rgba(143,159,122,0.18) 100%)",
    });
    el.appendChild(grad);

    const { box1, box2 } = parseCoverText(page.text_content, personName);

    // Box 1 — title
    const b1El = document.createElement("p");
    Object.assign(b1El.style, {
      position: "absolute",
      left: `${box1.x * 100}%`,
      top: `${box1.y * 100}%`,
      transform: "translate(-50%, -50%)",
      width: "82%",
      textAlign: "center",
      fontFamily: "YardenAlbum, serif",
      fontSize: sp(box1.size),
      fontWeight: "600",
      lineHeight: "1.3",
      color: hasImage ? "white" : "#1a1a1a",
      textShadow: hasImage ? "0 2px 10px rgba(0,0,0,0.75)" : "none",
      zIndex: "10",
    });
    b1El.textContent = box1.text;
    el.appendChild(b1El);

    // Box 2 — subtitle
    if (box2 && box2.text) {
      const b2El = document.createElement("p");
      Object.assign(b2El.style, {
        position: "absolute",
        left: `${box2.x * 100}%`,
        top: `${box2.y * 100}%`,
        transform: "translate(-50%, -50%)",
        width: "82%",
        textAlign: "center",
        fontFamily: "YardenAlbum, serif",
        fontSize: sp(box2.size),
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: hasImage ? "rgba(255,255,255,0.82)" : "rgba(143,159,122,0.7)",
        textShadow: hasImage ? "0 1px 6px rgba(0,0,0,0.65)" : "none",
        zIndex: "10",
      });
      b2El.textContent = box2.text;
      el.appendChild(b2El);
    }

    return { el, floatingSlot1 };
  }

  // Back cover
  if (page.page_type === "back_cover") {
    const content = document.createElement("div");
    Object.assign(content.style, {
      position: "absolute",
      inset: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: sp(32),
      gap: sp(20),
      zIndex: "10",
    });
    if (page.text_content) {
      const p = document.createElement("p");
      Object.assign(p.style, {
        fontFamily: "YardenAlbum, serif",
        fontSize: sp(18),
        fontStyle: "italic",
        lineHeight: "1.8",
        whiteSpace: "pre-line",
        maxWidth: sp(240),
        color: slot1.url ? "white" : "#666",
        textShadow: slot1.url ? "0 1px 3px rgba(0,0,0,0.7)" : "none",
      });
      p.textContent = page.text_content;
      content.appendChild(p);
    }
    const brand = document.createElement("span");
    Object.assign(brand.style, {
      fontSize: sp(14),
      fontWeight: "600",
      letterSpacing: "0.05em",
      color: slot1.url ? "white" : "#8F9F7A",
    });
    brand.textContent = "Vitae Studio";
    content.appendChild(brand);
    el.appendChild(content);
    return { el, floatingSlot1 };
  }

  // Dedication
  if (page.page_type === "dedication") {
    const content = document.createElement("div");
    Object.assign(content.style, {
      position: "absolute",
      inset: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: sp(40),
      zIndex: "10",
    });
    if (page.text_content) {
      const p = document.createElement("p");
      Object.assign(p.style, {
        fontFamily: "YardenAlbum, serif",
        fontSize: sp(18),
        fontStyle: "italic",
        lineHeight: "1.8",
        whiteSpace: "pre-line",
        maxWidth: sp(260),
        color: slot1.url ? "white" : "#666",
        textShadow: slot1.url ? "0 1px 3px rgba(0,0,0,0.7)" : "none",
      });
      p.textContent = page.text_content;
      content.appendChild(p);
    }
    el.appendChild(content);
    return { el, floatingSlot1 };
  }

  // Content pages — dispatch by layout
  const overlayPos = getOverlayPosition(layout);

  if (overlayPos && slot1.url) {
    // Full-image layouts: image fills page (via floating cross-spread layer), text overlaid
    if (page.text_content) {
      buildTextOverlay(page.text_content, page, overlayPos, el);
    }
  } else if (layout === "TEXT_ONLY") {
    el.style.backgroundColor = page.bg_color ?? "#fff";
    el.style.border = "1px solid rgba(0,0,0,0.08)";
    const content = document.createElement("div");
    Object.assign(content.style, {
      display: "flex",
      height: "100%",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: sp(40),
    });
    if (page.text_content) {
      const p = document.createElement("p");
      const lh = String(page.line_height ?? 1.4);
      const widthPct = page.text_width_pct != null ? `${page.text_width_pct}%` : undefined;
      Object.assign(p.style, {
        fontFamily: "YardenAlbum, serif",
        fontSize: resolveTextSize(page.text_size as string | null, page.font_size_px),
        textAlign: page.text_align ?? "center",
        lineHeight: lh,
        whiteSpace: "pre-line",
        color: "#1a1a1a",
        ...(widthPct ? { maxWidth: widthPct } : {}),
      });
      p.textContent = page.text_content;
      content.appendChild(p);
    }
    el.appendChild(content);
  } else if (layout === "IMAGE_TOP_TEXT_BOTTOM" || layout === "TEXT_TOP_IMAGE_BOTTOM") {
    el.style.backgroundColor = page.bg_color ?? "#fff";
    el.style.display = "flex";
    el.style.flexDirection = "column";
    const imgSection = document.createElement("div");
    Object.assign(imgSection.style, {
      position: "relative",
      height: "60%",
      overflow: "hidden",
    });
    if (slot1.url) {
      buildImageFill(slot1.url, slot1.cropX, slot1.cropY, slot1.scale, imgSection, slot1.insetTop, slot1.insetRight, slot1.insetBottom, slot1.insetLeft);
    }
    const textSection = document.createElement("div");
    Object.assign(textSection.style, {
      flex: "1",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: `${sp(16)} ${sp(20)}`,
    });
    if (page.text_content) {
      const p = document.createElement("p");
      const lh = String(page.line_height ?? 1.4);
      const widthPct = page.text_width_pct != null ? `${page.text_width_pct}%` : undefined;
      Object.assign(p.style, {
        fontFamily: "YardenAlbum, serif",
        fontSize: resolveTextSize(page.text_size as string | null, page.font_size_px),
        textAlign: page.text_align ?? "center",
        lineHeight: lh,
        whiteSpace: "pre-line",
        color: "#1a1a1a",
        ...(widthPct ? { maxWidth: widthPct } : {}),
      });
      p.textContent = page.text_content;
      textSection.appendChild(p);
    }
    if (layout === "IMAGE_TOP_TEXT_BOTTOM") {
      el.appendChild(imgSection);
      el.appendChild(textSection);
    } else {
      textSection.style.height = "40%";
      textSection.style.flex = "none";
      imgSection.style.height = "auto";
      imgSection.style.flex = "1";
      el.appendChild(textSection);
      el.appendChild(imgSection);
    }
  } else if (layout === "IMAGE_LEFT_TEXT_RIGHT" || layout === "IMAGE_RIGHT_TEXT_LEFT") {
    el.style.backgroundColor = page.bg_color ?? "#fff";
    el.style.display = "flex";
    el.style.direction = "ltr";
    const imgSection = document.createElement("div");
    Object.assign(imgSection.style, {
      position: "relative",
      width: "55%",
      overflow: "hidden",
    });
    if (slot1.url) {
      buildImageFill(slot1.url, slot1.cropX, slot1.cropY, slot1.scale, imgSection, slot1.insetTop, slot1.insetRight, slot1.insetBottom, slot1.insetLeft);
    }
    const textSection = document.createElement("div");
    Object.assign(textSection.style, {
      flex: "1",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: sp(16),
    });
    if (page.text_content) {
      const p = document.createElement("p");
      const lh = String(page.line_height ?? 1.4);
      const widthPct = page.text_width_pct != null ? `${page.text_width_pct}%` : undefined;
      Object.assign(p.style, {
        fontFamily: "YardenAlbum, serif",
        fontSize: resolveTextSize(page.text_size as string | null, page.font_size_px),
        textAlign: page.text_align ?? "center",
        lineHeight: lh,
        whiteSpace: "pre-line",
        color: "#1a1a1a",
        direction: "rtl",
        ...(widthPct ? { maxWidth: widthPct } : {}),
      });
      p.textContent = page.text_content;
      textSection.appendChild(p);
    }
    if (layout === "IMAGE_LEFT_TEXT_RIGHT") {
      el.appendChild(imgSection);
      el.appendChild(textSection);
    } else {
      el.appendChild(textSection);
      el.appendChild(imgSection);
    }
  } else if (layout === "TWO_IMAGES") {
    el.style.display = "flex";
    el.style.direction = "ltr";
    const slot2 = resolveSlot(page, 2);
    for (const slotInfo of [slot1, slot2]) {
      const half = document.createElement("div");
      Object.assign(half.style, {
        position: "relative",
        width: "50%",
        height: "100%",
        overflow: "hidden",
      });
      if (slotInfo.url) {
        buildImageFill(slotInfo.url, slotInfo.cropX, slotInfo.cropY, slotInfo.scale, half, slotInfo.insetTop, slotInfo.insetRight, slotInfo.insetBottom, slotInfo.insetLeft);
      }
      el.appendChild(half);
    }
    if (page.text_content) {
      const caption = document.createElement("div");
      Object.assign(caption.style, {
        position: "absolute",
        left: "0",
        right: "0",
        bottom: "0",
        background: "rgba(0,0,0,0.55)",
        padding: `${sp(4)} ${sp(12)}`,
        fontFamily: "YardenAlbum, serif",
        fontSize: resolveTextSize(page.text_size as string | null, page.font_size_px),
        color: "white",
        textAlign: page.text_align ?? "center",
        zIndex: "10",
      });
      caption.textContent = page.text_content;
      el.appendChild(caption);
    }
  } else {
    // Default: FULL_IMAGE fallback (image rendered via floating cross-spread layer)
    if (page.text_content) {
      buildTextOverlay(page.text_content, page, "bottom", el);
    }
  }

  return { el, floatingSlot1 };
}

// ─── Image preloading ───────────────────────────────────────────────────────

/** Wait for all images inside a DOM tree to load (or fail). */
function waitForImages(container: HTMLElement): Promise<void> {
  const images = container.querySelectorAll("img");
  if (images.length === 0) return Promise.resolve();
  return Promise.all(
    Array.from(images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
          } else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        })
    )
  ).then(() => {});
}

// ─── Floating cross-spread image layer ──────────────────────────────────────

/**
 * Build a slot-1 image positioned relative to the whole spread (not clipped
 * to its own page), so it can bleed across the spine — matching AlbumPreview's
 * floating image layer. See `computeFloatingImageBox` for the position math.
 */
function buildFloatingImageLayer(slot: ResolvedImageSlot, isRight: boolean, isSingleton: boolean): HTMLElement {
  const { anchor, wrapper } = computeFloatingImageBox(slot, { isRight, isSingleton });

  const anchorEl = document.createElement("div");
  Object.assign(anchorEl.style, anchor);

  const wrapperEl = document.createElement("div");
  Object.assign(wrapperEl.style, wrapper);

  const img = document.createElement("img");
  img.crossOrigin = "anonymous";
  img.src = slot.url!;
  Object.assign(img.style, {
    width: "100%",
    height: "100%",
    maxWidth: "none",
    objectFit: "contain",
  });

  wrapperEl.appendChild(img);
  anchorEl.appendChild(wrapperEl);
  return anchorEl;
}

// ─── Spread builder (DOM) ────────────────────────────────────────────────────

/**
 * Builds the full spread DOM element: the two page squares side by side
 * (or one square for cover/back_cover singletons), plus any floating
 * cross-spread image layers for full-image pages with a slot-1 image.
 *
 * `overflow: hidden` on the spread container clips floating images at the
 * spread's outer edge, while still allowing them to bleed across the
 * spine between the two pages — matching AlbumPreview's spread grid.
 */
function buildSpreadElement(spread: Spread, personName: string): HTMLElement {
  const [rightPage, leftPage] = spread;
  const isSingleton = !leftPage;

  const spreadEl = document.createElement("div");
  Object.assign(spreadEl.style, {
    position: "relative",
    display: "flex",
    direction: "ltr", // physical left-to-right for spread layout
    width: isSingleton ? `${PAGE_SIZE_PX}px` : `${PAGE_SIZE_PX * 2}px`,
    height: `${PAGE_SIZE_PX}px`,
    backgroundColor: "#FAF8F2",
    overflow: "hidden",
  });

  // In RTL spread: right page (lower number) is physically on the right.
  // In our LTR flex container, left page (higher number) goes first.
  const entries: { page: PreviewPage; isRight: boolean }[] = isSingleton
    ? [{ page: rightPage, isRight: true }]
    : [{ page: leftPage!, isRight: false }, { page: rightPage, isRight: true }];

  const floating: { slot: ResolvedImageSlot; isRight: boolean }[] = [];
  for (const { page, isRight } of entries) {
    const { el, floatingSlot1 } = buildPageElement(page, personName);
    spreadEl.appendChild(el);
    if (floatingSlot1) floating.push({ slot: floatingSlot1, isRight });
  }

  // Append floating layers after page elements so they paint above page
  // backgrounds (zIndex 2) but below text overlays (zIndex 10).
  for (const { slot, isRight } of floating) {
    spreadEl.appendChild(buildFloatingImageLayer(slot, isRight, isSingleton));
  }

  return spreadEl;
}

// ─── Main export function ───────────────────────────────────────────────────

export async function exportAlbumPdf(
  previewData: PreviewData,
  personName: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const spreads = buildSpreads(previewData.pages);
  const total = spreads.length;

  // Create hidden container
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    zIndex: "-1",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(host);

  // Will hold [canvas, isSingleton] pairs
  const captures: { canvas: HTMLCanvasElement; isSingleton: boolean }[] = [];

  try {
    for (let i = 0; i < spreads.length; i++) {
      onProgress?.(i, total);
      const isSingleton = !spreads[i][1];
      const spreadEl = buildSpreadElement(spreads[i], personName);

      host.appendChild(spreadEl);
      await waitForImages(spreadEl);

      const canvas = await html2canvas(spreadEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#FAF8F2",
        logging: false,
      });

      captures.push({ canvas, isSingleton });
      host.removeChild(spreadEl);
    }

    onProgress?.(total, total);

    // Build PDF
    // First page determines initial orientation
    const firstIsSingleton = captures[0]?.isSingleton ?? true;
    const doc = new jsPDF({
      orientation: firstIsSingleton ? "portrait" : "landscape",
      unit: "mm",
      format: firstIsSingleton ? [PAGE_MM, PAGE_MM] : [PAGE_MM * 2, PAGE_MM],
    });

    for (let i = 0; i < captures.length; i++) {
      const { canvas, isSingleton } = captures[i];
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pageW = isSingleton ? PAGE_MM : PAGE_MM * 2;
      const pageH = PAGE_MM;

      if (i > 0) {
        doc.addPage(
          [pageW, pageH],
          isSingleton ? "portrait" : "landscape"
        );
      }

      doc.addImage(imgData, "JPEG", 0, 0, pageW, pageH);
    }

    // Save
    const safeName = personName.replace(/[^\w\u0590-\u05FF ]/g, "").trim() || "album";
    doc.save(`${safeName}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}

// \u2500\u2500\u2500 JPG/ZIP export (print-ready spreads) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/** Capture a canvas as a JPEG Blob (avoids the memory overhead of a base64 data URL). */
function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export to JPEG failed"))),
      "image/jpeg",
      quality
    );
  });
}

/**
 * Exports every album spread as a high-quality JPG, bundled into a single ZIP.
 *
 * Reuses the exact same DOM-snapshot pipeline as {@link exportAlbumPdf}
 * (spread grouping, page rendering, html2canvas capture at the same scale),
 * so the images match the PDF/preview pixel-for-pixel \u2014 only the final
 * assembly step differs (JPEG blobs in a ZIP instead of pages in a PDF).
 *
 * Resolution: each spread is captured at PAGE_SIZE_PX \u00D7 2 (html2canvas scale)
 * per page \u2014 e.g. ~2400\u00D72400 px per square page, ~4800\u00D72400 px per two-page
 * spread (\u2248289 DPI for a 25 cm page side). This matches the proven, reliable
 * PDF render path; pushing higher risks failures on large albums in-browser.
 *
 * Files are named `spread-01.jpg`, `spread-02.jpg`, \u2026 in album order.
 */
export async function exportAlbumSpreadsJpgZip(
  previewData: PreviewData,
  personName: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const spreads = buildSpreads(previewData.pages);
  const total = spreads.length;
  const padWidth = Math.max(2, String(total).length);

  // Create hidden container (same approach as exportAlbumPdf)
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    zIndex: "-1",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(host);

  const zip = new JSZip();

  try {
    for (let i = 0; i < spreads.length; i++) {
      onProgress?.(i, total);
      const spreadEl = buildSpreadElement(spreads[i], personName);

      host.appendChild(spreadEl);
      await waitForImages(spreadEl);

      const canvas = await html2canvas(spreadEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#FAF8F2",
        logging: false,
      });

      const blob = await canvasToJpegBlob(canvas, JPG_QUALITY);
      const fileName = `spread-${String(i + 1).padStart(padWidth, "0")}.jpg`;
      zip.file(fileName, blob);

      host.removeChild(spreadEl);
    }

    onProgress?.(total, total);

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const safeName = personName.replace(/[^\w\u0590-\u05FF ]/g, "").trim() || "album";
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}-spreads-jpg.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    document.body.removeChild(host);
  }
}
