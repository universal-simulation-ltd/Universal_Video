import { describe, expect, it } from 'vitest'
import { DEFAULT_VIDEO_SETTINGS, timelineDuration, type MemoryBudget, type Timeline } from '@unisim/media'
import {
  addSource,
  appendClip,
  applyCrossfade,
  cutAt,
  deleteClip,
  describeSource,
  emptyTimeline,
  moveClip,
} from './edit'
import {
  estimateTimelineOutput,
  largestPieceBytes,
  peakBytesForTimeline,
  planTimelineExport,
} from './memory'

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
    const plan = planTimelineExport(timelineOf(2, 10), 40 * MiB, DEFAULT_VIDEO_SETTINGS, 'one', budget(1.5 * GiB))
    expect(plan.verdict).toBe('ok')
    expect(plan.detail).toBe('')
  })

  it('COUNTS EVERY SOURCE ON THE TIMELINE, not just the biggest one', () => {
    // This is the whole reason this file exists rather than calling
    // `planConversion()`. The pipeline reads each source into memory in full,
    // so four clips is four resident files — an edit can die on a machine where
    // any one of its clips would have converted comfortably.
    const tl = timelineOf(4, 20)
    const one = planTimelineExport(tl, 400 * MiB, DEFAULT_VIDEO_SETTINGS, 'one', budget(1.5 * GiB))
    const four = planTimelineExport(tl, 4 * 400 * MiB, DEFAULT_VIDEO_SETTINGS, 'one', budget(1.5 * GiB))
    expect(one.verdict).toBe('ok')
    expect(four.verdict).toBe('refuse')
    expect(four.peakBytes - one.peakBytes).toBe(3 * 400 * MiB)
  })

  it('budgets the source files plus two copies of the output', () => {
    const tl = timelineOf(2, 30)
    const plan = planTimelineExport(tl, 120 * MiB, DEFAULT_VIDEO_SETTINGS, 'one', budget(1.5 * GiB))
    expect(plan.peakBytes).toBe(120 * MiB + plan.estimate.bytes * 2)
    expect(plan.sourceBytes).toBe(120 * MiB)
  })

  it('warns before it refuses', () => {
    const tl = timelineOf(3, 120)
    const plan = planTimelineExport(tl, 600 * MiB, DEFAULT_VIDEO_SETTINGS, 'one', budget(1.5 * GiB))
    expect(plan.verdict).toBe('tight')
    expect(plan.detail).not.toBe('')
  })

  it('suggests a setting that GENUINELY fits, not merely a smaller one', () => {
    const tl = timelineOf(2, 1800) // an hour of 1080p
    const plan = planTimelineExport(tl, 300 * MiB, DEFAULT_VIDEO_SETTINGS, 'one', budget(1.5 * GiB))
    expect(plan.verdict).toBe('refuse')
    expect(plan.alternative).not.toBeNull()
    const alt = plan.alternative!
    expect(peakBytesForTimeline(plan.sourceBytes, alt.estimate)).toBeLessThanOrEqual(1.5 * GiB * 0.9)
    // And it names itself, so the button can say what it is offering.
    expect(alt.label).toMatch(/p at |original size/)
  })

  it('says so plainly when no setting can help, because the sources alone are too big', () => {
    const plan = planTimelineExport(timelineOf(3, 60), 3 * GiB, DEFAULT_VIDEO_SETTINGS, 'one', budget(1.5 * GiB))
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
      'one',
      budget(1.5 * GiB),
    )
    if (plan.alternative) {
      expect(plan.alternative.estimate.height).toBeLessThanOrEqual(720)
      expect(plan.alternative.settings.quality).toBe('small')
    }
  })
})

describe('predicting a batch of separate files', () => {
  /** One 60 s video cut into three pieces at 20 s and 45 s. */
  function cutIntoThree(): Timeline {
    let tl = emptyTimeline()
    tl = addSource(tl, describeSource('v', 'video', 'holiday.mp4', 60, 1920, 1080, true), 30)
    tl = appendClip(tl, 'v')
    return cutAt(cutAt(tl, 20), 45)
  }

  it('predicts the same length as the joined movie when nothing has been deleted', () => {
    const tl = cutIntoThree()
    const joined = estimateTimelineOutput(tl, DEFAULT_VIDEO_SETTINGS, 'one')
    const zipped = estimateTimelineOutput(tl, DEFAULT_VIDEO_SETTINGS, 'separate')
    expect(zipped.seconds).toBeCloseTo(joined.seconds, 5)
    // Three MP4s carry three sets of container boxes rather than one — a few
    // kilobytes, and the reason the two numbers are not identical.
    expect(zipped.bytes).toBeGreaterThan(joined.bytes)
    expect(zipped.bytes - joined.bytes).toBeLessThan(20_000)
  })

  it('⚠️ does NOT charge for a gap the zip will not contain', () => {
    // A deleted clip leaves a hole. The joined movie writes it as black and pays
    // for it; separate files simply do not include it. A button showing the
    // joined number on a zip would be overstating the download by that gap.
    const tl = cutIntoThree()
    const gapped = deleteClip(tl, tl.clips[1].id)
    const joined = estimateTimelineOutput(gapped, DEFAULT_VIDEO_SETTINGS, 'one')
    const zipped = estimateTimelineOutput(gapped, DEFAULT_VIDEO_SETTINGS, 'separate')
    expect(joined.seconds).toBe(60)
    expect(zipped.seconds).toBeCloseTo(35, 5)
    expect(zipped.bytes).toBeLessThan(joined.bytes)
  })

  it('⚠️ does not go soft on the ceiling just because it writes one piece at a time', () => {
    // The tempting mistake: "only one piece is in the encoder, so a zip is
    // cheaper". Held IN THE TAB it is not — `createZip` copies every finished
    // piece into a new blob, so the moment the zip is built the tab holds all
    // of them twice. Same budget, same verdict.
    //
    // (Streaming the archive to a file IS cheaper, and that is the next
    // describe block. The distinction is the destination, never the mode.)
    const tl = cutIntoThree()
    const joined = planTimelineExport(tl, 400 * MiB, DEFAULT_VIDEO_SETTINGS, 'one', budget(1.5 * GiB))
    const zipped = planTimelineExport(tl, 400 * MiB, DEFAULT_VIDEO_SETTINGS, 'separate', budget(1.5 * GiB))
    expect(zipped.peakBytes).toBeGreaterThanOrEqual(joined.peakBytes)
  })

  it('refuses a batch that will not fit, and says where the bytes are', () => {
    let tl = emptyTimeline()
    tl = addSource(tl, describeSource('v', 'video', 'long.mp4', 4 * 3600, 1920, 1080, true), 30)
    tl = appendClip(tl, 'v')
    const plan = planTimelineExport(cutAt(tl, 3600), 200 * MiB, DEFAULT_VIDEO_SETTINGS, 'separate', budget(1.5 * GiB))
    expect(plan.verdict).toBe('refuse')
    expect(plan.fileCount).toBe(2)
    expect(plan.detail).toContain('2 files')
    // Not "can't hold it in one piece" — it is precisely not in one piece.
    expect(plan.detail).not.toContain('in one piece')
    expect(plan.detail).toContain('zip holds all 2')
  })

  it('carries the mode and the file count so the UI does not have to recompute them', () => {
    const plan = planTimelineExport(cutIntoThree(), 40 * MiB, DEFAULT_VIDEO_SETTINGS, 'separate', budget(1.5 * GiB))
    expect(plan.mode).toBe('separate')
    expect(plan.fileCount).toBe(3)
  })

  it('counts one file, and keeps the old wording, for a joined export', () => {
    const plan = planTimelineExport(cutIntoThree(), 40 * MiB, DEFAULT_VIDEO_SETTINGS, 'one', budget(1.5 * GiB))
    expect(plan.mode).toBe('one')
    expect(plan.fileCount).toBe(1)
  })

  it('falls back to the joined prediction when the timeline cannot be split at all', () => {
    // A crossfaded timeline is refused by `separateBlocked`, so there are no
    // pieces to sum — the estimate must not quietly return zero bytes and let a
    // refused export look free.
    let tl = timelineOf(2, 10)
    tl = applyCrossfade(tl, tl.clips[1].id, 1)
    const zipped = estimateTimelineOutput(tl, DEFAULT_VIDEO_SETTINGS, 'separate')
    expect(zipped.seconds).toBe(19)
    expect(zipped.bytes).toBeGreaterThan(0)
  })
})

describe('streaming the archive to a file the user picked', () => {
  /** One long video cut into `cuts + 1` pieces of roughly equal length. */
  function cutInto(pieces: number, totalSec: number): Timeline {
    let tl = emptyTimeline()
    tl = addSource(tl, describeSource('v', 'video', 'long.mp4', totalSec, 1920, 1080, true), 30)
    tl = appendClip(tl, 'v')
    for (let i = 1; i < pieces; i += 1) tl = cutAt(tl, (totalSec / pieces) * i)
    return tl
  }

  it('costs the LONGEST piece rather than the sum of them', () => {
    const tl = cutInto(4, 3600)
    const huge = budget(64 * GiB) // big enough that neither is refused
    const held = planTimelineExport(tl, 100 * MiB, DEFAULT_VIDEO_SETTINGS, 'separate', huge, 'memory')
    const streamed = planTimelineExport(tl, 100 * MiB, DEFAULT_VIDEO_SETTINGS, 'separate', huge, 'stream')

    // Four equal pieces, so the resident output is about a quarter of the batch.
    expect(streamed.residentOutputBytes).toBeLessThan(held.residentOutputBytes * 0.3)
    expect(streamed.peakBytes).toBeLessThan(held.peakBytes)
    // The SOURCES are still resident either way — streaming moves the output,
    // not the input. If this ever passes with sources excluded, the refusal has
    // become optimistic in the one direction it must never be.
    expect(streamed.peakBytes).toBeGreaterThan(100 * MiB)
    // And the prediction on the button is unchanged: the same files come out.
    expect(streamed.estimate.bytes).toBe(held.estimate.bytes)
  })

  it('⚠️ turns a batch that had to be refused into one that exports', () => {
    // The whole point of the feature, stated as the test that would fail if the
    // arithmetic were merely relabelled rather than actually changed.
    const tl = cutInto(8, 4 * 3600)
    const sourceBytes = 200 * MiB
    const roomy = budget(64 * GiB)
    const held = planTimelineExport(tl, sourceBytes, DEFAULT_VIDEO_SETTINGS, 'separate', roomy, 'memory')
    const streamed = planTimelineExport(tl, sourceBytes, DEFAULT_VIDEO_SETTINGS, 'separate', roomy, 'stream')

    // A budget that sits between the two peaks — derived from them rather than
    // guessed, so this test does not rot when the bitrate table moves.
    const between = budget((held.peakBytes + streamed.peakBytes) / 2)
    expect(planTimelineExport(tl, sourceBytes, DEFAULT_VIDEO_SETTINGS, 'separate', between, 'memory').verdict)
      .toBe('refuse')
    expect(planTimelineExport(tl, sourceBytes, DEFAULT_VIDEO_SETTINGS, 'separate', between, 'stream').verdict)
      .not.toBe('refuse')
  })

  it('says where the bytes are, and no longer blames the total', () => {
    const tl = cutInto(6, 6 * 3600)
    const plan = planTimelineExport(tl, 200 * MiB, DEFAULT_VIDEO_SETTINGS, 'separate', budget(1.5 * GiB), 'stream')
    expect(plan.verdict).toBe('refuse')
    // The in-tab sentence would be a lie here — the pieces are NOT all held.
    expect(plan.detail).not.toContain('zip holds all')
    expect(plan.detail).toContain('longest single piece')
    // And the way out is a further cut, not a second batch: splitting the batch
    // does nothing when the peak is one piece.
    expect(plan.detail).not.toContain('second batch')
  })

  it('⚠️ makes no claim for a single piece, because there is nothing to release', () => {
    // One piece IS the archive. Reporting 'stream' here would under-count the
    // peak by half and promise an export that cannot run.
    let tl = emptyTimeline()
    tl = addSource(tl, describeSource('v', 'video', 'v.mp4', 60, 1920, 1080, true), 30)
    tl = appendClip(tl, 'v')
    const plan = planTimelineExport(tl, 40 * MiB, DEFAULT_VIDEO_SETTINGS, 'separate', budget(1.5 * GiB), 'stream')
    expect(plan.fileCount).toBe(1)
    expect(plan.destination).toBe('memory')
    expect(plan.residentOutputBytes).toBe(plan.estimate.bytes)
  })

  it('ignores the destination for a joined movie — there is no archive to stream', () => {
    const tl = timelineOf(3, 60)
    const held = planTimelineExport(tl, 40 * MiB, DEFAULT_VIDEO_SETTINGS, 'one', budget(1.5 * GiB), 'memory')
    const asked = planTimelineExport(tl, 40 * MiB, DEFAULT_VIDEO_SETTINGS, 'one', budget(1.5 * GiB), 'stream')
    expect(asked.destination).toBe('memory')
    expect(asked.peakBytes).toBe(held.peakBytes)
  })

  it('defaults to holding it in the tab, so an unaware caller is never over-promised', () => {
    const tl = cutInto(4, 3600)
    const explicit = planTimelineExport(tl, 40 * MiB, DEFAULT_VIDEO_SETTINGS, 'separate', budget(1.5 * GiB), 'memory')
    const implied = planTimelineExport(tl, 40 * MiB, DEFAULT_VIDEO_SETTINGS, 'separate', budget(1.5 * GiB))
    expect(implied.destination).toBe('memory')
    expect(implied.peakBytes).toBe(explicit.peakBytes)
  })

  it('picks the longest piece when the cuts are uneven, not the first or the average', () => {
    let tl = emptyTimeline()
    tl = addSource(tl, describeSource('v', 'video', 'v.mp4', 100, 1920, 1080, true), 30)
    tl = appendClip(tl, 'v')
    tl = cutAt(tl, 10)  // 10 s, then 90 s
    const estimate = estimateTimelineOutput(tl, DEFAULT_VIDEO_SETTINGS, 'separate')
    const largest = largestPieceBytes(tl, estimate)
    // 90 of the 100 seconds, so about nine tenths of the batch — nowhere near
    // the 10 s first piece and well above a 50 s average.
    expect(largest / estimate.bytes).toBeGreaterThan(0.85)
    expect(largest).toBeLessThan(estimate.bytes)
  })

  it('falls back to the whole estimate when there are no pieces to measure', () => {
    // A timeline `separateBlocked` refuses has no pieces. Returning 0 here would
    // make the peak look like just the sources and let a refused export through.
    //
    // ⚠️ Stacked clips, NOT a crossfade. A dissolve used to be blocked and is
    // not since 2026-08-28 — it renders into the piece it starts in — so a
    // crossfaded timeline splits fine and would not exercise this at all.
    let tl = timelineOf(2, 10)
    tl = moveClip(tl, tl.clips[1].id, 0, 1)
    expect(tl.clips.some((c) => c.track !== 0)).toBe(true)
    const estimate = estimateTimelineOutput(tl, DEFAULT_VIDEO_SETTINGS, 'separate')
    expect(largestPieceBytes(tl, estimate)).toBe(estimate.bytes)
  })

  it('sizes a smaller alternative the same way the real export will be measured', () => {
    // ⚠️ Measuring the candidate against the in-tab sum while the export streams
    // offers 480p to somebody whose 1080p already fits.
    const tl = cutInto(6, 6 * 3600)
    const plan = planTimelineExport(tl, 200 * MiB, DEFAULT_VIDEO_SETTINGS, 'separate', budget(1.5 * GiB), 'stream')
    if (plan.alternative) {
      const resident = largestPieceBytes(tl, plan.alternative.estimate)
      expect(peakBytesForTimeline(plan.sourceBytes, plan.alternative.estimate, resident))
        .toBeLessThanOrEqual(1.5 * GiB * 0.9)
    }
  })
})
