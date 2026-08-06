import { describe, expect, it } from 'vitest'
import {
  CALIBRATION_FRAMES, OVERRUN_FACTOR,
  isOverrunning, projectedBytes, secondsRemaining,
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
