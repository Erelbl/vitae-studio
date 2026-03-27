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
const PERSPECTIVE_PX = 1400;

/** Composition width — used to compute accurate fold-edge position. */
const COMP_WIDTH_PX = 1920;

/** Volume for the page-turn sound: low and natural, not dominant. */
const SOUND_VOLUME = 0.28;

/** Path to the page-turn sound file (place at public/sounds/page-turn.mp3). */
const PAGE_TURN_SOUND = staticFile("sounds/page-turn.mp3");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Smooth cubic ease-in-out. */
function easeInOut(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 2 * c * c : -1 + (4 - 2 * c) * c;
}

/**
 * Projected X position of the fold edge (in 0–100 % of composition width),
 * accounting for the CSS perspective projection.
 *
 * For RTL: the page rotates rotateY(-α) around its left edge with
 * perspectiveOrigin at 0% 50%.  The right edge projects to:
 *   screenX = W·cos(α)·P / (P + W·sin(α))
 * where P = perspective depth, W = element width.
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

  // RTL: anchor = left edge, right edge sweeps back → rotateY negative.
  // LTR: anchor = right edge, left edge sweeps back → rotateY positive.
  const rotateYDeg = bookDir === "rtl" ? eased * -90 : eased * 90;

  const transformOrigin = bookDir === "rtl" ? "left center" : "right center";
  // perspectiveOrigin at the anchor edge so the anchor stays stationary on screen.
  const perspectiveOrigin = bookDir === "rtl" ? "0% 50%" : "100% 50%";

  // ── Fold-edge shadow ────────────────────────────────────────────────────────
  // A narrow gradient stripe that tracks the fold line across the frame.
  // Intensity follows a concave parabola: 0 at start, peaks at mid-turn, 0 at end.
  // This sits OUTSIDE the rotated div so it appears on both the receding page
  // and the newly revealed incoming scene.

  const shadowIntensity = 4 * progress * (1 - progress); // 0→1→0
  const shadowPeak = shadowIntensity * 0.52;

  const foldX = foldEdgePercent(rotateYDeg); // percentage from left

  // Helper to clamp values for the gradient
  const c = (v: number) => Math.max(0, Math.min(100, v)).toFixed(2);

  const foldShadow =
    bookDir === "rtl"
      ? `linear-gradient(to right,
            transparent ${c(foldX - 7)}%,
            rgba(0,0,0,${(shadowPeak * 0.5).toFixed(3)}) ${c(foldX - 1)}%,
            rgba(0,0,0,${shadowPeak.toFixed(3)}) ${c(foldX)}%,
            rgba(0,0,0,${(shadowPeak * 0.22).toFixed(3)}) ${c(foldX + 2)}%,
            transparent ${c(foldX + 8)}%)`
      : `linear-gradient(to left,
            transparent ${c(100 - foldX - 7)}%,
            rgba(0,0,0,${(shadowPeak * 0.5).toFixed(3)}) ${c(100 - foldX - 1)}%,
            rgba(0,0,0,${shadowPeak.toFixed(3)}) ${c(100 - foldX)}%,
            rgba(0,0,0,${(shadowPeak * 0.22).toFixed(3)}) ${c(100 - foldX + 2)}%,
            transparent ${c(100 - foldX + 8)}%)`;

  // ── Spine shadow ────────────────────────────────────────────────────────────
  // A very soft gradient at the anchor edge that diminishes as the page turns.
  // Simulates the shadow cast by the departing page near the binding.
  const spineOpacity = (1 - eased) * 0.22;
  const spineShadow =
    bookDir === "rtl"
      ? `linear-gradient(to right, rgba(0,0,0,${spineOpacity.toFixed(3)}) 0%, transparent 6%)`
      : `linear-gradient(to left,  rgba(0,0,0,${spineOpacity.toFixed(3)}) 0%, transparent 6%)`;

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
