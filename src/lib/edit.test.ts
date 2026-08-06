import { describe, expect, it } from 'vitest'
import {
  clipDuration,
  clipSpan,
  clipsOverlap,
  timelineDuration,
  type Clip,
  type Timeline,
  type TimelineSource,
} from '@unisim/media'
import {
  DEFAULT_TRANSITION_SEC,
  MIN_CLIP_SEC,
  addSource,
  appendClip,
  applyCrossfade,
  clipsAt,
  cutAt,
  cutClip,
  deleteClip,
  describeSource,
  emptyTimeline,
  freeTrackFor,
  insertIntro,
  makeClip,
  moveClip,
  setClipAudio,
  setImageDuration,
  setTransition,
  trackCount,
  trimClip,
} from './edit'

// ─── fixtures ───────────────────────────────────────────────────────────────

function video(id: string, name: string, durationSec: number, hasAudio = true): TimelineSource {
  return describeSource(id, 'video', name, durationSec, 1920, 1080, hasAudio)
}

function image(id: string, name: string, durationSec = 3): TimelineSource {
  return describeSource(id, 'image', name, durationSec, 1920, 1080, false)
}

/** Two 10 s clips butt-joined on track 0 — the shape most edits start as. */
function twoClipTimeline(): Timeline {
  let tl = emptyTimeline()
  tl = addSource(tl, video('a', 'a.mp4', 10), 30)
  tl = addSource(tl, video('b', 'b.mp4', 10), 30)
  tl = appendClip(tl, 'a')
  tl = appendClip(tl, 'b')
  return tl
}

function only(timeline: Timeline, sourceId: string): Clip[] {
  return timeline.clips.filter((c) => c.sourceId === sourceId)
}

// ─── building ───────────────────────────────────────────────────────────────

describe('building a timeline', () => {
  it('adopts the first video source’s shape as the output shape', () => {
    let tl = emptyTimeline()
    tl = addSource(tl, describeSource('v', 'video', 'v.mp4', 5, 1280, 720, true), 25)
    expect(tl.width).toBe(1280)
    expect(tl.height).toBe(720)
    expect(tl.fps).toBe(25)
  })

  it('does not let an intro card decide the movie’s frame size', () => {
    // An image added first is better than nothing, but the moment real footage
    // arrives the footage wins — an export at the card's dimensions would be a
    // surprise nobody asked for.
    let tl = emptyTimeline()
    tl = addSource(tl, describeSource('card', 'image', 'card.png', 3, 800, 600, false))
    expect(tl.width).toBe(800)
    tl = addSource(tl, describeSource('v', 'video', 'v.mp4', 5, 1920, 1080, true), 30)
    expect(tl.width).toBe(1920)
    expect(tl.height).toBe(1080)
  })

  it('butt-joins appended clips and measures the movie by its furthest end', () => {
    const tl = twoClipTimeline()
    expect(tl.clips.map((c) => c.startSec)).toEqual([0, 10])
    expect(timelineDuration(tl)).toBe(20)
  })

  it('gives every clip its own audio, enabled only when the source has sound', () => {
    let tl = emptyTimeline()
    tl = addSource(tl, video('loud', 'loud.mp4', 4, true))
    tl = addSource(tl, video('mute', 'mute.mp4', 4, false))
    tl = appendClip(tl, 'loud')
    tl = appendClip(tl, 'mute')
    // Always present, so the audio lane has something to draw either way.
    expect(tl.clips.every((c) => c.audio !== undefined)).toBe(true)
    expect(only(tl, 'loud')[0].audio.enabled).toBe(true)
    expect(only(tl, 'mute')[0].audio.enabled).toBe(false)
  })
})

// ─── the cut: the one that has to be right ──────────────────────────────────

describe('cutting at the playhead', () => {
  it('splits one clip into two that adjoin exactly', () => {
    const tl = twoClipTimeline()
    const first = tl.clips[0]
    const cut = cutClip(tl, first.id, 4)

    expect(cut.clips).toHaveLength(3)
    const [left, right] = cut.clips
    expect(clipSpan(left)).toEqual({ start: 0, end: 4 })
    expect(clipSpan(right)).toEqual({ start: 4, end: 10 })
    // No frame invented and none lost: the halves are still 10 s of source.
    expect(clipDuration(left) + clipDuration(right)).toBeCloseTo(10, 10)
    expect(left.outSec).toBe(right.inSec)
    // Touching end-to-start is not an overlap, so this has not accidentally
    // created a stack.
    expect(clipsOverlap(left, right)).toBe(false)
  })

  it('CUTS THE AUDIO AT THE SAME INSTANT AS THE PICTURE', () => {
    // The reason `Clip` carries its own audio and there is no parallel array of
    // audio clips. Nothing in `cutClip` lines the two up: there is one object,
    // so the audio boundary IS the picture boundary. This test is what would
    // start failing the day somebody models audio separately.
    const tl = twoClipTimeline()
    const cut = cutClip(tl, tl.clips[0].id, 3.7)
    const [left, right] = cut.clips

    // The picture boundary.
    expect(clipSpan(left).end).toBe(clipSpan(right).start)
    // The audio boundary — the audio of a clip spans exactly the clip, because
    // it is the clip's own field rather than a second object with its own times.
    expect(audioSpan(left).end).toBe(audioSpan(right).start)
    expect(audioSpan(left).end).toBe(clipSpan(left).end)
    // ...and in source time too, so the sound does not jump at the seam.
    expect(left.outSec).toBe(right.inSec)
    expect(right.audio.enabled).toBe(left.audio.enabled)
    expect(right.audio.gain).toBe(left.audio.gain)
  })

  it('gives each half its own audio object, so muting one is not muting both', () => {
    const tl = twoClipTimeline()
    const cut = cutClip(tl, tl.clips[0].id, 5)
    const [left, right] = cut.clips
    expect(left.audio).not.toBe(right.audio)

    const muted = setClipAudio(cut, right.id, { enabled: false })
    expect(muted.clips[0].audio.enabled).toBe(true)
    expect(muted.clips[1].audio.enabled).toBe(false)
  })

  it('keeps a fade-in on the head and a fade-out on the tail, and puts neither on the seam', () => {
    let tl = twoClipTimeline()
    tl = setTransition(tl, tl.clips[0].id, 'in', { kind: 'fade', durationSec: 1 })
    tl = setTransition(tl, tl.clips[0].id, 'out', { kind: 'fade', durationSec: 1 })
    const cut = cutClip(tl, tl.clips[0].id, 5)
    const [left, right] = cut.clips

    expect(left.transitionIn?.kind).toBe('fade')
    expect(left.transitionOut).toBeUndefined()
    expect(right.transitionIn).toBeUndefined()
    expect(right.transitionOut?.kind).toBe('fade')
  })

  it('refuses to cut on a clip’s own edge, where there is nothing to split', () => {
    const tl = twoClipTimeline()
    expect(cutClip(tl, tl.clips[0].id, 0).clips).toHaveLength(2)
    expect(cutClip(tl, tl.clips[0].id, 10).clips).toHaveLength(2)
    expect(cutClip(tl, tl.clips[0].id, MIN_CLIP_SEC / 2).clips).toHaveLength(2)
  })

  it('razors every clip standing under the playhead, on every track', () => {
    let tl = twoClipTimeline()
    // A second video track covering the same instant.
    tl = appendClip(tl, 'b')
    tl = moveClip(tl, tl.clips[2].id, 0, 1)
    expect(clipsAt(tl, 5)).toHaveLength(2)

    const cut = cutAt(tl, 5)
    // Three clips became five: the two under the playhead were split, and the
    // one that was nowhere near it was left alone.
    expect(tl.clips).toHaveLength(3)
    expect(cut.clips).toHaveLength(5)
    expect(cut.clips.filter((c) => Math.abs(clipSpan(c).start - 5) < 1e-9)).toHaveLength(2)
  })

  it('leaves the timeline untouched when the playhead is in a gap', () => {
    const tl = twoClipTimeline()
    expect(cutAt(tl, 25).clips).toHaveLength(2)
  })
})

// ─── trim ───────────────────────────────────────────────────────────────────

describe('trimming', () => {
  it('drags the head without sliding the material sideways', () => {
    const tl = twoClipTimeline()
    const trimmed = trimClip(tl, tl.clips[0].id, 'in', 2)
    const clip = trimmed.clips[0]
    // The frame that was at 2 s on the timeline is still at 2 s on the timeline.
    expect(clip.inSec).toBe(2)
    expect(clip.startSec).toBe(2)
    expect(clipSpan(clip).end).toBe(10)
  })

  it('drags the tail in', () => {
    const tl = twoClipTimeline()
    const trimmed = trimClip(tl, tl.clips[0].id, 'out', 6)
    expect(trimmed.clips[0].outSec).toBe(6)
    expect(clipDuration(trimmed.clips[0])).toBe(6)
  })

  it('never trims past the source’s own bounds', () => {
    let tl = twoClipTimeline()
    // Ask for a tail 40 s into a 10 s file: there is no such footage.
    tl = trimClip(tl, tl.clips[0].id, 'out', 40)
    expect(tl.clips[0].outSec).toBe(10)
    // Ask for a head before the start of the file.
    tl = trimClip(tl, tl.clips[0].id, 'in', -5)
    expect(tl.clips[0].inSec).toBe(0)
    expect(tl.clips[0].startSec).toBe(0)
  })

  it('never trims to nothing', () => {
    let tl = twoClipTimeline()
    tl = trimClip(tl, tl.clips[0].id, 'in', 9.99)
    expect(clipDuration(tl.clips[0])).toBeCloseTo(MIN_CLIP_SEC, 10)
    tl = trimClip(tl, tl.clips[0].id, 'out', 0)
    expect(clipDuration(tl.clips[0])).toBeGreaterThanOrEqual(MIN_CLIP_SEC)
  })

  it('trims a half of a cut clip without disturbing the other half', () => {
    const base = twoClipTimeline()
    const cut = cutClip(base, base.clips[0].id, 5)
    const trimmed = trimClip(cut, cut.clips[1].id, 'out', 8)
    expect(clipSpan(trimmed.clips[0])).toEqual({ start: 0, end: 5 })
    expect(clipSpan(trimmed.clips[1])).toEqual({ start: 5, end: 8 })
    // And the audio came with it, because it is the same object.
    expect(audioSpan(trimmed.clips[1])).toEqual({ start: 5, end: 8 })
  })
})

// ─── delete ─────────────────────────────────────────────────────────────────

describe('deleting', () => {
  it('removes the clip and leaves the gap where it was', () => {
    const tl = twoClipTimeline()
    const gone = deleteClip(tl, tl.clips[0].id)
    expect(gone.clips).toHaveLength(1)
    // Deliberately no ripple: an editor that silently closes gaps moves footage
    // the user never touched.
    expect(gone.clips[0].startSec).toBe(10)
    expect(timelineDuration(gone)).toBe(20)
  })

  it('keeps the source in the bin, so it can be used again', () => {
    const base = twoClipTimeline()
    const tl = deleteClip(base, base.clips[0].id)
    expect(tl.clips.some((c) => c.sourceId === 'a')).toBe(false)
    expect(tl.sources.map((s) => s.id)).toContain('a')
  })
})

// ─── dragging and auto-track ────────────────────────────────────────────────

describe('dragging a clip', () => {
  it('moves it along its own track when there is room', () => {
    const tl = twoClipTimeline()
    const moved = moveClip(tl, tl.clips[1].id, 12, 0)
    expect(moved.clips[1].startSec).toBe(12)
    expect(moved.clips[1].track).toBe(0)
  })

  it('never lets a clip start before zero', () => {
    const tl = twoClipTimeline()
    expect(moveClip(tl, tl.clips[1].id, -4, 0).clips[1].startSec).toBe(0)
  })

  it('ADDS A TRACK when two videos are slid on top of each other', () => {
    // The owner's sentence, mechanised: sliding B over A does not overwrite A
    // and does not refuse the drop. It stacks, and the timeline grows.
    const tl = twoClipTimeline()
    expect(trackCount(tl)).toBe(1)

    const stacked = moveClip(tl, tl.clips[1].id, 5, 0)
    expect(stacked.clips[1].track).toBe(1)
    expect(stacked.clips[1].startSec).toBe(5)
    expect(trackCount(stacked)).toBe(2)
    // Both still exist, and they really do overlap in time.
    expect(clipsOverlap(stacked.clips[0], stacked.clips[1])).toBe(true)
  })

  it('climbs to the first free track rather than always to the top', () => {
    let tl = twoClipTimeline()
    tl = moveClip(tl, tl.clips[1].id, 5, 0) // → track 1
    tl = appendClip(tl, 'a') // a third clip at the end of the movie
    const third = tl.clips[2].id
    // Drop it over the top of both: 0 and 1 are taken there, so it lands on 2.
    tl = moveClip(tl, third, 6, 0)
    expect(tl.clips[2].track).toBe(2)

    // But a spot where only track 0 is busy goes to track 1, not to track 3.
    let tl2 = twoClipTimeline()
    tl2 = appendClip(tl2, 'a')
    tl2 = moveClip(tl2, tl2.clips[2].id, 2, 0)
    expect(tl2.clips[2].track).toBe(1)
  })

  it('drops onto a higher track directly when the user aims at one', () => {
    const tl = twoClipTimeline()
    const moved = moveClip(tl, tl.clips[0].id, 0, 2)
    expect(moved.clips[0].track).toBe(2)
  })

  it('counts a touching neighbour as room, not as a collision', () => {
    // Clips that meet end-to-start do not overlap (the contract says so), so
    // butt-joining must not push anything up a track.
    const tl = twoClipTimeline()
    const moved = moveClip(tl, tl.clips[1].id, 10, 0)
    expect(moved.clips[1].track).toBe(0)
  })

  it('freeTrackFor ignores the clip being moved', () => {
    const tl = twoClipTimeline()
    expect(freeTrackFor(tl, tl.clips[0], 0, 0)).toBe(0)
  })
})

// ─── intro and outro ────────────────────────────────────────────────────────

describe('intro and outro cards', () => {
  it('pushes the whole movie later to make room for an intro', () => {
    let tl = twoClipTimeline()
    tl = addSource(tl, image('card', 'title.png', 3))
    tl = insertIntro(tl, 'card')

    expect(tl.clips[0].sourceId).toBe('card')
    expect(clipSpan(tl.clips[0])).toEqual({ start: 0, end: 3 })
    expect(tl.clips[1].startSec).toBe(3)
    expect(tl.clips[2].startSec).toBe(13)
    expect(timelineDuration(tl)).toBe(23)
  })

  it('puts an outro after everything, including after a stacked track', () => {
    let tl = twoClipTimeline()
    tl = moveClip(tl, tl.clips[1].id, 15, 0)
    tl = addSource(tl, image('end', 'end.png', 4))
    tl = appendClip(tl, 'end')
    expect(tl.clips[2].startSec).toBe(25)
    expect(timelineDuration(tl)).toBe(29)
  })

  it('an intro card trims and moves like any other clip', () => {
    // The reason the contract makes an image a source rather than a special
    // case: nothing downstream has to know it is a card.
    let tl = emptyTimeline()
    tl = addSource(tl, image('card', 'title.png', 3))
    tl = appendClip(tl, 'card')
    tl = trimClip(tl, tl.clips[0].id, 'out', 1.5)
    expect(clipDuration(tl.clips[0])).toBe(1.5)
    tl = moveClip(tl, tl.clips[0].id, 4, 0)
    expect(clipSpan(tl.clips[0])).toEqual({ start: 4, end: 5.5 })
  })

  it('a card with no sound still has an audio field to draw', () => {
    let tl = emptyTimeline()
    tl = addSource(tl, image('card', 'title.png'))
    tl = appendClip(tl, 'card')
    expect(tl.clips[0].audio).toEqual({ enabled: false, gain: 1 })
  })
})

describe('changing a card’s length', () => {
  it('stretches the clips cut from it that ran to its old end', () => {
    let tl = emptyTimeline()
    tl = addSource(tl, image('card', 'title.png', 3))
    tl = appendClip(tl, 'card')
    tl = setImageDuration(tl, 'card', 6)
    expect(tl.sources[0].durationSec).toBe(6)
    expect(clipDuration(tl.clips[0])).toBe(6)
  })

  it('never leaves a clip longer than the source it is a piece of', () => {
    let tl = emptyTimeline()
    tl = addSource(tl, image('card', 'title.png', 10))
    tl = appendClip(tl, 'card')
    tl = trimClip(tl, tl.clips[0].id, 'out', 8)
    tl = setImageDuration(tl, 'card', 2)
    expect(tl.clips[0].outSec).toBeLessThanOrEqual(2)
    expect(clipDuration(tl.clips[0])).toBeGreaterThanOrEqual(MIN_CLIP_SEC)
  })

  it('does nothing to a video source, whose length is a fact about the file', () => {
    const tl = setImageDuration(twoClipTimeline(), 'a', 99)
    expect(tl.sources[0].durationSec).toBe(10)
  })
})

// ─── transitions ────────────────────────────────────────────────────────────

describe('transitions', () => {
  it('sets and clears a fade on either end', () => {
    let tl = twoClipTimeline()
    tl = setTransition(tl, tl.clips[0].id, 'out', { kind: 'fade', durationSec: 1 })
    expect(tl.clips[0].transitionOut).toEqual({ kind: 'fade', durationSec: 1 })
    tl = setTransition(tl, tl.clips[0].id, 'out', null)
    expect(tl.clips[0].transitionOut).toBeUndefined()
  })

  it('a crossfade really overlaps the clip before it', () => {
    // A crossfade with nothing to dissolve into is a fade from black — legible,
    // but not what was asked for. So the clip slides back to make the overlap.
    let tl = twoClipTimeline()
    tl = applyCrossfade(tl, tl.clips[1].id, DEFAULT_TRANSITION_SEC)

    expect(tl.clips[1].startSec).toBeCloseTo(10 - DEFAULT_TRANSITION_SEC, 10)
    expect(tl.clips[1].transitionIn).toEqual({ kind: 'crossfade', durationSec: DEFAULT_TRANSITION_SEC })
    expect(clipsOverlap(tl.clips[0], tl.clips[1])).toBe(true)
    // Both are still on the same track — this is the one operation allowed to
    // stack on one track, because a crossfade IS an overlap.
    expect(tl.clips[0].track).toBe(tl.clips[1].track)
    expect(timelineDuration(tl)).toBeCloseTo(20 - DEFAULT_TRANSITION_SEC, 10)
  })

  it('ripples the clips after it so the join does not spring a gap', () => {
    let tl = twoClipTimeline()
    tl = appendClip(tl, 'a') // three in a row: 0–10, 10–20, 20–30
    tl = applyCrossfade(tl, tl.clips[1].id, 1)
    expect(tl.clips[1].startSec).toBe(9)
    expect(tl.clips[2].startSec).toBe(19)
  })

  it('clamps the overlap to half the shorter clip', () => {
    let tl = emptyTimeline()
    tl = addSource(tl, video('short', 's.mp4', 1))
    tl = appendClip(tl, 'short')
    tl = appendClip(tl, 'short')
    tl = applyCrossfade(tl, tl.clips[1].id, 4)
    expect(tl.clips[1].transitionIn?.durationSec).toBe(0.5)
  })

  it('with nothing before it, a crossfade is set but nothing moves', () => {
    let tl = twoClipTimeline()
    tl = applyCrossfade(tl, tl.clips[0].id, 1)
    expect(tl.clips[0].startSec).toBe(0)
    expect(tl.clips[0].transitionIn?.kind).toBe('crossfade')
  })
})

// ─── purity ─────────────────────────────────────────────────────────────────

describe('every operation is pure', () => {
  it('never mutates the timeline it was given', () => {
    const tl = twoClipTimeline()
    const before = JSON.stringify(tl)
    cutClip(tl, tl.clips[0].id, 5)
    trimClip(tl, tl.clips[0].id, 'out', 2)
    moveClip(tl, tl.clips[0].id, 30, 3)
    deleteClip(tl, tl.clips[0].id)
    setTransition(tl, tl.clips[0].id, 'in', { kind: 'fade', durationSec: 1 })
    setClipAudio(tl, tl.clips[0].id, { enabled: false })
    applyCrossfade(tl, tl.clips[1].id, 1)
    insertIntro(tl, 'a')
    expect(JSON.stringify(tl)).toBe(before)
  })

  it('ignores an id that isn’t on the timeline instead of throwing', () => {
    const tl = twoClipTimeline()
    expect(cutClip(tl, 'nope', 5)).toBe(tl)
    expect(trimClip(tl, 'nope', 'in', 5)).toBe(tl)
    expect(moveClip(tl, 'nope', 5, 0)).toBe(tl)
    expect(setTransition(tl, 'nope', 'in', null)).toBe(tl)
  })
})

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Where a clip's SOUND sits on the timeline.
 *
 * It is `clipSpan` — and that is the point. There is no second span to compute,
 * because there is no second object. If this helper ever needs to consult
 * something other than the clip itself, the model has drifted.
 */
function audioSpan(clip: Clip): { start: number; end: number } {
  return clipSpan(clip)
}

describe('makeClip', () => {
  it('starts as the whole source', () => {
    const clip = makeClip(video('x', 'x.mp4', 7))
    expect(clip.inSec).toBe(0)
    expect(clip.outSec).toBe(7)
    expect(clipDuration(clip)).toBe(7)
  })
})
