/**
 * PageTurnTransition — cinematic album-style page-turn between scenes.
 *
 * RTL Hebrew book model:
 *   - The RIGHT page (outgoing scene) turns to the LEFT.
 *   - Spine/anchor is at the LEFT EDGE of the page.
 *   - The page rotates around its left edge: rotateY 0° → −90°
 *     (right edge folds backward, sweeping left-ward).
 *   - The incoming scene sits beneath and is revealed right-to-left
 *     as the outgoing page folds away.
 *
 * Visual effects:
 *   - CSS perspective (1400 px) creates mild foreshortening as the page turns.
 *   - A fold-edge shadow gradient tracks the moving fold line and peaks at mid-turn.
 *   - A subtle spine shadow at the anchor edge fades as the page departs.
 *
 * Sound:
 *   - Optional <Audio> on the outgoing clip; plays from the start of the turn.
 *   - Requires public/sounds/page-turn.mp3. Disable via enableSound={false}
 *     until the file is present to avoid render errors.
 *
 * Config surface (consumed by FinalFilmComposition via PageTurnTransitionProps):
 *   durationFrames  — set in FinalFilmCompositionProps.transitionDurationInFrames
 *   enableSound     — prop on this component (default true)
 *   direction       — bookDir prop: "rtl" | "ltr" (default "rtl")
 */

import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PageTurnTransitionProps {
  /**
   * Transition progress from 0 (turn starts) to 1 (turn complete).
   * Caller is responsible for interpolating this from frame counts.
   */
  progress: number;
  /** The clip content to render. */
  children: React.ReactNode;
  /** "outgoing" = this clip turns away; "incoming" = this clip is revealed beneath. */
  role: "outgoing" | "incoming";
  /**
   * Book reading direction:
   *   "rtl" — Hebrew/Arabic book: spine on the RIGHT side of the overall spread,
   *            the right page turns to the LEFT (anchor = left edge of the page).
   *   "ltr" — Standard left-bound book: left page turns to the right.
   * Default: "rtl".
   */
  bookDir?: "rtl" | "ltr";
  /**
   * Play the page-turn sound effect alongside the outgoing clip.
   * Requires public/sounds/page-turn.mp3 to exist and be bundled.
   * Default: true — set to false if the file is not yet available.
   */
  enableSound?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Perspective depth in px for the 3-D page-turn effect. */
const PERSPECTIVE_PX = 1800;

/** Composition width — used to compute accurate fold-edge position. */
const COMP_WIDTH_PX = 1920;

/** Volume for the page-turn sound: low and natural, not dominant. */
const SOUND_VOLUME = 0.28;

/** Path to the page-turn sound file (place at public/sounds/page-turn.mp3). */
const PAGE_TURN_SOUND = staticFile("sounds/page-turn.mp3");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Cubic ease-in-out — smoother acceleration / deceleration than quadratic. */
function easeInOut(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Projected screen distance of the FREE edge from the ANCHOR edge, as a
 * percentage of composition width, accounting for CSS perspective foreshortening.
 *
 *   screenDist = W·cos(α)·P / (P + W·sin(α))
 *
 * where P = perspective depth, W = element width, α = |rotateYDeg|.
 *
 * For LTR (left anchor): the right free edge is at screenDist from the left → foldEdgeX = result.
 * For RTL (right anchor): the left free edge is at W − screenDist from the left → foldEdgeX = 100 − result.
 *
 * Returns a percentage (0–100).
 */
function foldEdgePercent(rotateYDeg: number): number {
  const alpha = Math.abs(rotateYDeg) * (Math.PI / 180);
  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);
  // Avoid division by zero at α = 90°
  const denom = PERSPECTIVE_PX + COMP_WIDTH_PX * sinA;
  if (denom <= 0) return 0;
  const pxFromLeft = (COMP_WIDTH_PX * cosA * PERSPECTIVE_PX) / denom;
  return Math.max(0, Math.min(100, (pxFromLeft / COMP_WIDTH_PX) * 100));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PageTurnTransition({
  progress,
  children,
  role,
  bookDir = "rtl",
  enableSound = true,
}: PageTurnTransitionProps) {
  // ── Incoming clip ────────────────────────────────────────────────────────────
  // Sits beneath the turning page — no transform, lower z-index.
  if (role === "incoming") {
    return (
      <AbsoluteFill style={{ zIndex: 1 }}>
        {children}
      </AbsoluteFill>
    );
  }

  // ── Outgoing clip ────────────────────────────────────────────────────────────

  const eased = easeInOut(progress);

  // RTL (Hebrew album): spine on the RIGHT. The free LEFT edge lifts and
  // sweeps rightward, anchored at the right/spine edge. rotateY(+90°) with
  // transformOrigin "right center" makes the left edge go into the screen while
  // the right edge stays fixed — revealing the incoming spread from the left.
  //
  // LTR: spine on left; free right edge sweeps leftward, anchor = left edge.
  const rotateYDeg = bookDir === "rtl" ? eased * 90 : eased * -90;

  const transformOrigin = bookDir === "rtl" ? "right center" : "left center";
  // perspectiveOrigin at the anchor edge so the anchor stays stationary on screen.
  const perspectiveOrigin = bookDir === "rtl" ? "100% 50%" : "0% 50%";

  // ── Fold-edge shadow ────────────────────────────────────────────────────────
  // A narrow gradient stripe that tracks the fold line across the frame.
  // Intensity follows a concave parabola: 0 at start, peaks at mid-turn, 0 at end.
  // This sits OUTSIDE the rotated div so it appears on both the receding page
  // and the newly revealed incoming scene.

  const shadowIntensity = 4 * progress * (1 - progress); // 0→1→0
  const shadowPeak = shadowIntensity * 0.65;

  // foldEdgePercent gives the projected position of the FREE edge from the
  // anchor edge's side. For RTL (right anchor), the free edge is the LEFT
  // edge; its screen X = 100% − foldEdgePercent (moves 0%→100% as page turns).
  // For LTR (left anchor), the free edge is the RIGHT edge at foldEdgePercent
  // (moves 100%→0% as page turns).
  const rawFoldX = foldEdgePercent(rotateYDeg);
  const foldEdgeX = bookDir === "rtl" ? 100 - rawFoldX : rawFoldX;

  // Helper to clamp values for the gradient
  const c = (v: number) => Math.max(0, Math.min(100, v)).toFixed(2);

  // Shadow straddles the fold edge with a heavier fall-off toward the
  // incoming (revealed) side.
  const foldShadow = `linear-gradient(to right,
      transparent ${c(foldEdgeX - 10)}%,
      rgba(0,0,0,${(shadowPeak * 0.5).toFixed(3)}) ${c(foldEdgeX - 2)}%,
      rgba(0,0,0,${shadowPeak.toFixed(3)}) ${c(foldEdgeX)}%,
      rgba(0,0,0,${(shadowPeak * 0.22).toFixed(3)}) ${c(foldEdgeX + 2)}%,
      transparent ${c(foldEdgeX + 9)}%)`;

  // ── Spine shadow ────────────────────────────────────────────────────────────
  // A very soft gradient at the anchor edge that diminishes as the page turns.
  // Simulates the shadow cast by the departing page near the binding.
  const spineOpacity = (1 - eased) * 0.22;
  // RTL: spine at RIGHT edge — gradient flows from right (0%) toward left.
  // LTR: spine at LEFT edge — gradient flows from left (0%) toward right.
  const spineShadow =
    bookDir === "rtl"
      ? `linear-gradient(to left,  rgba(0,0,0,${spineOpacity.toFixed(3)}) 0%, transparent 6%)`
      : `linear-gradient(to right, rgba(0,0,0,${spineOpacity.toFixed(3)}) 0%, transparent 6%)`;

  return (
    <AbsoluteFill style={{ zIndex: 2 }}>
      {/* ── Sound effect ──────────────────────────────────────────────────────
          Starts at frame 0 of the exit sequence (= start of the turn).
          A natural page-turn sound peaks around 250–350 ms, aligning well
          with the mid-turn visual peak for a 0.6–1.0 s transition.        */}
      {enableSound && (
        <Audio src={PAGE_TURN_SOUND} volume={SOUND_VOLUME} />
      )}

      {/* ── Perspective container ─────────────────────────────────────────────
          Sets the vanishing-point above the anchor edge so the anchor side
          of the page stays visually fixed as it rotates.                   */}
      <AbsoluteFill
        style={{
          perspective: `${PERSPECTIVE_PX}px`,
          perspectiveOrigin,
        }}
      >
        {/* The turning page */}
        <AbsoluteFill
          style={{
            transformOrigin,
            transform: `rotateY(${rotateYDeg}deg)`,
            willChange: "transform",
          }}
        >
          {children}
        </AbsoluteFill>
      </AbsoluteFill>

      {/* ── Fold-edge shadow (above turning page + incoming scene) ────────── */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: foldShadow,
        }}
      />

      {/* ── Spine shadow (anchor edge) ─────────────────────────────────────── */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: spineShadow,
        }}
      />
    </AbsoluteFill>
  );
}
