import { describe, expect, it } from 'vitest'
import type { Timeline } from '@unisim/media'
import {
  addSource,
  appendClip,
  applyCrossfade,
  describeSource,
  emptyTimeline,
  moveClip,
  setClipAudio,
  setTransition,
} from './edit'
import { audioAt, fitInside, layersAt, opacityAt } from './compose'

function base(): Timeline {
  let tl = emptyTimeline()
  tl = addSource(tl, describeSource('a', 'video', 'a.mp4', 10, 1920, 1080, true), 30)
  tl = addSource(tl, describeSource('b', 'video', 'b.mp4', 10, 1920, 1080, true), 30)
  tl = appendClip(tl, 'a')
  tl = appendClip(tl, 'b')
  return tl
}

describe('what is on screen at one instant', () => {
  it('maps timeline time to the right second of the right source', () => {
    const tl = base()
    expect(layersAt(tl, 3)[0].sourceSec).toBe(3)
    // 12 s into the movie is 2 s into the second clip, not 12 s into it.
    const later = layersAt(tl, 12)
    expect(later[0].clip.sourceId).toBe('b')
    expect(later[0].sourceSec).toBe(2)
  })

  it('follows a trimmed clip’s in-point rather than the timeline’s clock', () => {
    let tl = base()
    tl = { ...tl, clips: tl.clips.map((c, i) => (i === 0 ? { ...c, inSec: 4, outSec: 10, startSec: 0 } : c)) }
    expect(layersAt(tl, 1)[0].sourceSec).toBe(5)
  })

  it('shows nothing in a gap, and nothing past the end', () => {
    let tl = base()
    tl = moveClip(tl, tl.clips[1].id, 15, 0)
    expect(layersAt(tl, 12)).toHaveLength(0)
    expect(layersAt(tl, 99)).toHaveLength(0)
  })

  it('paints the bottom track first so higher tracks cover it', () => {
    let tl = base()
    tl = moveClip(tl, tl.clips[1].id, 2, 0) // auto-tracks up to V2
    const layers = layersAt(tl, 3)
    expect(layers.map((l) => l.clip.track)).toEqual([0, 1])
  })

  it('ends a clip exclusively, so a butt join never shows two frames at once', () => {
    const tl = base()
    expect(layersAt(tl, 10)).toHaveLength(1)
    expect(layersAt(tl, 10)[0].clip.sourceId).toBe('b')
  })
})

describe('transitions in the preview', () => {
  it('ramps a fade-in from black over its own length', () => {
    let tl = base()
    tl = setTransition(tl, tl.clips[0].id, 'in', { kind: 'fade', durationSec: 2 })
    const clip = tl.clips[0]
    expect(opacityAt(clip, 0)).toBe(0)
    expect(opacityAt(clip, 1)).toBe(0.5)
    expect(opacityAt(clip, 2)).toBe(1)
    expect(opacityAt(clip, 5)).toBe(1)
  })

  it('ramps a fade-out to nothing at the very end', () => {
    let tl = base()
    tl = setTransition(tl, tl.clips[0].id, 'out', { kind: 'fade', durationSec: 2 })
    const clip = tl.clips[0]
    expect(opacityAt(clip, 8)).toBe(1)
    expect(opacityAt(clip, 9)).toBe(0.5)
    // 10 is past the end — the clip is gone, not merely transparent.
    expect(opacityAt(clip, 10)).toBe(0)
  })

  it('clamps a transition longer than the clip, exactly as the renderer does', () => {
    let tl = base()
    tl = setTransition(tl, tl.clips[0].id, 'in', { kind: 'fade', durationSec: 30 })
    // Clamped to half of 10 s, so the clip is fully up at 5 s rather than never.
    expect(opacityAt(tl.clips[0], 5)).toBe(1)
  })

  it('shows both clips during a crossfade, the incoming one rising', () => {
    let tl = base()
    tl = applyCrossfade(tl, tl.clips[1].id, 1)
    // The overlap is 9–10.
    const mid = layersAt(tl, 9.5)
    expect(mid).toHaveLength(2)
    expect(mid[0].clip.sourceId).toBe('a')
    expect(mid[0].opacity).toBe(1)
    expect(mid[1].clip.sourceId).toBe('b')
    expect(mid[1].opacity).toBeCloseTo(0.5, 10)
  })
})

describe('sound at one instant', () => {
  it('is silent for a muted clip and full for an untouched one', () => {
    let tl = base()
    tl = setClipAudio(tl, tl.clips[0].id, { enabled: false })
    expect(audioAt(tl, 5)[0].gain).toBe(0)
    expect(audioAt(tl, 15)[0].gain).toBe(1)
  })

  it('does NOT duck the sound during a fade to black', () => {
    // A fade to black with the dialogue still running is a real edit, and a
    // common one. Tying gain to opacity would quietly take it away.
    let tl = base()
    tl = setTransition(tl, tl.clips[0].id, 'out', { kind: 'fade', durationSec: 2 })
    expect(audioAt(tl, 9)[0].gain).toBe(1)
  })

  it('follows the clip’s own gain', () => {
    let tl = base()
    tl = setClipAudio(tl, tl.clips[0].id, { gain: 0.25 })
    expect(audioAt(tl, 5)[0].gain).toBe(0.25)
  })
})

describe('fitting a frame into the output', () => {
  it('letterboxes rather than distorting', () => {
    const box = fitInside(1920, 1080, 1000, 1000)
    expect(box.width).toBeCloseTo(1000, 6)
    expect(box.height).toBeCloseTo(562.5, 6)
    expect(box.y).toBeCloseTo(218.75, 6)
  })

  it('pillarboxes a clip shot upright', () => {
    const box = fitInside(1080, 1920, 1920, 1080)
    expect(box.height).toBe(1080)
    expect(box.x).toBeGreaterThan(0)
  })
})
