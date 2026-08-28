import { describe, expect, it } from 'vitest'
import { DEFAULT_VIDEO_SETTINGS, type ConvertedFile, type Timeline } from '@unisim/media'
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
import { applyFrame } from './frame'
import {
  exportName,
  exportRoute,
  exportTimeline,
  rendererAvailable,
  runSegments,
  trimForClip,
  type PieceSink,
  type SegmentProgress,
} from './render'
import { cutAt } from './edit'

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

  it('A REFRAMED CLIP GOES TO THE RENDERER, because convertVideo cannot letterbox', () => {
    // `convertVideo()` scales the source's own frame to a height; it has no
    // frame of its own to compose into. Taking the compress path for a reframe
    // would produce a file the source's shape with the reframe silently
    // dropped — the whole failure mode this feature invites.
    const portrait = applyFrame(oneVideo(), { preset: 'landscape', custom: { width: 1920, height: 1080 } })
    expect(portrait.width).toBe(1920)
    expect(exportRoute(applyFrame(oneVideo(), { preset: 'square', custom: { width: 1920, height: 1080 } })))
      .toBe('render')
    expect(exportRoute(applyFrame(oneVideo(), { preset: 'custom', custom: { width: 1280, height: 720 } })))
      .toBe('render')
  })

  it('…but a frame that matches the source is still the fast path', () => {
    const tl = applyFrame(oneVideo(), { preset: 'source', custom: { width: 1920, height: 1080 } })
    expect(exportRoute(tl)).toBe('compress')
    // Including when the source's own dimensions were odd and had to be evened:
    // rounding a 1919-wide file up to 1920 is not a reframe.
    let odd = emptyTimeline()
    odd = addSource(odd, describeSource('o', 'video', 'o.mp4', 10, 1919, 1080, true), 30)
    odd = appendClip(odd, 'o')
    expect(exportRoute(applyFrame(odd, { preset: 'source', custom: { width: 1920, height: 1080 } })))
      .toBe('compress')
  })

  it('sends a single clip cut from a DIFFERENT source than the frame to the renderer', () => {
    // Two files of different shapes; the frame follows the first video, so the
    // clip left on the timeline has to be letterboxed into it.
    let tl = emptyTimeline()
    tl = addSource(tl, describeSource('wide', 'video', 'wide.mp4', 10, 1920, 1080, true), 30)
    tl = addSource(tl, describeSource('tall', 'video', 'tall.mp4', 10, 1080, 1920, true), 30)
    tl = appendClip(tl, 'tall')
    expect(exportRoute(tl)).toBe('render')
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
  it('has the timeline renderer available in the installed package', () => {
    // Not a tautology: this asserts a fact about the DEPENDENCY. The editor was
    // built against a throwing shim while @unisim/media 0.3.0 was being written,
    // and this is the test that fails if a future install drops back to a
    // version without renderTimeline() — which would otherwise show up as a
    // multi-clip export dying at the moment somebody pressed the button.
    expect(rendererAvailable()).toBe(true)
  })

  it('names the export after the first video, because an edit has no input file', () => {
    const base = oneVideo()
    expect(exportName(base)).toMatch(/-edit\.mp4$/)
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

/* ── The batch, and what survives a failure half-way through ─────────────────
 *
 * There is no WebCodecs under vitest, so the encoder is stubbed through
 * `runSegments`' `encodePiece` seam. That is not a gap in the coverage: the
 * encoding is `exportTimeline`'s job and is proved in the Playwright specs
 * against real MP4s. What is proved HERE is the part those specs cannot force —
 * what happens when piece three of five does not come back.
 *
 * The old behaviour was to throw, which discarded the two finished pieces along
 * with it. Getting that right is entirely bookkeeping, and bookkeeping is
 * exactly what a unit test is for.
 */
describe('writing a batch of separate files', () => {
  /** A 100 s video cut into `pieces` equal parts. */
  function cutInto(pieces: number): Timeline {
    let tl = oneVideo(100)
    for (let i = 1; i < pieces; i += 1) tl = cutAt(tl, (100 / pieces) * i)
    return tl
  }

  /** An encoder that hands back a blob of `bytes`, failing on the named piece. */
  function fakeEncoder(options: { failAt?: number; bytes?: number } = {}) {
    let call = 0
    return async (): Promise<ConvertedFile> => {
      call += 1
      if (call === options.failAt) throw new Error('a frame would not decode')
      return { blob: new Blob([new Uint8Array(options.bytes ?? 128)]), name: 'ignored.mp4' }
    }
  }

  /** A sink that records what it was given, the way the in-tab path does. */
  function recordingSink() {
    const taken: { name: string; bytes: number }[] = []
    const sink: PieceSink = {
      accept: async (file) => void taken.push({ name: file.name, bytes: file.blob.size }),
    }
    return { sink, taken }
  }

  it('writes every piece, in order, under the segment’s own name', async () => {
    const { sink, taken } = recordingSink()
    const outcome = await runSegments(
      { timeline: cutInto(3), files: {}, settings: DEFAULT_VIDEO_SETTINGS },
      sink,
      { encodePiece: fakeEncoder() },
    )
    expect(outcome.failure).toBeNull()
    expect(outcome.written).toHaveLength(3)
    // ⚠️ The SEGMENT's name, not `exportName()`. Three files called
    // `a-edit.mp4` is not a zip, and the sink is where that would go wrong.
    expect(taken.map((t) => t.name)).toEqual(outcome.written.map((w) => w.name))
    expect(taken[0].name).toMatch(/^1_a_00-00-00\.mp4$|^01_a_00-00-00\.mp4$/)
  })

  it('⚠️ keeps the pieces that finished when a later one fails', async () => {
    // THE item. Two good encodes used to be thrown away because the third
    // failed; they are files, and they are kept.
    const { sink, taken } = recordingSink()
    const outcome = await runSegments(
      { timeline: cutInto(5), files: {}, settings: DEFAULT_VIDEO_SETTINGS },
      sink,
      { encodePiece: fakeEncoder({ failAt: 3 }) },
    )
    expect(outcome.written).toHaveLength(2)
    expect(taken).toHaveLength(2)
    expect(outcome.failure?.piece.index).toBe(3)
    expect(outcome.failure?.piece.total).toBe(5)
    expect(outcome.failure?.reason).toBe('a frame would not decode')
  })

  it('names every piece that is missing, starting with the one that stopped it', async () => {
    // A partial zip that does not say what is not in it is worse than no zip:
    // it opens, two files are there, and nothing says a third was ever meant to
    // exist. The names are the ones the pieces WOULD have had.
    const { sink } = recordingSink()
    const outcome = await runSegments(
      { timeline: cutInto(5), files: {}, settings: DEFAULT_VIDEO_SETTINGS },
      sink,
      { encodePiece: fakeEncoder({ failAt: 3 }) },
    )
    expect(outcome.failure?.missing).toHaveLength(3)
    expect(outcome.failure?.missing[0]).toContain('3_')
    // And no name appears both as written and as missing.
    const written = new Set(outcome.written.map((w) => w.name))
    expect(outcome.failure?.missing.filter((m) => written.has(m))).toEqual([])
  })

  it('treats a sink that stops accepting as the same kind of failure as an encode', async () => {
    // A file handle that dies mid-batch — the disk filled, the volume was
    // ejected — needs the same answer as a bad frame: these pieces are written,
    // these are not, and here is why. If the sink were outside the try it would
    // reject the whole run instead and lose them.
    const taken: string[] = []
    const sink: PieceSink = {
      accept: async (file) => {
        if (taken.length === 2) throw new Error('no space left on the disk')
        taken.push(file.name)
      },
    }
    const outcome = await runSegments(
      { timeline: cutInto(4), files: {}, settings: DEFAULT_VIDEO_SETTINGS },
      sink,
      { encodePiece: fakeEncoder() },
    )
    expect(outcome.written).toHaveLength(2)
    expect(outcome.failure?.piece.index).toBe(3)
    expect(outcome.failure?.reason).toBe('no space left on the disk')
  })

  it('reports nothing written when the very first piece fails', async () => {
    // The one case that is still a plain error rather than a partial result:
    // an archive of no files is not something to offer anybody.
    const { sink } = recordingSink()
    const outcome = await runSegments(
      { timeline: cutInto(3), files: {}, settings: DEFAULT_VIDEO_SETTINGS },
      sink,
      { encodePiece: fakeEncoder({ failAt: 1 }) },
    )
    expect(outcome.written).toEqual([])
    expect(outcome.failure?.missing).toHaveLength(3)
  })

  it('banks a piece only once it has been accepted, not once it has been encoded', async () => {
    // The store adds these up for the progress readout and the overrun warning.
    // Counting a piece the sink then refused would show bytes that are not in
    // the archive.
    const done: SegmentProgress[] = []
    const sink: PieceSink = {
      accept: async () => {
        if (done.length === 1) throw new Error('the volume went away')
      },
    }
    await runSegments({ timeline: cutInto(3), files: {}, settings: DEFAULT_VIDEO_SETTINGS }, sink, {
      encodePiece: fakeEncoder({ bytes: 64 }),
      onPieceDone: (piece) => void done.push(piece),
    })
    expect(done).toHaveLength(1)
    expect(done[0].index).toBe(1)
  })

  it('refuses a timeline that cannot be split at all, before encoding anything', async () => {
    // Not a batch that failed — a mistake to catch before the button. It throws,
    // and it throws with the reason `separateBlocked` gives.
    let encoded = 0
    await expect(
      runSegments({ timeline: oneVideo(10), files: {}, settings: DEFAULT_VIDEO_SETTINGS }, recordingSink().sink, {
        encodePiece: async () => {
          encoded += 1
          return { blob: new Blob([]), name: 'x.mp4' }
        },
      }),
    ).rejects.toThrow(/Nothing is cut yet/)
    expect(encoded).toBe(0)
  })
})
