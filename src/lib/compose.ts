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
