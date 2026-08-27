import { describe, expect, it } from 'vitest'
import { clipSpan, type Timeline } from '@unisim/media'
import { addSource, appendClip, cutAt, describeSource, emptyTimeline, moveClip } from './edit'
import { SNAP_PX, snapStart, snapTargets, toleranceSecFor } from './snap'

/** Two 10-second clips, butt-joined at 10 s, on track 0. */
function twoClips(): Timeline {
  let tl = emptyTimeline()
  tl = addSource(tl, describeSource('a', 'video', 'a.mp4', 20, 1920, 1080, true), 30)
  tl = appendClip(tl, 'a')
  return cutAt(tl, 10)
}

// 20 px per second — so the 8 px magnet reaches 0.4 s.
const PX = 20
const TOL = toleranceSecFor(PX)

describe('where a dragged clip can lock on', () => {
  it('offers the start of the movie even when no clip is there', () => {
    expect(snapTargets(emptyTimeline(), 'nobody')).toEqual([0])
  })

  it('offers both edges of every OTHER clip', () => {
    const tl = twoClips()
    expect(snapTargets(tl, tl.clips[0].id)).toEqual([0, 10, 20])
  })

  it('⚠️ never offers the moving clip its own edges', () => {
    // A clip that can snap to where it already is has a magnet that fights
    // every drag, pulling it back to the position you are dragging it out of.
    const tl = twoClips()
    const moving = tl.clips[1]
    const targets = snapTargets(tl, moving.id)
    expect(targets).not.toContain(clipSpan(moving).end)
    expect(targets).toEqual([0, 10])
  })

  it('offers the playhead, but not a playhead sitting at zero', () => {
    const tl = twoClips()
    expect(snapTargets(tl, tl.clips[0].id, 4.2)).toContain(4.2)
    expect(snapTargets(tl, tl.clips[0].id, 0)).toEqual([0, 10, 20])
  })
})

describe('the magnet', () => {
  it('butt-joins a clip dragged just short of its neighbour', () => {
    const tl = twoClips()
    const moving = tl.clips[1]
    const snap = snapStart(tl, moving, 9.8, TOL)
    expect(snap.startSec).toBe(10)
    expect(snap.atSec).toBe(10)
    expect(snap.edge).toBe('head')
  })

  it('butt-joins one dragged just PAST it, which is the overlap this exists to prevent', () => {
    // Two pixels too far is not a near miss in this editor: a same-track
    // overlap is resolved by moving the clip to a new track, so the punishment
    // for imprecision is a second video track.
    const tl = twoClips()
    const snap = snapStart(tl, tl.clips[1], 10.3, TOL)
    expect(snap.startSec).toBe(10)
  })

  it('⚠️ snaps the TAIL too, so a clip can be placed BEFORE its neighbour', () => {
    // Half a magnet is worse than none. Aligning only the head lets you put a
    // clip AFTER another one and never before it — sitting a 5-second clip
    // immediately in front of a neighbour means its TAIL finding that
    // neighbour's head, which is a start of `neighbourStart − 5`.
    let tl = emptyTimeline()
    tl = addSource(tl, describeSource('a', 'video', 'a.mp4', 10, 1920, 1080, true), 30)
    tl = appendClip(tl, 'a')
    tl = addSource(tl, describeSource('b', 'video', 'b.mp4', 5, 1920, 1080, true))
    tl = appendClip(tl, 'b')
    const [first, moving] = tl.clips
    tl = moveClip(tl, first.id, 20, 0) // neighbour now sits at 20–30

    const snap = snapStart(tl, moving, 14.8, TOL)
    expect(snap.startSec).toBe(15) // 20 − 5: its end meets the neighbour's start
    expect(snap.atSec).toBe(20)
    expect(snap.edge).toBe('tail')
  })

  it('locks a head onto a neighbour’s tail', () => {
    const tl = twoClips()
    const snap = snapStart(tl, tl.clips[1], 9.85, TOL)
    expect(snap.startSec).toBe(10)
    expect(snap.edge).toBe('head')
  })

  it('leaves a clip alone when nothing is near', () => {
    const tl = twoClips()
    const snap = snapStart(tl, tl.clips[1], 14, TOL)
    expect(snap.startSec).toBe(14)
    expect(snap.atSec).toBeNull()
    expect(snap.edge).toBeNull()
  })

  it('⚠️ reaches the same distance ON SCREEN at every zoom', () => {
    // A tolerance in seconds would be a third of the timeline on a 3-second
    // clip zoomed out, and unusable at 40x. 0.39 s away is inside the magnet at
    // 20 px/s and far outside it at 200 px/s — same drag, same pixels, and that
    // is the point.
    const tl = twoClips()
    expect(snapStart(tl, tl.clips[1], 9.61, toleranceSecFor(20)).atSec).toBe(10)
    expect(snapStart(tl, tl.clips[1], 9.61, toleranceSecFor(200)).atSec).toBeNull()
    expect(toleranceSecFor(20)).toBeCloseTo(SNAP_PX / 20, 9)
  })

  it('never places a clip before the start of the movie', () => {
    const tl = twoClips()
    expect(snapStart(tl, tl.clips[1], -5, TOL).startSec).toBe(0)
  })

  it('turns itself off rather than dividing by zero', () => {
    const tl = twoClips()
    expect(toleranceSecFor(0)).toBe(0)
    const snap = snapStart(tl, tl.clips[1], 9.8, 0)
    expect(snap.startSec).toBe(9.8)
    expect(snap.atSec).toBeNull()
  })

  it('picks the nearest target when two are in reach', () => {
    let tl = emptyTimeline()
    tl = addSource(tl, describeSource('a', 'video', 'a.mp4', 30, 1920, 1080, true), 30)
    tl = appendClip(tl, 'a')
    tl = cutAt(tl, 10)
    tl = cutAt(tl, 10.5)
    const moving = tl.clips[0]
    // 10.4 is nearer 10.5 than 10; a wide tolerance must still choose the
    // closer one rather than the first one it happens to iterate over.
    expect(snapStart(tl, moving, 10.4, 1).atSec).toBe(10.5)
    expect(snapStart(tl, moving, 10.1, 1).atSec).toBe(10)
  })
})
