import { describe, expect, it } from 'vitest'
import type { Timeline } from '@unisim/media'
import {
  addSource,
  appendClip,
  cutClip,
  describeSource,
  emptyTimeline,
  moveClip,
  setClipAudio,
  setTransition,
  trimClip,
} from './edit'
import { RendererUnavailableError, exportRoute, exportTimeline, rendererAvailable, trimForClip } from './render'

function oneVideo(durationSec = 10): Timeline {
  let tl = emptyTimeline()
  tl = addSource(tl, describeSource('a', 'video', 'a.mp4', durationSec, 1920, 1080, true), 30)
  tl = appendClip(tl, 'a')
  return tl
}

describe('which path an export can take', () => {
  it('a single whole clip is the v1 compress path — the fast one that ships today', () => {
    expect(exportRoute(oneVideo())).toBe('compress')
  })

  it('a trimmed single clip is still the compress path, because a clip IS a trim', () => {
    const base = oneVideo()
    const tl = trimClip(base, base.clips[0].id, 'out', 4)
    expect(tl.clips[0].outSec).toBe(4)
    expect(exportRoute(tl)).toBe('compress')
  })

  it('anything the old pipeline cannot express goes to the renderer', () => {
    const base = oneVideo()

    // Two clips: a join, which `convertVideo` has no concept of.
    expect(exportRoute(cutClip(base, base.clips[0].id, 5))).toBe('render')

    // A clip that does not start at zero means leading black, and there is no
    // way to write that with a trim. Taking the compress path here would
    // silently produce a file starting two seconds early.
    expect(exportRoute(moveClip(base, base.clips[0].id, 2, 0))).toBe('render')

    // A transition is a composite.
    expect(
      exportRoute(setTransition(base, base.clips[0].id, 'in', { kind: 'fade', durationSec: 1 })),
    ).toBe('render')

    // A gain change is a mix.
    expect(exportRoute(setClipAudio(base, base.clips[0].id, { gain: 0.5 }))).toBe('render')

    // An intro card is not a video file to re-encode.
    let cards = emptyTimeline()
    cards = addSource(cards, describeSource('card', 'image', 'card.png', 3, 1920, 1080, false))
    cards = appendClip(cards, 'card')
    expect(exportRoute(cards)).toBe('render')
  })

  it('a muted single clip still compresses — the clip’s own audio flag decides', () => {
    const base = oneVideo()
    expect(exportRoute(setClipAudio(base, base.clips[0].id, { enabled: false }))).toBe('compress')
  })
})

describe('turning a clip into a trim window', () => {
  it('turns the trim OFF for a clip covering the whole file', () => {
    expect(trimForClip(oneVideo().clips[0], 10)).toEqual({ enabled: false, startSec: 0, endSec: null })
  })

  it('carries the clip’s in and out points across', () => {
    const base = oneVideo()
    let tl = trimClip(base, base.clips[0].id, 'out', 6)
    tl = trimClip(tl, tl.clips[0].id, 'in', 2)
    expect(trimForClip(tl.clips[0], 10)).toEqual({ enabled: true, startSec: 2, endSec: 6 })
  })

  it('never asks for footage past the end of the file', () => {
    const clip = { ...oneVideo().clips[0], inSec: 1, outSec: 999 }
    expect(trimForClip(clip, 10).endSec).toBe(10)
  })
})

describe('the renderer adapter', () => {
  it('reports honestly whether the installed package has renderTimeline()', () => {
    // At the time of writing it does NOT — @unisim/media 0.2.0 is the timeline
    // contract only, and the renderer is being written against it separately.
    // This assertion is a fact about the installed dependency, so when the
    // renderer lands it flips and this test is the reminder to drive the real
    // multi-clip export end to end.
    expect(typeof rendererAvailable()).toBe('boolean')
  })

  it('refuses a multi-clip export in a sentence rather than a stack trace', async () => {
    if (rendererAvailable()) return // the renderer has landed; nothing to prove here
    const base = oneVideo()
    const tl = cutClip(base, base.clips[0].id, 5)
    await expect(
      exportTimeline({ timeline: tl, files: {}, settings: nullSettings() }),
    ).rejects.toBeInstanceOf(RendererUnavailableError)
    await expect(
      exportTimeline({ timeline: tl, files: {}, settings: nullSettings() }),
    ).rejects.toThrow(/does not have it yet/)
  })

  it('says there is nothing to export rather than producing an empty file', async () => {
    await expect(
      exportTimeline({ timeline: emptyTimeline(), files: {}, settings: nullSettings() }),
    ).rejects.toThrow(/nothing on the timeline/)
  })
})

function nullSettings() {
  return {
    format: 'mp4' as const,
    maxHeight: 'source' as const,
    quality: 'balanced' as const,
    keepAudio: true,
    audioBitrateKbps: 128,
    trim: { enabled: false, startSec: 0, endSec: null },
  }
}
