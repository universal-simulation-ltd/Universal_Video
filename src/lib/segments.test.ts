import { describe, expect, it } from 'vitest'
import { timelineDuration, type Timeline } from '@unisim/media'
import {
  addSource,
  appendClip,
  applyCrossfade,
  cutAt,
  deleteClip,
  describeSource,
  emptyTimeline,
  moveClip,
  setTransition,
} from './edit'
import { safeStem, segmentName, segmentsOf, separateBlocked, stamp, zipName } from './segments'
import { exportRoute } from './render'

/** One 60-second 1920×1080 video on the timeline — the client's actual case. */
function oneVideo(name = 'holiday.mp4', seconds = 60): Timeline {
  let tl = emptyTimeline()
  tl = addSource(tl, describeSource('v', 'video', name, seconds, 1920, 1080, true), 30)
  return appendClip(tl, 'v')
}

/** That video cut at each of `points`, in seconds. */
function cutAtAll(timeline: Timeline, points: number[]): Timeline {
  return points.reduce((tl, at) => cutAt(tl, at), timeline)
}

describe('what can be split into files', () => {
  it('will not offer separate files before anything is cut — and says which control to use', () => {
    const blocked = separateBlocked(oneVideo())
    expect(blocked).toContain('press the Cut button')
  })

  it('offers them as soon as there is more than one piece', () => {
    expect(separateBlocked(cutAtAll(oneVideo(), [20, 40]))).toBeNull()
  })

  it('refuses a stacked timeline, because two clips at one instant are not two files', () => {
    const tl = cutAtAll(oneVideo(), [20, 40])
    const stacked = moveClip(tl, tl.clips[2].id, 5, 1)
    expect(stacked.clips.some((c) => c.track === 1)).toBe(true)
    expect(separateBlocked(stacked)).toContain('one row of clips')
  })

  it('refuses a transition, because a crossfade has no file to live in', () => {
    const tl = cutAtAll(oneVideo(), [20, 40])
    const faded = setTransition(tl, tl.clips[1].id, 'out', { kind: 'fade', durationSec: 1 })
    expect(separateBlocked(faded)).toContain('no transitions')
  })

  it('refuses overlapping clips rather than putting the same seconds in two files', () => {
    const tl = cutAtAll(oneVideo(), [20, 40])
    // applyCrossfade slides the clip back over its neighbour AND sets the
    // transition, so this is caught either way — the point is that it IS
    // caught, not which rule catches it.
    expect(separateBlocked(applyCrossfade(tl, tl.clips[1].id, 1))).not.toBeNull()
  })

  it('says there is nothing to export when the timeline is empty', () => {
    expect(separateBlocked(emptyTimeline())).toContain('nothing on the timeline')
  })
})

describe('the pieces themselves', () => {
  it('produces one piece per cut, in timeline order, covering the whole video', () => {
    const tl = cutAtAll(oneVideo('holiday.mp4', 60), [20, 45])
    const pieces = segmentsOf(tl)
    expect(pieces).toHaveLength(3)
    expect(pieces.map((p) => Math.round(p.durationSec))).toEqual([20, 25, 15])
    // Nothing is lost and nothing is duplicated: the pieces add up to the movie.
    const total = pieces.reduce((sum, p) => sum + p.durationSec, 0)
    expect(total).toBeCloseTo(timelineDuration(tl), 5)
  })

  it('carries each piece’s own in-point, so the pieces are the cuts and not three copies', () => {
    const pieces = segmentsOf(cutAtAll(oneVideo('holiday.mp4', 60), [20, 45]))
    expect(pieces.map((p) => Math.round(p.clip.inSec))).toEqual([0, 20, 45])
    expect(pieces.map((p) => Math.round(p.clip.outSec))).toEqual([20, 45, 60])
  })

  it('⚠️ starts every piece at zero — the whole reason each one is a trim and not black', () => {
    // A piece left at its timeline position would export as 45 seconds of black
    // followed by the picture. `startSec` is "where the black stops".
    const pieces = segmentsOf(cutAtAll(oneVideo('holiday.mp4', 60), [20, 45]))
    expect(pieces.map((p) => p.timeline.clips[0].startSec)).toEqual([0, 0, 0])
  })

  it('⚠️ hands every piece to the proven v1 path, which is why this needed no new renderer', () => {
    // The load-bearing claim of the whole feature: each piece satisfies all five
    // of `exportRoute`'s conditions, so N pieces are N runs of `convertVideo()`
    // — the oldest and best-tested code in the app — rather than N runs of
    // anything written for this.
    const pieces = segmentsOf(cutAtAll(oneVideo('holiday.mp4', 60), [20, 45]))
    expect(pieces.map((p) => exportRoute(p.timeline))).toEqual(['compress', 'compress', 'compress'])
  })

  it('keeps the movie’s chosen frame on every piece, so a reframe is not lost on the way out', () => {
    const tl = cutAtAll(oneVideo(), [30])
    const reframed: Timeline = { ...tl, width: 1080, height: 1920 }
    for (const piece of segmentsOf(reframed)) {
      expect(piece.timeline.width).toBe(1080)
      expect(piece.timeline.height).toBe(1920)
      // …and a piece whose source is a different shape from the frame must NOT
      // take the compress route, because `convertVideo()` cannot letterbox.
      expect(exportRoute(piece.timeline)).toBe('render')
    }
  })

  it('carries only the source a piece is actually cut from', () => {
    const pieces = segmentsOf(cutAtAll(oneVideo(), [30]))
    expect(pieces.every((p) => p.timeline.sources.length === 1)).toBe(true)
  })

  it('does not export a gap left by a deleted clip', () => {
    const tl = cutAtAll(oneVideo('holiday.mp4', 60), [20, 45])
    const gapped = deleteClip(tl, tl.clips[1].id)
    const pieces = segmentsOf(gapped)
    expect(pieces).toHaveLength(2)
    // The joined movie still runs to 60 s (the gap is written as black); the
    // pieces are 35 s between them. This is the difference the estimate has to
    // know about.
    expect(timelineDuration(gapped)).toBe(60)
    expect(pieces.reduce((sum, p) => sum + p.durationSec, 0)).toBeCloseTo(35, 5)
  })

  it('returns nothing at all when the timeline is not splittable', () => {
    expect(segmentsOf(oneVideo())).toEqual([])
  })
})

describe('what the files are called', () => {
  it('leads with a zero-padded index so the unzipped folder sorts into timeline order', () => {
    const names = segmentsOf(cutAtAll(oneVideo('holiday.mp4', 60), [20, 45])).map((p) => p.name)
    expect(names).toEqual([
      '01_holiday_00-00-00.mp4',
      '02_holiday_00-00-20.mp4',
      '03_holiday_00-00-45.mp4',
    ])
    expect([...names].sort()).toEqual(names)
  })

  it('⚠️ pads to the width of the COUNT, or ten pieces sort 10 before 2', () => {
    expect(segmentName('a.mp4', 2, 9, 0)).toBe('02_a_00-00-00.mp4')
    expect(segmentName('a.mp4', 2, 120, 0)).toBe('002_a_00-00-00.mp4')
    const many = [1, 2, 10].map((n) => segmentName('a.mp4', n, 10, 0))
    expect([...many].sort()).toEqual(many)
  })

  it('stamps the in-point in the SOURCE, which is where the piece came from', () => {
    expect(stamp(0)).toBe('00-00-00')
    expect(stamp(92)).toBe('00-01-32')
    expect(stamp(3661)).toBe('01-01-01')
    expect(stamp(-5)).toBe('00-00-00')
  })

  it('makes a stem the unzipping file system will take', () => {
    expect(safeStem('my holiday: Rome/Paris.mp4')).toBe('my-holiday-Rome-Paris')
    expect(safeStem('....mp4')).toBe('clip')
    expect(safeStem('a'.repeat(90) + '.mp4')).toHaveLength(40)
    // Not everybody's file names are ASCII, and mangling them would be worse
    // than the illegal characters this is guarding against.
    expect(safeStem('vidéo été.mov')).toBe('vidéo-été')
  })

  it('names the zip after the first video', () => {
    expect(zipName(cutAtAll(oneVideo('holiday.mp4'), [30]))).toBe('holiday-pieces.zip')
  })
})
