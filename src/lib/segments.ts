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

import { clipDuration, clipsOverlap, type Clip, type Timeline } from '@unisim/media'
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
 * The rules are deliberately strict. Separate files means "this instant belongs
 * to exactly one piece", and a stacked or dissolving timeline has instants that
 * belong to two. Rather than invent an answer for those (which file does a
 * crossfade go in?) the mode is simply not offered until the timeline is the
 * plain row of cuts the feature is for.
 */
export function separateBlocked(timeline: Timeline): string | null {
  const clips = timeline.clips
  if (clips.length === 0) return 'There is nothing on the timeline to export yet.'

  if (clips.length === 1) {
    return 'Nothing is cut yet — put the playhead where you want a split and press “Cut at playhead”. Every piece you cut becomes its own file.'
  }

  if (clips.some((c) => c.track !== 0)) {
    return 'Separate files needs one row of clips. Two stacked clips play at the same moment, so they cannot be two files — slide the top one down beside the others first.'
  }

  if (clips.some((c) => c.transitionIn || c.transitionOut)) {
    return 'Separate files needs no transitions. A crossfade belongs to two pieces at once, so there is no file to put it in — take the transitions off, or export as one video.'
  }

  // Reachable without a transition only by an unusual sequence of drags, but a
  // silent duplicate of the overlapping seconds in two files would be worse
  // than a refusal that says so.
  const overlapping = clips.some((a, i) => clips.some((b, j) => j > i && clipsOverlap(a, b)))
  if (overlapping) {
    return 'Two clips overlap in time, so the same moment would end up in two files. Slide them apart first, or export as one video.'
  }

  return null
}

/** The pieces, in timeline order. Empty when `separateBlocked()` says no. */
export function segmentsOf(timeline: Timeline): Segment[] {
  if (separateBlocked(timeline)) return []

  const ordered = [...timeline.clips].sort((a, b) => a.startSec - b.startSec)

  return ordered.map((clip, i) => {
    const source = sourceOf(timeline, clip)
    return {
      clip,
      index: i + 1,
      name: segmentName(source?.name ?? 'clip', i + 1, ordered.length, clip.inSec),
      durationSec: clipDuration(clip),
      timeline: {
        ...timeline,
        // Only the source this piece is cut from. The others are not read, and
        // the export's own memory story is simpler for it.
        sources: source ? [source] : [],
        // The whole point — see the file header. Zero, so this is a trim and
        // not a piece with a minute and a half of black in front of it.
        clips: [{ ...clip, startSec: 0 }],
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
