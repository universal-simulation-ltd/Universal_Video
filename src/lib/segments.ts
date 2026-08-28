/**
 * One timeline → several files.
 *
 * The client ask this exists for: *"cut a video at multiple points and export
 * each piece separately, as a zip."* Almost all of that was already built —
 * `cutAt()` turns one clip into several and the timeline draws them, so
 * "multiple cut points" needs no new marking UI at all. What was missing is one
 * sentence of intent at export time: **do not join these back together.**
 *
 * So this file adds no editing verb. It answers two questions about a timeline
 * that already exists:
 *
 *   1. Can this edit be split into files at all? (`separateBlocked`)
 *   2. If so, which pieces, in what order, called what? (`segmentsOf`)
 *
 * ── Why each piece is its own one-clip Timeline ───────────────────────────────
 *
 * A segment is exported by handing `exportTimeline()` a timeline holding just
 * that clip, with `startSec` normalised to 0. That is not a convenience: read
 * `exportRoute()` in `render.ts` and every one of its five conditions is then
 * satisfied, so each piece takes the **`compress` route** — `convertVideo()`
 * with a trim, the path this app has shipped and been proven on since v1. N
 * pieces therefore reuse the oldest, best-tested code in the product rather
 * than introducing a second way to be wrong.
 *
 * The normalisation is what earns that. A clip sitting at 1:32 of the timeline
 * exported as-is would be a piece with 92 seconds of black at the head, because
 * `startSec` means "where the black stops" — see the same comment on
 * `exportRoute`.
 */

import { clipSpan, type Clip, type Timeline } from '@unisim/media'
import { sourceOf } from './edit'

export type ExportMode = 'one' | 'separate'

export interface Segment {
  clip: Clip
  /** 1-based, in timeline order — the number that appears in the file name. */
  index: number
  /** What this piece is called inside the zip. Unique by construction. */
  name: string
  /** Seconds of finished video this piece is, on its own. */
  durationSec: number
  /**
   * The piece as a whole edit: one clip, at zero, in the movie's chosen frame.
   * `exportTimeline()` takes this directly.
   */
  timeline: Timeline
}

/**
 * Why this timeline cannot be written out as separate files, or `null` if it
 * can.
 *
 * Every branch names the fix rather than only saying no — the same rule the
 * memory refusal follows, and for the same reason: a greyed-out control with no
 * explanation is indistinguishable from a broken one.
 *
 * The rule is "this instant belongs to exactly one piece" — NOT "nothing
 * interesting is happening". A dissolve used to be refused because a crossfade
 * belongs to two pieces at once; that is now answered rather than dodged (see
 * `segmentsOf`): the dissolve renders into the piece it STARTS in, and the
 * piece it lands in begins after it. James's call, 2026-08-28.
 *
 * What is still refused is genuine simultaneity: two clips on different tracks
 * play at the same moment for real, and no ordering of files reproduces that.
 */
export function separateBlocked(timeline: Timeline): string | null {
  const clips = timeline.clips
  if (clips.length === 0) return 'There is nothing on the timeline to export yet.'

  if (clips.length === 1) {
    return 'Nothing is cut yet — move the playhead to where you want a split and press the Cut button beside it. Every piece you cut becomes its own file.'
  }

  if (clips.some((c) => c.track !== 0)) {
    return 'Separate files needs one row of clips. Two stacked clips play at the same moment, so they cannot be two files — slide the top one down beside the others first.'
  }

  // Overlaps are allowed — that is what a crossfade IS here (`applyCrossfade`
  // slides the incoming clip back over its neighbour on the SAME track). What
  // is not allowed is an overlap the handover rule cannot describe: the rule
  // hands one dissolve from each clip to its immediate successor, so a clip
  // buried inside another, or three clips sharing an instant, has no answer.
  const ordered = [...clips].sort((a, b) => a.startSec - b.startSec)
  for (let i = 0; i < ordered.length; i++) {
    const a = clipSpan(ordered[i])
    for (let j = i + 1; j < ordered.length; j++) {
      const b = clipSpan(ordered[j])
      if (b.start >= a.end - EPS) break // ordered by start: nothing later overlaps either
      if (j !== i + 1) {
        return 'Three clips overlap at the same moment, so there is no order to write them out in. Slide them apart until each one only meets its neighbour, or export as one video.'
      }
      if (b.end <= a.end + EPS) {
        return 'One clip sits entirely inside another, so it has no piece of its own. Slide it out past the end of the clip underneath it, or export as one video.'
      }
    }
  }

  return null
}

/** Timeline seconds are floats off a decoder; comparisons need a hair of slack. */
const EPS = 1e-6

/**
 * The pieces, in timeline order. Empty when `separateBlocked()` says no.
 *
 * ── The handover rule, which is the only interesting thing in here ──────────
 *
 * A dissolve is two clips overlapping in time, and the question that kept this
 * feature refusing them was "which file does the crossfade go in?". The answer
 * taken (James, 2026-08-28) is: **the piece it STARTS in.**
 *
 * So for clips A and B overlapping over [s, e]:
 *
 *     A's piece covers  A.start → A.end   and CONTAINS B's head over [s, e],
 *                                          so the dissolve actually renders
 *     B's piece covers  A.end   → B.end   — it begins where the dissolve ended
 *
 * Every instant is therefore in exactly one file, the dissolve appears exactly
 * once, and it appears where the viewer expects it: at the end of the piece
 * they were watching. Playing the pieces back to back reproduces the edit.
 *
 * ⚠️ A dissolving piece is the ONE case where a piece is not a single clip, so
 * it does not take the `compress` route described in the header — it composes,
 * like the joined export does. That is a slower path but not a new one.
 *
 * ⚠️ `transitionIn` is stripped from the clip whose head was handed over, and
 * `transitionOut` from the borrowed head. Leaving either on plays the same
 * dissolve twice, once in each file, which is precisely the duplication this
 * whole rule exists to prevent.
 */
export function segmentsOf(timeline: Timeline): Segment[] {
  if (separateBlocked(timeline)) return []

  const ordered = [...timeline.clips].sort((a, b) => a.startSec - b.startSec)

  return ordered.map((clip, i) => {
    const span = clipSpan(clip)
    const next = ordered[i + 1]
    const nextSpan = next ? clipSpan(next) : null

    // Where this piece begins: after any dissolve the PREVIOUS piece has
    // already rendered.
    const from = i > 0 ? Math.max(span.start, clipSpan(ordered[i - 1]).end) : span.start
    const to = span.end
    const headCut = Math.max(0, from - span.start)

    const main: Clip = {
      ...clip,
      inSec: clip.inSec + headCut,
      // The whole point — see the file header. Zero, so this is a trim and not
      // a piece with a minute and a half of black in front of it.
      startSec: 0,
      transitionIn: headCut > EPS ? undefined : clip.transitionIn,
    }

    // The next clip's head, when it dissolves into this piece's tail. Truncated
    // at this piece's end: only the overlapping seconds belong here.
    const incoming: Clip | null =
      next && nextSpan && nextSpan.start < to - EPS
        ? {
            ...next,
            outSec: next.inSec + (to - nextSpan.start),
            startSec: nextSpan.start - from,
            transitionOut: undefined,
          }
        : null

    const clips = incoming ? [main, incoming] : [main]
    const used = new Set(clips.map((c) => c.sourceId))
    const source = sourceOf(timeline, clip)

    return {
      clip,
      index: i + 1,
      // The in-point AFTER the handover — where this piece really starts in the
      // original, which is the question a name gets asked.
      name: segmentName(source?.name ?? 'clip', i + 1, ordered.length, clip.inSec + headCut),
      durationSec: to - from,
      timeline: {
        ...timeline,
        // Only the sources this piece actually reads. The others are not
        // touched, and the export's own memory story is simpler for it.
        sources: timeline.sources.filter((s) => used.has(s.id)),
        clips,
      },
    }
  })
}

/**
 * `01_holiday_00-01-32.mp4`
 *
 * The index leads so that **sorting the unzipped folder by name reproduces the
 * timeline order**, which is the one property that matters when someone opens a
 * zip of five pieces of the same film. It is zero-padded to the width of the
 * count for the same reason: `10_` sorting before `2_` is the classic way to
 * lose that ordering at exactly ten pieces.
 *
 * The timecode is the piece's in-point **in its own source**, not its position
 * on the timeline. For a video cut into five they are usually the same number;
 * where they differ — a piece was deleted, or clips came from two files — the
 * source in-point is the one that answers the question a name gets asked, which
 * is *"where in the original did this come from?"*
 */
export function segmentName(sourceName: string, index: number, count: number, inSec: number): string {
  const width = Math.max(2, String(count).length)
  const stem = safeStem(sourceName)
  return `${String(index).padStart(width, '0')}_${stem}_${stamp(inSec)}.mp4`
}

/** `00-01-32` — a timecode a file system will take, and one that sorts. */
export function stamp(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join('-')
}

/** What the zip itself is called. */
export function zipName(timeline: Timeline): string {
  const firstVideo = timeline.sources.find((s) => s.kind === 'video') ?? timeline.sources[0]
  return `${safeStem(firstVideo?.name ?? 'edit')}-pieces.zip`
}

/**
 * A file name's stem, made safe to write and short enough to read.
 *
 * Zip entry names are UTF-8 here, so this is not about encoding — it is about
 * the file system the zip is UNPACKED onto. `:` and `/` are illegal on Windows
 * and macOS respectively, and a 90-character stem repeated across forty pieces
 * makes a folder nobody can scan.
 */
export function safeStem(name: string, maxLength = 40): string {
  const stem = name.replace(/\.[^.]+$/, '')
  const cleaned = stem
    .replace(/[^\p{L}\p{N}\-_. ]+/gu, '-')
    .replace(/[-\s]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  if (!cleaned) return 'clip'
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).replace(/-+$/, '') : cleaned
}
