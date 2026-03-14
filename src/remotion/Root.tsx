import { Composition } from "remotion";
import {
  SceneComposition,
  type SceneCompositionProps,
} from "./SceneComposition";

/**
 * Remotion Root component — registers all compositions.
 * Entry point: src/remotion/index.ts
 *
 * To preview: npx remotion studio
 * To render a single scene via API: POST /api/admin/orders/[orderId]/film/render-scene
 */
export function Root() {
  return (
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
        motionPreset: "ken_burns",
        transitionIn: "fade",
        transitionOut: "fade",
      } satisfies SceneCompositionProps}
    />
  );
}
