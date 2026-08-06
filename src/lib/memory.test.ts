import { describe, expect, it } from 'vitest'
import { DEFAULT_VIDEO_SETTINGS, timelineDuration, type MemoryBudget, type Timeline } from '@unisim/media'
import { addSource, appendClip, applyCrossfade, describeSource, emptyTimeline } from './edit'
import { estimateTimelineOutput, peakBytesForTimeline, planTimelineExport } from './memory'

const MiB = 1024 ** 2
const GiB = 1024 ** 3

function budget(totalBytes: number): MemoryBudget {
  return { totalBytes, basis: 'desktop-default', deviceMemoryGb: null }
}

/** `count` clips of `seconds` each, butt-joined, 1920×1080 at 30 fps. */
function timelineOf(count: number, seconds: number): Timeline {
  let tl = emptyTimeline()
  for (let i = 0; i < count; i += 1) {
    tl = addSource(tl, describeSource(`s${i}`, 'video', `s${i}.mp4`, seconds, 1920, 1080, true), 30)
    tl = appendClip(tl, `s${i}`)
  }
  return tl
}

describe('estimating the finished movie', () => {
  it('measures the movie by its furthest end, not by adding the clips up', () => {
    // Two 10 s clips crossfaded by 1 s make a 19 s movie. Summing the clips
    // would say 20 and would be wrong in the other direction across a gap.
    let tl = timelineOf(2, 10)
    tl = applyCrossfade(tl, tl.clips[1].id, 1)
    expect(timelineDuration(tl)).toBe(19)
    expect(estimateTimelineOutput(tl, DEFAULT_VIDEO_SETTINGS).seconds).toBe(19)
  })

  it('drops the audio bitrate when every clip on the timeline is silent', () => {
    let tl = emptyTimeline()
    tl = addSource(tl, describeSource('q', 'video', 'q.mp4', 10, 1920, 1080, false), 30)
    tl = appendClip(tl, 'q')
    expect(estimateTimelineOutput(tl, DEFAULT_VIDEO_SETTINGS).audioBitrate).toBe(0)
  })

  it('honours the resolution cap by the short edge', () => {
    const tl = timelineOf(1, 5)
    const estimate = estimateTimelineOutput(tl, { ...DEFAULT_VIDEO_SETTINGS, maxHeight: 720 })
    expect(estimate.height).toBe(720)
    expect(estimate.width).toBe(1280)
  })
})

describe('refusing before, never crashing after', () => {
  it('lets an ordinary edit through', () => {
    const plan = planTimelineExport(timelineOf(2, 10), 40 * MiB, DEFAULT_VIDEO_SETTINGS, budget(1.5 * GiB))
    expect(plan.verdict).toBe('ok')
    expect(plan.detail).toBe('')
  })

  it('COUNTS EVERY SOURCE ON THE TIMELINE, not just the biggest one', () => {
    // This is the whole reason this file exists rather than calling
    // `planConversion()`. The pipeline reads each source into memory in full,
    // so four clips is four resident files — an edit can die on a machine where
    // any one of its clips would have converted comfortably.
    const tl = timelineOf(4, 20)
    const one = planTimelineExport(tl, 400 * MiB, DEFAULT_VIDEO_SETTINGS, budget(1.5 * GiB))
    const four = planTimelineExport(tl, 4 * 400 * MiB, DEFAULT_VIDEO_SETTINGS, budget(1.5 * GiB))
    expect(one.verdict).toBe('ok')
    expect(four.verdict).toBe('refuse')
    expect(four.peakBytes - one.peakBytes).toBe(3 * 400 * MiB)
  })

  it('budgets the source files plus two copies of the output', () => {
    const tl = timelineOf(2, 30)
    const plan = planTimelineExport(tl, 120 * MiB, DEFAULT_VIDEO_SETTINGS, budget(1.5 * GiB))
    expect(plan.peakBytes).toBe(120 * MiB + plan.estimate.bytes * 2)
    expect(plan.sourceBytes).toBe(120 * MiB)
  })

  it('warns before it refuses', () => {
    const tl = timelineOf(3, 120)
    const plan = planTimelineExport(tl, 600 * MiB, DEFAULT_VIDEO_SETTINGS, budget(1.5 * GiB))
    expect(plan.verdict).toBe('tight')
    expect(plan.detail).not.toBe('')
  })

  it('suggests a setting that GENUINELY fits, not merely a smaller one', () => {
    const tl = timelineOf(2, 1800) // an hour of 1080p
    const plan = planTimelineExport(tl, 300 * MiB, DEFAULT_VIDEO_SETTINGS, budget(1.5 * GiB))
    expect(plan.verdict).toBe('refuse')
    expect(plan.alternative).not.toBeNull()
    const alt = plan.alternative!
    expect(peakBytesForTimeline(plan.sourceBytes, alt.estimate)).toBeLessThanOrEqual(1.5 * GiB * 0.9)
    // And it names itself, so the button can say what it is offering.
    expect(alt.label).toMatch(/p at |original size/)
  })

  it('says so plainly when no setting can help, because the sources alone are too big', () => {
    const plan = planTimelineExport(timelineOf(3, 60), 3 * GiB, DEFAULT_VIDEO_SETTINGS, budget(1.5 * GiB))
    expect(plan.verdict).toBe('refuse')
    expect(plan.alternative).toBeNull()
    expect(plan.detail).toMatch(/take a clip off|shorter pieces/i)
    // Never a refusal that only says no.
    expect(plan.detail.length).toBeGreaterThan(40)
  })

  it('never suggests something larger than what the user already chose', () => {
    const tl = timelineOf(2, 1200)
    const plan = planTimelineExport(
      tl,
      200 * MiB,
      { ...DEFAULT_VIDEO_SETTINGS, maxHeight: 720, quality: 'small' },
      budget(1.5 * GiB),
    )
    if (plan.alternative) {
      expect(plan.alternative.estimate.height).toBeLessThanOrEqual(720)
      expect(plan.alternative.settings.quality).toBe('small')
    }
  })
})
