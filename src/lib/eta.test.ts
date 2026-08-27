import { describe, expect, it } from 'vitest'
import {
  CALIBRATION_FRAMES, OVERRUN_FACTOR,
  batchProgress, isOverrunning, projectedBytes, secondsRemaining,
} from './eta'

describe('secondsRemaining', () => {
  it('says nothing until enough frames have run to mean anything', () => {
    // The first few frames of any encode are unrepresentative — the encoder is
    // still warming up and the first GOP is all keyframe. Showing "4 hours
    // left" for two seconds is worse than showing nothing.
    expect(secondsRemaining(1, 900, 0.5)).toBeNull()
    expect(secondsRemaining(CALIBRATION_FRAMES - 1, 900, 2)).toBeNull()
    expect(secondsRemaining(CALIBRATION_FRAMES, 900, 2)).not.toBeNull()
  })

  it('projects from the measured rate, not a lookup table', () => {
    // 100 frames in 5 s = 20 fps; 900 left ⇒ 45 s.
    expect(secondsRemaining(100, 1000, 5)).toBeCloseTo(45, 5)
    // Same job on a machine half the speed reports twice the wait.
    expect(secondsRemaining(100, 1000, 10)).toBeCloseTo(90, 5)
  })

  it('is zero at the end and never negative', () => {
    expect(secondsRemaining(1000, 1000, 20)).toBe(0)
    expect(secondsRemaining(1200, 1000, 20)).toBe(0)
  })

  it('refuses to divide by zero', () => {
    expect(secondsRemaining(100, 0, 5)).toBeNull()
    expect(secondsRemaining(100, 1000, 0)).toBeNull()
  })
})

describe('projectedBytes', () => {
  it('extrapolates the finished size from the bytes written so far', () => {
    expect(projectedBytes(1_000_000, 100, 900)).toBeCloseTo(9_000_000, 5)
  })

  it('has no opinion before the first frame', () => {
    expect(projectedBytes(0, 0, 900)).toBeNull()
  })
})

describe('isOverrunning', () => {
  const predicted = 100_000_000

  it('stays quiet while the run is near its prediction', () => {
    expect(isOverrunning(predicted, predicted)).toBe(false)
    expect(isOverrunning(predicted * 1.2, predicted)).toBe(false)
    // Busy footage always runs a bit over; the threshold exists so the warning
    // means something when it does appear.
    expect(isOverrunning(predicted * (OVERRUN_FACTOR - 0.01), predicted)).toBe(false)
  })

  it('speaks up when the run is meaningfully bigger than promised', () => {
    expect(isOverrunning(predicted * 2, predicted)).toBe(true)
  })

  it('says nothing when there is nothing to compare against', () => {
    expect(isOverrunning(null, predicted)).toBe(false)
    expect(isOverrunning(predicted * 5, 0)).toBe(false)
  })
})

describe('batchProgress — one bar across a batch of separate files', () => {
  // Three pieces worth 300, 600 and 300 frames: 1200 for the whole job.
  const WEIGHTS = [300, 600, 300]
  const total = (index: number) => WEIGHTS.slice(index).reduce((a, b) => a + b, 0)

  it('⚠️ never resets, and never goes backwards, as the encoder starts each piece', () => {
    // THE BUG THIS EXISTS TO PREVENT: the encoder reports 0/600 when piece two
    // starts, and a bar wired straight to that snaps back to zero — which reads
    // as a crash and a restart, not as progress.
    const atEndOfFirst = batchProgress(0, { framesDone: 300, framesTotal: 300 }, 300, total(1))
    const atStartOfSecond = batchProgress(300, { framesDone: 0, framesTotal: 600 }, 600, total(2))
    expect(atStartOfSecond.framesDone).toBeGreaterThanOrEqual(atEndOfFirst.framesDone)
    expect(atStartOfSecond.framesDone).toBe(300)
  })

  it('keeps the total constant for the whole run', () => {
    const seen = [
      batchProgress(0, { framesDone: 10, framesTotal: 300 }, 300, total(1)),
      batchProgress(300, { framesDone: 200, framesTotal: 600 }, 600, total(2)),
      batchProgress(900, { framesDone: 5, framesTotal: 300 }, 300, total(3)),
    ]
    expect(seen.map((s) => s.framesTotal)).toEqual([1200, 1200, 1200])
  })

  it('weighs each piece by its predicted length, not by counting pieces', () => {
    // Halfway through the middle piece is 300 + 300 = 600 of 1200 — half the
    // job. "Piece 2 of 3" would say 50% too, but only by luck; a batch of one
    // long piece and two short ones is where counting pieces goes wrong.
    const half = batchProgress(300, { framesDone: 300, framesTotal: 600 }, 600, total(2))
    expect(half.framesDone / half.framesTotal).toBeCloseTo(0.5, 6)
  })

  it('reports exactly what the encoder said when there is only one piece', () => {
    // This is what lets the joined export share the code path rather than
    // having a second one.
    const only = batchProgress(0, { framesDone: 412, framesTotal: 900 }, 900, 0)
    expect(only).toEqual({ framesDone: 412, framesTotal: 900 })
  })

  it('falls back to the encoder’s own count when there is no prediction to weigh by', () => {
    const only = batchProgress(0, { framesDone: 412, framesTotal: 900 }, 0, 0)
    expect(only).toEqual({ framesDone: 412, framesTotal: 900 })
  })

  it('cannot overshoot its own share when the encoder disagrees with the prediction', () => {
    // A piece predicted at 300 frames that turns out to be 400 still fills
    // exactly its 300-frame slice of the bar, and no more.
    const done = batchProgress(0, { framesDone: 400, framesTotal: 400 }, 300, total(1))
    expect(done.framesDone).toBe(300)
    expect(done.framesTotal).toBe(1200)
  })

  it('survives a piece that reports nothing at all', () => {
    const nothing = batchProgress(300, { framesDone: 0, framesTotal: 0 }, 600, total(2))
    expect(nothing.framesDone).toBe(300)
    expect(nothing.framesTotal).toBe(1200)
  })
})
