import { describe, expect, it } from 'vitest'
import {
  EMPTY_TIMELINE_SEC,
  FALLBACK_VIEWPORT_PX,
  FIT,
  MAX_PX_PER_SEC,
  TRAIL_PX,
  ZOOM_CEILING,
  ZOOM_STEP,
  clampZoom,
  contentWidthFor,
  maxZoomFor,
  pxPerSecFor,
} from './zoom'

// The promise this file has to keep is one sentence long: at fit, the movie is
// exactly as wide as the player's picture. Everything else here is the guard
// rail around the division that makes it true.

describe('fit', () => {
  it('draws the whole movie in exactly the width it is given', () => {
    for (const [width, duration] of [
      [720, 2],
      [720, 3600],
      [341, 12.5],
      [1280, 0.4],
    ] as const) {
      expect(contentWidthFor(width, duration, FIT)).toBeCloseTo(width, 6)
      // …which is what makes the needle land where the player's own scrub bar
      // says it should: t/duration of the width, by construction.
      const pxPerSec = pxPerSecFor(width, duration, FIT)
      expect(0.25 * duration * pxPerSec).toBeCloseTo(width * 0.25, 6)
    }
  })

  it('adds no trailing room at fit, and some once zoomed in', () => {
    expect(contentWidthFor(720, 10, FIT)).toBe(720)
    expect(contentWidthFor(720, 10, 2)).toBe(720 * 2 + TRAIL_PX)
  })
})

describe('zoomFactor', () => {
  it('scales the width by the factor', () => {
    expect(pxPerSecFor(600, 30, 2)).toBeCloseTo(pxPerSecFor(600, 30, 1) * 2, 9)
    expect(pxPerSecFor(600, 30, ZOOM_STEP)).toBeCloseTo(20 * ZOOM_STEP, 9)
  })

  it('never zooms out past fit — there is nothing outside the movie', () => {
    expect(clampZoom(0.25, 720, 10)).toBe(FIT)
    expect(clampZoom(-3, 720, 10)).toBe(FIT)
    expect(pxPerSecFor(720, 10, 0.1)).toBe(pxPerSecFor(720, 10, FIT))
  })
})

describe('bounds', () => {
  it('stops zooming in once a second is MAX_PX_PER_SEC wide', () => {
    // Ten minutes in 720 px is 1.2 px/s at fit, so the limit is a long way in.
    const max = maxZoomFor(720, 600)
    expect(pxPerSecFor(720, 600, max)).toBeCloseTo(MAX_PX_PER_SEC, 6)
    expect(clampZoom(1e6, 720, 600)).toBe(max)
  })

  it('caps the multiple itself so the surface stays layout-able', () => {
    // Ten hours: MAX_PX_PER_SEC would want a factor of 60 000 and a 43M px surface.
    expect(maxZoomFor(720, 36_000)).toBe(ZOOM_CEILING)
    expect(clampZoom(1e6, 720, 36_000)).toBe(ZOOM_CEILING)
    expect(contentWidthFor(720, 36_000, 1e6)).toBeLessThan(3e6)
  })

  it('refuses to zoom a movie that is already finer than the ceiling', () => {
    // 2 s in 720 px is 360 px/s at fit — nearly MAX_PX_PER_SEC already, and a
    // 0.5 s movie is well past it. The + button reads this and disables.
    expect(maxZoomFor(720, 0.5)).toBe(FIT)
    expect(clampZoom(4, 720, 0.5)).toBe(FIT)
  })
})

describe('the divide-by-zero guards', () => {
  it('survives an empty timeline without an Infinity or a NaN', () => {
    for (const duration of [0, -1, NaN, Infinity]) {
      const pxPerSec = pxPerSecFor(720, duration, FIT)
      expect(Number.isFinite(pxPerSec)).toBe(true)
      expect(pxPerSec).toBe(720 / EMPTY_TIMELINE_SEC)
      expect(Number.isFinite(contentWidthFor(720, duration, FIT))).toBe(true)
      expect(Number.isFinite(maxZoomFor(720, duration))).toBe(true)
    }
  })

  it('survives a width that has not been measured yet', () => {
    for (const width of [0, -10, NaN, Infinity]) {
      expect(pxPerSecFor(width, 10, FIT)).toBe(FALLBACK_VIEWPORT_PX / 10)
    }
  })

  it('survives a nonsense zoom', () => {
    expect(pxPerSecFor(720, 10, NaN)).toBe(72)
    expect(clampZoom(NaN, 720, 10)).toBe(FIT)
  })
})
