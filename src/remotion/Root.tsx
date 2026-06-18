import { Composition } from "remotion";
import {
  SceneComposition,
  type SceneCompositionProps,
} from "./SceneComposition";
import {
  FinalFilmComposition,
  type FinalFilmCompositionProps,
} from "./FinalFilmComposition";

/**
 * Remotion Root component — registers all compositions.
 * Entry point: src/remotion/index.ts
 *
 * Compositions:
 *   - "Scene"     — renders a single album scene (used by render-scene.ts)
 *   - "FinalFilm" — sequences pre-rendered scene clips into a final film
 *                    with page-turn transitions (used by assemble-film.ts)
 *
 * To preview: npx remotion studio
 * To render a single scene via API: POST /api/admin/orders/[orderId]/film/render-scene
 */
export function Root() {
  return (
    <>
      <Composition
        id="Scene"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={SceneComposition as any}
        durationInFrames={150} // 5 s default — overridden per-scene at render time
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          slot1: null,
          slot2: null,
          layoutType: "FULL_IMAGE",
          textContent: "דוגמת טקסט לאלבום",
          textSize: "md",
          fontSizePx: null,
          textAlign: "center",
          textX: null,
          textY: null,
          textColor: null,
          secondPage: null,
          motionPreset: "ken_burns",
          transitionIn: "fade",
          transitionOut: "fade",
          narrationDurationMs: null,
          pageType: null,
          personName: null,
        } satisfies SceneCompositionProps}
      />
      <Composition
        id="FinalFilm"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={FinalFilmComposition as any}
        durationInFrames={300} // overridden at render time based on clip count
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          clips: [],
          transitionDurationInFrames: 24,
          enableTransitionSound: false,
        } satisfies FinalFilmCompositionProps}
      />
    </>
  );
}
