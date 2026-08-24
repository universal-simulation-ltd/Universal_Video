/**
 * The maths behind the landing illustration's single clock.
 *
 * `VideoIllustration` is one number — `--t`, 0 → 1 — written onto a wrapper
 * element and read by every rule in `index.css`. Separate `@keyframes` cannot
 * do what that needs: an element part way through a keyframe animation cannot
 * be told to return to its own first frame (`animation-play-state: paused`
 * freezes it where it stands, and removing the animation snaps it). With one
 * number, "glide back to frame 0" is one interpolation.
 *
 * ⚠️ Universal PDF and Universal Images each carry their own copy of this rAF
 * loop, inline in their illustration components; this is the third. Only the
 * pure maths lives here, because that is the part with an honest unit test —
 * a fourth copy of the *loop* should go to `@unisim/sdk` as a hook rather than
 * be pasted again.
 */

/** Ease in and out. The clock is linear; this is what makes the motion not. */
export const smoothstep = (x: number) => x * x * (3 - 2 * x)

/**
 * The exact inverse of `smoothstep`, over 0 → 1.
 *
 * Needed when the pointer leaves the illustration part way through the glide
 * back to frame 0. The clock is the thing that keeps running, so resuming means
 * asking the opposite question — "which clock position shows the frame
 * currently on screen?" — and without it the picture snaps to wherever the
 * free-running clock had got to.
 *
 * Derived from the trigonometric solution to 3x² − 2x³ = y, which is the only
 * root of that cubic in [0, 1].
 */
export const unSmoothstep = (y: number) => {
  const clamped = Math.min(Math.max(y, 0), 1)
  return 0.5 - Math.sin(Math.asin(1 - 2 * clamped) / 3)
}
