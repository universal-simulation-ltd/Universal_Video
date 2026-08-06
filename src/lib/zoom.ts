import { PLAYER_MAX_W } from './layout'

/**
 * How wide a second of movie is drawn.
 *
 * The zoom is stored as a MULTIPLE of fit-to-width rather than as pixels per
 * second, and that is the whole point of this file: at zoom 1 the movie is
 * exactly as wide as the player's picture, so the needle at `t` sits at
 * `t / duration` of the width — the same fraction the player is itself showing —
 * and it stays there when the window resizes, when a clip is added, or when a
 * trim makes the movie shorter. Pixels per second is DERIVED from the measured
 * width instead of being the number the user adjusts.
 *
 * Everything downstream — the clip rectangles, the ruler, the playhead, the drag
 * arithmetic — is already correct in terms of pixels per second, which is why
 * that is still what comes out of here.
 */

/**
 * What an empty timeline is treated as lasting.
 *
 * `duration` is 0 before the first file lands, and can be 0 for a moment for an
 * image card whose length isn't known yet. Dividing the width by that gives
 * Infinity pixels per second and a NaN for every `left` on screen. One second is
 * arbitrary but sane — it keeps the ruler drawing a plausible 0:00–0:01 until
 * there is something real to scale to.
 */
export const EMPTY_TIMELINE_SEC = 1

/** Fit-to-width: the default, and what the Fit button returns to. */
export const FIT = 1

/**
 * One press of + or −. Geometric, not linear: zoom is multiplicative, and a
 * fixed step that feels right on a two-second clip does nothing at all on an
 * hour-long one.
 */
export const ZOOM_STEP = 1.5

/**
 * The finest we will draw. 1200 px per second is 40 px per frame at 30 fps (20
 * at 60) — past that a trim handle is being dragged to a place more precise
 * than a frame, which the renderer cannot honour anyway.
 */
export const MAX_PX_PER_SEC = 1200

/**
 * …and a backstop on the multiple itself, so the drawn surface stays inside what
 * a browser will lay out. 4096 × a 720 px box is ~2.9M px, comfortably under
 * Chromium's ~33.5M px element limit; it only bites on a movie longer than
 * about forty minutes, where `MAX_PX_PER_SEC` would ask for more.
 */
export const ZOOM_CEILING = 4096

/**
 * Room past the end of the movie to drag a clip into — added ONLY when zoomed
 * in. At fit it would squeeze the movie narrower than the picture above it,
 * which is precisely the bug this file exists to fix.
 */
export const TRAIL_PX = 160

/** Used until the ResizeObserver has measured anything real. */
export const FALLBACK_VIEWPORT_PX = PLAYER_MAX_W

/** The duration to scale by — never 0, never NaN, never Infinity. */
export function movieSeconds(durationSec: number): number {
  return Number.isFinite(durationSec) && durationSec > 0 ? durationSec : EMPTY_TIMELINE_SEC
}

/** The width to scale by — same guard, for the first render before layout. */
export function viewportWidth(px: number): number {
  return Number.isFinite(px) && px > 0 ? px : FALLBACK_VIEWPORT_PX
}

/** Pixels per second of movie, at this zoom, in this much width. */
export function pxPerSecFor(viewportPx: number, durationSec: number, zoomFactor: number): number {
  const fitted = viewportWidth(viewportPx) / movieSeconds(durationSec)
  return fitted * (Number.isFinite(zoomFactor) ? Math.max(FIT, zoomFactor) : FIT)
}

/**
 * How far in this movie can be pushed. Note it can be exactly `FIT`: a movie
 * short enough that fitting it already draws a second wider than
 * `MAX_PX_PER_SEC` has nothing left to zoom into, and the + button says so by
 * being disabled rather than by doing nothing.
 */
export function maxZoomFor(viewportPx: number, durationSec: number): number {
  const atFit = pxPerSecFor(viewportPx, durationSec, FIT)
  return Math.min(ZOOM_CEILING, Math.max(FIT, MAX_PX_PER_SEC / atFit))
}

/** Zoom never goes below fit — there is nothing outside the movie to look at. */
export function clampZoom(zoomFactor: number, viewportPx: number, durationSec: number): number {
  const wanted = Number.isFinite(zoomFactor) ? zoomFactor : FIT
  return Math.min(maxZoomFor(viewportPx, durationSec), Math.max(FIT, wanted))
}

/** The width of the drawn surface: exactly the viewport at fit, wider beyond. */
export function contentWidthFor(viewportPx: number, durationSec: number, zoomFactor: number): number {
  const zoom = clampZoom(zoomFactor, viewportPx, durationSec)
  const movie = movieSeconds(durationSec) * pxPerSecFor(viewportPx, durationSec, zoom)
  return movie + (zoom > FIT ? TRAIL_PX : 0)
}
