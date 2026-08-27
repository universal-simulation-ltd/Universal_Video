/**
 * The magnet: where a dragged clip wants to land.
 *
 * Butt-joining two clips by hand is a game of one-pixel accuracy that nobody
 * wins. Miss inwards and the clips overlap — which in this editor is not a
 * near-miss but a different edit, because `freeTrackFor()` resolves a same-track
 * overlap by pushing the clip onto a NEW TRACK. So the punishment for being two
 * pixels out is a second video track and two clips playing at once. Miss
 * outwards and you get a gap, which the exporter writes as black.
 *
 * Hence snapping. It is not a nicety here; it is what makes the ordinary
 * operation — put this clip immediately after that one — achievable with a
 * mouse.
 *
 * ── Two things this file gets right that a naive version does not ────────────
 *
 * **The tolerance is in PIXELS, converted to seconds by the caller.** A fixed
 * 0.2 s would be a third of the timeline when zoomed out to a 3-second clip and
 * invisible at 40× zoom. The magnet has to feel the same at every zoom, so it
 * is a distance on the screen, and the caller divides by `pxPerSec`.
 *
 * **BOTH edges of the dragged clip snap.** Aligning only its head means you can
 * put a clip after another one but never before it — dragging a 5-second clip
 * to sit immediately BEFORE a neighbour needs its tail to find that neighbour's
 * head, which is a start of `neighbourStart − 5`. Half a magnet is more
 * annoying than none, because it works in one direction and fails in the other
 * with no explanation.
 */

import { clipDuration, clipSpan, type Clip, type ClipId, type Timeline } from '@unisim/media'

/** How close, on screen, before the magnet takes hold. */
export const SNAP_PX = 8

export interface Snap {
  /** Where the clip should start. Snapped if it locked on, clamped if not. */
  startSec: number
  /** The instant it locked to, for drawing the guide. Null when it did not. */
  atSec: number | null
  /** Which edge of the dragged clip is sitting on `atSec`. */
  edge: 'head' | 'tail' | null
}

/**
 * Every instant a clip can lock to, ascending and deduplicated.
 *
 * The moving clip's own edges are excluded — a clip cannot snap to where it
 * already is, and including them would make the magnet fight every drag by
 * pulling the clip back to its starting position.
 *
 * Clips on OTHER tracks are included on purpose: lining a clip up with one
 * above or below it is a real thing to want, and it is the same gesture.
 */
export function snapTargets(timeline: Timeline, movingClipId: ClipId, playheadSec?: number): number[] {
  // The start of the movie is always a target. It is where most first clips
  // belong and it is the one edge with no clip to represent it.
  const targets = new Set<number>([0])
  for (const clip of timeline.clips) {
    if (clip.id === movingClipId) continue
    const { start, end } = clipSpan(clip)
    targets.add(start)
    targets.add(end)
  }
  if (playheadSec !== undefined && playheadSec > 0) targets.add(playheadSec)
  return [...targets].sort((a, b) => a - b)
}

/**
 * Where the drag should actually put the clip.
 *
 * Returns the desired position, clamped to zero, when nothing is within
 * tolerance — so a caller can use the result unconditionally and read `atSec`
 * only to decide whether to draw a guide.
 */
export function snapStart(
  timeline: Timeline,
  moving: Clip,
  desiredStartSec: number,
  toleranceSec: number,
  playheadSec?: number,
): Snap {
  const plain: Snap = { startSec: Math.max(0, desiredStartSec), atSec: null, edge: null }
  // A non-positive tolerance means "no magnet" — which is what a caller with a
  // degenerate `pxPerSec` should get, rather than a divide-by-zero landing every
  // clip on top of the first target.
  if (!Number.isFinite(toleranceSec) || toleranceSec <= 0) return plain

  const length = clipDuration(moving)
  let best = plain
  let bestDistance = toleranceSec

  for (const target of snapTargets(timeline, moving.id, playheadSec)) {
    // Head on the target, then tail on the target. Ordered so that a clip
    // equidistant from both readings takes the head one, which is the commoner
    // intent and, more importantly, is deterministic.
    const candidates: { startSec: number; edge: 'head' | 'tail' }[] = [
      { startSec: target, edge: 'head' },
      { startSec: target - length, edge: 'tail' },
    ]
    for (const candidate of candidates) {
      if (candidate.startSec < 0) continue
      const distance = Math.abs(candidate.startSec - desiredStartSec)
      // Strictly closer, so the first target within tolerance wins a tie and
      // the result does not depend on iteration order changing later.
      if (distance < bestDistance - 1e-9) {
        bestDistance = distance
        best = { startSec: candidate.startSec, atSec: target, edge: candidate.edge }
      }
    }
  }

  return best
}

/** The magnet's reach in seconds, at this zoom. */
export function toleranceSecFor(pxPerSec: number): number {
  return pxPerSec > 0 ? SNAP_PX / pxPerSec : 0
}
