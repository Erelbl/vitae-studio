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
import type { PreviewData, PreviewPage, LayoutType, PageImageSlot } from "@/types/page";
import { parseCoverText } from "@/components/album/AlbumPageView";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Render size for each page square (px). Higher = better quality but slower.
 *  1200 → html2canvas at scale:2 yields 2400px ≈ 289 DPI for a 25 cm page.
 */
const PAGE_SIZE_PX = 1200;

/** Physical album page size in mm (25 cm = 250 mm). */
const PAGE_MM = 250;

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
): { url: string | null; cropX: number; cropY: number; scale: number } {
  const slotData = (page.images ?? []).find((i: PageImageSlot) => i.slot === slot);
  if (slotData) {
    const isLegacyZero = slotData.crop_x === 0 && slotData.crop_y === 0;
    return {
      url: slotData.image_url,
      cropX: isLegacyZero ? 0.5 : slotData.crop_x,
      cropY: isLegacyZero ? 0.5 : slotData.crop_y,
      scale: slotData.scale,
    };
  }
  if (slot === 1) {
    return { url: page.image_url, cropX: 0.5, cropY: 0.5, scale: 1 };
  }
  return { url: null, cropX: 0.5, cropY: 0.5, scale: 1 };
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
  container: HTMLElement
) {
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
  });

  const img = document.createElement("img");
  img.crossOrigin = "anonymous";
  img.src = url;
  const s = Math.max(0.1, scale);
  Object.assign(img.style, {
    position: "absolute",
    width: `${s * 100}%`,
    height: `${s * 100}%`,
    maxWidth: "none",
    left: `${(cropX - s / 2) * 100}%`,
    top: `${(cropY - s / 2) * 100}%`,
    objectFit: "contain",
  });

  wrapper.appendChild(img);
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
      width: "84%",
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
      lineHeight: "1.6",
      maxWidth: "84%",
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
    lineHeight: "1.6",
  });
  p.textContent = text;

  if (position === "center") {
    const pill = document.createElement("div");
    Object.assign(pill.style, {
      background: "rgba(0,0,0,0.45)",
      backdropFilter: "blur(6px)",
      borderRadius: sp(16),
      padding: `${sp(16)} ${sp(20)}`,
      maxWidth: "86%",
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

/** Build a single page square DOM element. */
function buildPageElement(page: PreviewPage, personName: string): HTMLElement {
  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "relative",
    width: `${PAGE_SIZE_PX}px`,
    height: `${PAGE_SIZE_PX}px`,
    overflow: "hidden",
    backgroundColor: "#FAF8F2", // bg-secondary
    direction: "rtl",
    flexShrink: "0",
  });

  const layout = (page.layout_type ?? "FULL_IMAGE") as LayoutType;
  const slot1 = resolveSlot(page, 1);

  // Cover page
  if (page.page_type === "cover") {
    if (slot1.url) {
      buildImageFill(slot1.url, slot1.cropX, slot1.cropY, slot1.scale, el);
    }
    const hasImage = Boolean(slot1.url);
    // Gradient overlay
    const grad = document.createElement("div");
    Object.assign(grad.style, {
      position: "absolute",
      inset: "0",
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

    return el;
  }

  // Back cover
  if (page.page_type === "back_cover") {
    if (slot1.url) {
      buildImageFill(slot1.url, slot1.cropX, slot1.cropY, slot1.scale, el);
    }
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
    return el;
  }

  // Dedication
  if (page.page_type === "dedication") {
    if (slot1.url) {
      buildImageFill(slot1.url, slot1.cropX, slot1.cropY, slot1.scale, el);
    }
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
    return el;
  }

  // Content pages — dispatch by layout
  const overlayPos = getOverlayPosition(layout);

  if (overlayPos && slot1.url) {
    // Full-image layouts: image fills page, text overlaid
    buildImageFill(slot1.url, slot1.cropX, slot1.cropY, slot1.scale, el);
    if (page.text_content) {
      buildTextOverlay(page.text_content, page, overlayPos, el);
    }
  } else if (layout === "TEXT_ONLY") {
    el.style.backgroundColor = "#fff";
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
      Object.assign(p.style, {
        fontFamily: "YardenAlbum, serif",
        fontSize: resolveTextSize(page.text_size as string | null, page.font_size_px),
        textAlign: page.text_align ?? "center",
        lineHeight: "1.6",
        whiteSpace: "pre-line",
        color: "#1a1a1a",
      });
      p.textContent = page.text_content;
      content.appendChild(p);
    }
    el.appendChild(content);
  } else if (layout === "IMAGE_TOP_TEXT_BOTTOM" || layout === "TEXT_TOP_IMAGE_BOTTOM") {
    el.style.backgroundColor = "#fff";
    el.style.display = "flex";
    el.style.flexDirection = "column";
    const imgSection = document.createElement("div");
    Object.assign(imgSection.style, {
      position: "relative",
      height: "60%",
      overflow: "hidden",
    });
    if (slot1.url) {
      buildImageFill(slot1.url, slot1.cropX, slot1.cropY, slot1.scale, imgSection);
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
      Object.assign(p.style, {
        fontFamily: "YardenAlbum, serif",
        fontSize: resolveTextSize(page.text_size as string | null, page.font_size_px),
        textAlign: page.text_align ?? "center",
        lineHeight: "1.6",
        whiteSpace: "pre-line",
        color: "#1a1a1a",
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
    el.style.backgroundColor = "#fff";
    el.style.display = "flex";
    el.style.direction = "ltr";
    const imgSection = document.createElement("div");
    Object.assign(imgSection.style, {
      position: "relative",
      width: "55%",
      overflow: "hidden",
    });
    if (slot1.url) {
      buildImageFill(slot1.url, slot1.cropX, slot1.cropY, slot1.scale, imgSection);
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
      Object.assign(p.style, {
        fontFamily: "YardenAlbum, serif",
        fontSize: resolveTextSize(page.text_size as string | null, page.font_size_px),
        textAlign: page.text_align ?? "center",
        lineHeight: "1.6",
        whiteSpace: "pre-line",
        color: "#1a1a1a",
        direction: "rtl",
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
        buildImageFill(slotInfo.url, slotInfo.cropX, slotInfo.cropY, slotInfo.scale, half);
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
    // Default: FULL_IMAGE fallback
    if (slot1.url) {
      buildImageFill(slot1.url, slot1.cropX, slot1.cropY, slot1.scale, el);
    }
    if (page.text_content) {
      buildTextOverlay(page.text_content, page, "bottom", el);
    }
  }

  return el;
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
      const [rightPage, leftPage] = spreads[i];
      const isSingleton = !leftPage;

      // Build the spread container
      const spreadEl = document.createElement("div");
      Object.assign(spreadEl.style, {
        display: "flex",
        direction: "ltr", // physical left-to-right for spread layout
        width: isSingleton ? `${PAGE_SIZE_PX}px` : `${PAGE_SIZE_PX * 2}px`,
        height: `${PAGE_SIZE_PX}px`,
        backgroundColor: "#FAF8F2",
      });

      // In RTL spread: right page (lower number) is physically on the right
      // But in our LTR flex container, right page goes second
      if (isSingleton) {
        spreadEl.appendChild(buildPageElement(rightPage, personName));
      } else {
        // Left page (higher number) first in LTR flex
        spreadEl.appendChild(buildPageElement(leftPage!, personName));
        // Right page (lower number) second in LTR flex
        spreadEl.appendChild(buildPageElement(rightPage, personName));
      }

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
