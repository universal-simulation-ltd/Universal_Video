/**
 * What is on screen, and what is audible, at one instant of the timeline.
 *
 * The player is a `<canvas>` that draws whatever this function returns. Keeping
 * it pure means the thing most likely to be wrong — which frame of which source
 * belongs at time t, and at what opacity during a transition — is unit-tested
 * rather than eyeballed at 30 fps.
 *
 * This is NOT the renderer. `@unisim/media`'s `renderTimeline()` decides what
 * the exported file looks like; this decides what the preview looks like, and
 * the two agree because they read the same `Timeline` and clamp transitions the
 * same way. If they ever disagree visibly, this file is the one that is wrong.
 */

import { clipSpan, type Clip, type Timeline } from '@unisim/media'
import { effectiveTransitionSec } from './edit'

export interface Layer {
  clip: Clip
  /** Seconds INTO THE SOURCE to show — what a `<video>`'s `currentTime` is set to. */
  sourceSec: number
  /** 0–1. Below 1 only during a transition. */
  opacity: number
}

export interface AudioLevel {
  clip: Clip
  sourceSec: number
  /** Linear gain to apply to this clip's element right now. 0 = silent. */
  gain: number
}

/**
 * The layers to draw at `atSec`, in painting order: bottom video track first,
 * higher tracks over the top of it.
 *
 * Both transition kinds come back as the same alpha ramp. That is not a
 * simplification — the difference between them is what is UNDERNEATH: a
 * `crossfade` has another clip beneath it, a `fade` has the black the canvas is
 * cleared to. Painting in track order onto black therefore renders both
 * correctly with one code path.
 */
export function layersAt(timeline: Timeline, atSec: number): Layer[] {
  return timeline.clips
    .filter((clip) => {
      const { start, end } = clipSpan(clip)
      return atSec >= start && atSec < end
    })
    .sort((a, b) => a.track - b.track || a.startSec - b.startSec)
    .map((clip) => ({
      clip,
      sourceSec: clip.inSec + (atSec - clip.startSec),
      opacity: opacityAt(clip, atSec),
    }))
}

/** Where a clip is in its own fade, at one instant. 1 outside any transition. */
export function opacityAt(clip: Clip, atSec: number): number {
  const { start, end } = clipSpan(clip)
  if (atSec < start || atSec >= end) return 0

  const inSec = effectiveTransitionSec(clip, 'in')
  const outSec = effectiveTransitionSec(clip, 'out')

  let opacity = 1
  if (inSec > 0 && atSec < start + inSec) opacity = Math.min(opacity, (atSec - start) / inSec)
  if (outSec > 0 && atSec > end - outSec) opacity = Math.min(opacity, (end - atSec) / outSec)
  return clamp01(opacity)
}

/**
 * What each clip's sound should be doing at `atSec`.
 *
 * The gain does NOT follow the picture's fade. A fade to black with the dialogue
 * still running is a real edit and a common one; tying them together would take
 * that away and would surprise anyone who has used an editor before. The audio
 * lane is drawn under its clip because it belongs to that clip, not because it
 * is a copy of the video lane.
 */
export function audioAt(timeline: Timeline, atSec: number): AudioLevel[] {
  return timeline.clips
    .filter((clip) => {
      const { start, end } = clipSpan(clip)
      return atSec >= start && atSec < end
    })
    .sort((a, b) => a.track - b.track || a.startSec - b.startSec)
    .map((clip) => ({
      clip,
      sourceSec: clip.inSec + (atSec - clip.startSec),
      gain: clip.audio.enabled ? Math.max(0, clip.audio.gain) : 0,
    }))
}

/**
 * Fit a source frame inside the output frame without distorting it — the same
 * "contain" the exporter uses, so the preview is not a different crop from the
 * file that comes out.
 */
export function fitInside(
  sourceWidth: number,
  sourceHeight: number,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0) return { x: 0, y: 0, width: frameWidth, height: frameHeight }
  const scale = Math.min(frameWidth / sourceWidth, frameHeight / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  return { x: (frameWidth - width) / 2, y: (frameHeight - height) / 2, width, height }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/**
 * How much of the frame a covering layer may miss and still count as covering
 * it, in output-frame pixels.
 *
 * Two, not zero, because the frame's edges are rounded to EVEN numbers
 * (`evenEdge`, for H.264's macroblocks) — so a 1919×1080 source lands in a
 * 1920×1080 frame and is one pixel short of filling it through no fault of the
 * user's. Two, not more, because the cost of being wrong is asymmetric: getting
 * this too generous means a genuinely visible bar of the layer below is culled
 * and shows black instead. A miss of two frame pixels is about a third of a
 * pixel in the 640-wide preview, which is below anything that can be drawn.
 */
const COVER_EPSILON = 2

export interface LayerSize {
  width: number
  height: number
}

/**
 * Drawn *contained*, does a source of this shape fill the whole output frame?
 *
 * ⚠️ **This is the entire safety of the culling below, and it is not "is this
 * the top layer".** Every layer is drawn with `fitInside` — contain, never
 * cover — so a portrait clip in a landscape frame is pillarboxed, and the black
 * down its sides is not black: it is whatever is UNDERNEATH. A naive "the
 * topmost layer wins" cull would blank those bars, throwing away picture the
 * user can currently see. Only a layer whose own aspect matches the frame's
 * actually hides what is below it.
 */
export function coversFrame(
  sourceWidth: number,
  sourceHeight: number,
  frameWidth: number,
  frameHeight: number,
): boolean {
  if (sourceWidth <= 0 || sourceHeight <= 0 || frameWidth <= 0 || frameHeight <= 0) return false
  const box = fitInside(sourceWidth, sourceHeight, frameWidth, frameHeight)
  return box.width >= frameWidth - COVER_EPSILON && box.height >= frameHeight - COVER_EPSILON
}

/**
 * The layers that can actually be seen: everything hidden behind a fully opaque,
 * frame-filling layer is dropped.
 *
 * Stacking two clips means two simultaneous `<video>` decodes, and on a modest
 * machine that is the difference between a preview that plays and one that
 * stutters — so a layer nobody can see should not be costing anything to draw.
 *
 * Two conditions, both necessary:
 *
 * - **Fully opaque.** A layer mid-transition is see-through *by definition*;
 *   that is what a crossfade IS, and culling under one would delete the outgoing
 *   scene from the dissolve.
 * - **Fills the frame.** See `coversFrame` — a pillarboxed clip shows the layer
 *   beneath it down both sides.
 *
 * `sizeOf` returning null means "I do not know how big this is yet" (a `<video>`
 * that has not loaded its metadata), and is treated as NOT covering. Culling on
 * a guess would blank the picture for the few frames before a source loads.
 *
 * ⚠️ **This is about the PICTURE only.** A clip hidden behind another is still
 * audible — that is an ordinary edit, not a mistake — so nothing here may be
 * used to decide what to play. See `Player.syncMedia`, which pauses a hidden
 * source only when it is also silent.
 */
export function visibleLayers(
  layers: Layer[],
  frameWidth: number,
  frameHeight: number,
  sizeOf: (layer: Layer) => LayerSize | null,
): Layer[] {
  // Downwards from the top, because the HIGHEST cover is the one that matters:
  // it hides everything below it, including any lower cover.
  for (let i = layers.length - 1; i >= 1; i -= 1) {
    const layer = layers[i]
    if (layer.opacity < 1) continue
    const size = sizeOf(layer)
    if (!size) continue
    if (coversFrame(size.width, size.height, frameWidth, frameHeight)) return layers.slice(i)
  }
  return layers
}
