/**
 * Album font loader for Remotion compositions.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The YardenAlbum font is declared in src/app/globals.css via @font-face,
 * which works for the Next.js web preview. However, Remotion renders via its
 * own webpack bundle (`.remotion-bundle/`) — the Next.js global CSS is never
 * loaded there, so the font falls back to system Hebrew fonts.
 *
 * This module fixes it by:
 *   1. Importing the .otf file directly so webpack copies it into the bundle
 *      as a static asset, making it accessible to the headless Chrome renderer.
 *   2. Exporting `useAlbumFont()` — a Remotion-aware hook that injects the
 *      @font-face rule and delays rendering until the font is ready.
 *
 * FONT FILE
 * ─────────
 * public/fonts/album/yarden-regular-alefalefalef-3.otf
 * Remotion's default webpack config treats .otf files as asset/resource,
 * so this import resolves to the URL of the emitted file in the bundle.
 */

import React from "react";
import { continueRender, delayRender } from "remotion";

// Remotion's webpack (asset/resource loader) resolves this to a bundle URL.
// The .otf file is copied into .remotion-bundle/ at bundle time.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — .otf asset import; no type declaration needed at runtime
import fontUrl from "../../public/fonts/album/yarden-regular-alefalefalef-3.otf";

const FONT_FAMILY = "YardenAlbum";

function injectFontFace(url: string): void {
  if (document.getElementById("yarden-album-font")) return; // already injected
  const style = document.createElement("style");
  style.id = "yarden-album-font";
  style.textContent = `
    @font-face {
      font-family: '${FONT_FAMILY}';
      src: url('${url}') format('opentype');
      font-weight: normal;
      font-style: normal;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Call inside any Remotion composition that renders album text.
 *
 * Injects the YardenAlbum @font-face into the headless browser document
 * and holds rendering (via delayRender) until the font is fully loaded.
 * This ensures every frame — including frame 0 — uses the correct font.
 *
 * Always releases the render hold, even if font loading fails, so a missing
 * font never causes an infinite render stall.
 */
export function useAlbumFont(): void {
  const [handle] = React.useState(() =>
    delayRender("Loading YardenAlbum font")
  );

  React.useEffect(() => {
    injectFontFace(fontUrl as string);

    document.fonts
      .load(`1em ${FONT_FAMILY}`)
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle)); // never stall on font failure
  }, [handle]);
}
