import { describe, expect, it } from 'vitest'
import { DEFAULT_VIDEO_SETTINGS, type Timeline } from '@unisim/media'
import { addSource, appendClip, describeSource, emptyTimeline } from './edit'
import {
  DEFAULT_FRAME,
  FRAME_PRESETS,
  MAX_FRAME_EDGE,
  MIN_CUSTOM_EDGE,
  applyFrame,
  customEdge,
  evenEdge,
  frameFor,
  letterbox,
  naturalFrame,
  outputFrame,
  type FrameChoice,
} from './frame'
import { estimateTimelineOutput, peakBytesForTimeline, planTimelineExport } from './memory'

const MiB = 1024 ** 2
const GiB = 1024 ** 3

/** One video source of the given shape, whole, on the timeline. */
function shot(width: number, height: number, seconds = 10): Timeline {
  let tl = emptyTimeline()
  tl = addSource(tl, describeSource('a', 'video', 'a.mp4', seconds, width, height, true), 30)
  return appendClip(tl, 'a')
}

function choose(preset: FrameChoice['preset'], custom = DEFAULT_FRAME.custom): FrameChoice {
  return { preset, custom }
}

describe('what frame a choice asks for', () => {
  it('follows the source until the user says otherwise — today’s behaviour, and the default', () => {
    expect(DEFAULT_FRAME.preset).toBe('source')
    expect(frameFor(DEFAULT_FRAME, shot(1080, 1920))).toEqual({ width: 1080, height: 1920 })
  })

  it('gives the three fixed presets exactly, whatever was dropped', () => {
    const portraitSource = shot(1080, 1920)
    expect(frameFor(choose('landscape'), portraitSource)).toEqual({ width: 1920, height: 1080 })
    expect(frameFor(choose('portrait'), shot(1920, 1080))).toEqual({ width: 1080, height: 1920 })
    expect(frameFor(choose('square'), portraitSource)).toEqual({ width: 1080, height: 1080 })
  })

  it('takes a custom size, and takes it evened', () => {
    expect(frameFor(choose('custom', { width: 1281, height: 719 }), shot(1920, 1080))).toEqual({
      width: 1282,
      height: 720,
    })
  })

  it('does not let a still card decide the movie’s shape', () => {
    // An intro card is a source like any other, but a 400 px logo dropped in
    // front of 4K footage must not resize the export. The first VIDEO decides.
    let tl = emptyTimeline()
    tl = addSource(tl, describeSource('card', 'image', 'card.png', 3, 400, 400, false))
    tl = addSource(tl, describeSource('v', 'video', 'v.mp4', 10, 3840, 2160, true), 30)
    expect(naturalFrame(tl)).toEqual({ width: 3840, height: 2160 })
  })

  it('is nothing at all before the first file lands', () => {
    expect(naturalFrame(emptyTimeline())).toEqual({ width: 0, height: 0 })
  })
})

describe('an odd edge is unreachable', () => {
  // ⚠️ `checkTimeline()` in @unisim/media refuses an odd width or height BEFORE
  // it starts — H.264 codes in 16×16 macroblocks. A control that can produce one
  // walks the user into that refusal at the moment they press Export, so the
  // arithmetic here is what keeps it out of reach.
  it('rounds every custom number to an even one', () => {
    for (let n = MIN_CUSTOM_EDGE; n <= 400; n += 1) {
      expect(customEdge(n) % 2).toBe(0)
      expect(customEdge(n + 0.5) % 2).toBe(0)
    }
  })

  it('clamps nonsense rather than passing it on', () => {
    expect(customEdge(0)).toBe(MIN_CUSTOM_EDGE)
    expect(customEdge(-4000)).toBe(MIN_CUSTOM_EDGE)
    expect(customEdge(1)).toBe(MIN_CUSTOM_EDGE)
    // Anything that isn't a number at all falls to the floor rather than the
    // ceiling: a frame nobody asked for should be the small mistake, not an 8K
    // encode somebody has to sit through.
    expect(customEdge(NaN)).toBe(MIN_CUSTOM_EDGE)
    expect(customEdge(Infinity)).toBe(MIN_CUSTOM_EDGE)
    expect(customEdge(99_999)).toBe(MAX_FRAME_EDGE)
    expect(MAX_FRAME_EDGE % 2).toBe(0)
  })

  it('evens a source whose own dimensions are odd, rather than refusing the export', () => {
    // A file really can report an odd size — H.264 crops to it. Adopting it
    // verbatim as the output frame is what the renderer refuses.
    expect(naturalFrame(shot(641, 361))).toEqual({ width: 642, height: 362 })
    expect(evenEdge(1)).toBe(2)
  })

  it('holds for every preset', () => {
    for (const preset of FRAME_PRESETS) {
      const frame = frameFor(choose(preset.id), shot(641, 361))
      expect(frame.width % 2).toBe(0)
      expect(frame.height % 2).toBe(0)
    }
  })

  it('holds after the resolution cap has scaled the frame too', () => {
    for (const maxHeight of ['source', 2160, 1440, 1080, 720, 480] as const) {
      const frame = outputFrame(shot(1081, 1921), { maxHeight })
      expect(frame.width % 2).toBe(0)
      expect(frame.height % 2).toBe(0)
    }
  })
})

describe('centring the picture and filling the rest black', () => {
  it('pillarboxes a portrait source in a 1920×1080 frame, equally on both sides', () => {
    // The owner's case, verbatim: a portrait video reframed to 1920×1080.
    const box = letterbox(1080, 1920, { width: 1920, height: 1080 })
    // Contain, so the tall edge is what fits: full height, nothing cropped.
    expect(box.height).toBe(1080)
    expect(box.width).toBeCloseTo(607.5, 6)
    // Equal bars left and right, and they add up to the rest of the frame.
    expect(box.sideBars).toBeCloseTo(1312.5, 6)
    expect(box.x).toBeCloseTo(box.sideBars / 2, 6)
    expect(box.x + box.width + box.x).toBeCloseTo(1920, 6)
    // Nothing above or below: the picture reaches the top and bottom edges.
    expect(box.topBars).toBeCloseTo(0, 6)
    expect(box.y).toBeCloseTo(0, 6)
  })

  it('letterboxes a landscape source in a portrait frame, equally top and bottom', () => {
    const box = letterbox(1920, 1080, { width: 1080, height: 1920 })
    expect(box.width).toBe(1080)
    expect(box.height).toBeCloseTo(607.5, 6)
    expect(box.topBars).toBeCloseTo(1312.5, 6)
    expect(box.y).toBeCloseTo(box.topBars / 2, 6)
    expect(box.sideBars).toBeCloseTo(0, 6)
  })

  it('leaves no bars at all when the shapes already agree', () => {
    // A 480×270 clip reframed to 1920×1080 is the same 16:9 — scaled up, but
    // not letterboxed. Bars where none belong would be as wrong as none where
    // they do.
    const box = letterbox(480, 270, { width: 1920, height: 1080 })
    expect(box.sideBars).toBeCloseTo(0, 6)
    expect(box.topBars).toBeCloseTo(0, 6)
    expect(box.width).toBeCloseTo(1920, 6)
  })

  it('never distorts — the drawn picture keeps the source’s aspect ratio', () => {
    for (const [w, h] of [[1080, 1920], [1920, 1080], [640, 640], [1440, 1080]]) {
      for (const frame of [{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }]) {
        const box = letterbox(w, h, frame)
        expect(box.width / box.height).toBeCloseTo(w / h, 6)
        // Contain, never cover: the picture is inside the frame, not spilling.
        expect(box.width).toBeLessThanOrEqual(frame.width + 1e-6)
        expect(box.height).toBeLessThanOrEqual(frame.height + 1e-6)
      }
    }
  })
})

describe('the frame on the timeline', () => {
  it('writes the chosen frame onto the document the renderer reads', () => {
    const tl = applyFrame(shot(1080, 1920), choose('landscape'))
    expect(tl.width).toBe(1920)
    expect(tl.height).toBe(1080)
  })

  it('changes nothing else about the edit', () => {
    const before = shot(1080, 1920)
    const after = applyFrame(before, choose('square'))
    expect(after.clips).toEqual(before.clips)
    expect(after.sources).toEqual(before.sources)
    expect(after.fps).toBe(before.fps)
  })

  it('survives a second file being dropped in', () => {
    // `addSource()` adopts the first video's shape, so re-applying the choice
    // after every edit is what stops a later drop moving the frame back.
    let tl = applyFrame(shot(1080, 1920), choose('landscape'))
    tl = addSource(tl, describeSource('b', 'video', 'b.mp4', 5, 640, 480, true), 30)
    tl = appendClip(tl, 'b')
    expect(applyFrame(tl, choose('landscape'))).toMatchObject({ width: 1920, height: 1080 })
  })
})

describe('the resolution cap and the frame compose', () => {
  it('scales the chosen frame by its SHORT edge, keeping the chosen shape', () => {
    // "1080p" names the short edge, so a 9:16 frame at 1080p is 1080 wide —
    // the frame decides the shape and the cap decides the size.
    const tl = applyFrame(shot(1080, 1920), choose('portrait'))
    expect(outputFrame(tl, { maxHeight: 1080 })).toEqual({ width: 1080, height: 1920 })
    expect(outputFrame(tl, { maxHeight: 720 })).toEqual({ width: 720, height: 1280 })
  })

  it('never scales a frame up', () => {
    const tl = applyFrame(shot(480, 270), choose('source'))
    expect(outputFrame(tl, { maxHeight: 2160 })).toEqual({ width: 480, height: 270 })
  })
})

describe('the memory budget is re-planned when the frame changes', () => {
  it('counts the reframed output, not the source’s own size', () => {
    // Reframing a 480×270 phone-sized clip into 1920×1080 is sixteen times the
    // pixels. §10.4's rule is "refuse before, never crash after", so this has to
    // move the estimate at the moment the frame is chosen.
    const small = shot(480, 270, 60)
    const big = applyFrame(small, choose('landscape'))
    const before = estimateTimelineOutput(small, DEFAULT_VIDEO_SETTINGS)
    const after = estimateTimelineOutput(big, DEFAULT_VIDEO_SETTINGS)
    expect(after.width).toBe(1920)
    expect(after.height).toBe(1080)
    expect(after.bytes).toBeGreaterThan(before.bytes * 8)
  })

  it('refuses a reframe that will not fit, while the user can still change it', () => {
    const source = 200 * MiB
    const small = shot(640, 360, 3600)
    const huge = applyFrame(small, choose('custom', { width: 7680, height: 4320 }))
    expect(planTimelineExport(small, source, DEFAULT_VIDEO_SETTINGS, {
      totalBytes: 1.5 * GiB,
      basis: 'desktop-default',
      deviceMemoryGb: null,
    }).verdict).toBe('ok')

    const refused = planTimelineExport(huge, source, DEFAULT_VIDEO_SETTINGS, {
      totalBytes: 1.5 * GiB,
      basis: 'desktop-default',
      deviceMemoryGb: null,
    })
    expect(refused.verdict).toBe('refuse')
    // And it still ends in something the user can do about it.
    expect(refused.detail.length).toBeGreaterThan(40)
    if (refused.alternative) {
      expect(peakBytesForTimeline(refused.sourceBytes, refused.alternative.estimate)).toBeLessThanOrEqual(
        1.5 * GiB * 0.9,
      )
    }
  })
})
