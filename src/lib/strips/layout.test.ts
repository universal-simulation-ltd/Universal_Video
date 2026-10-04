import { describe, expect, it } from 'vitest'
import {
  MAX_PEAK_BINS,
  accumulatePeaks,
  bucketFor,
  drawWindow,
  peakBinsFor,
  peakColumns,
  slotsFor,
  thumbWidthPx,
  timeKey,
} from './layout'

const base = { inSec: 0, outSec: 10, sourceSec: 10, pxPerSec: 60, thumbW: 60, fromPx: 0, toPx: 1e9 }

describe('slotsFor', () => {
  it('tiles the visible clip with one slot per thumbnail width', () => {
    const { slots } = slotsFor(base)
    expect(slots).toHaveLength(10)
    expect(slots[0].x).toBe(0)
    expect(slots[9].x).toBe(540)
  })

  it('tiles against the SOURCE, so trimming the in point slides the strip rather than re-picking frames', () => {
    const before = slotsFor(base).slots
    const after = slotsFor({ ...base, inSec: 2.5 }).slots
    // Every slot still visible keeps its frame, and moves left by the trim.
    for (const slot of after) {
      const same = before.find((b) => b.index === slot.index)!
      expect(slot.timeSec).toBe(same.timeSec)
      expect(slot.x).toBeCloseTo(same.x - 2.5 * 60)
    }
    // The first slot is cut by the in point, not started at it.
    expect(after[0].x).toBeLessThan(0)
  })

  it('asks for grid times, which nest from one zoom to the next', () => {
    const coarse = slotsFor({ ...base, pxPerSec: 30 })
    const fine = slotsFor({ ...base, pxPerSec: 120 })
    const grid = 2 ** coarse.bucket
    for (const s of coarse.slots) expect((s.timeSec / grid) % 1).toBe(0)
    // Every coarse time is a point on the finer grid too, so it is reused.
    const fineGrid = 2 ** fine.bucket
    for (const s of coarse.slots) expect((s.timeSec / fineGrid) % 1).toBe(0)
  })

  it('never asks for a frame past the end of the source', () => {
    const { slots } = slotsFor({ ...base, sourceSec: 9.99 })
    for (const s of slots) expect(s.timeSec).toBeLessThan(9.99)
  })

  it('draws only the window it is given', () => {
    const { slots } = slotsFor({ ...base, fromPx: 300, toPx: 420 })
    expect(slots.map((s) => s.index)).toEqual([5, 6])
  })

  it('returns nothing for a degenerate clip or zoom', () => {
    expect(slotsFor({ ...base, outSec: 0 }).slots).toEqual([])
    expect(slotsFor({ ...base, pxPerSec: 0 }).slots).toEqual([])
  })
})

describe('buckets and keys', () => {
  it('picks the largest power-of-two step no wider than a slot, down to 1/32 s', () => {
    expect(bucketFor(1)).toBe(0)
    expect(bucketFor(3)).toBe(1)
    expect(bucketFor(0.001)).toBe(-5)
  })

  it('keys grid times exactly', () => {
    expect(timeKey(1 / 32)).toBe(32)
    expect(timeKey(0.5 + 1 / 32)).toBe(timeKey(17 / 32))
  })

  it('sizes a thumbnail by the source shape', () => {
    expect(thumbWidthPx(16 / 9)).toBe(60)
    expect(thumbWidthPx(9 / 16)).toBe(19)
    expect(thumbWidthPx(NaN)).toBe(60)
  })
})

describe('drawWindow', () => {
  it('changes only when a scroll crosses a screenful', () => {
    expect(drawWindow(0, 700)).toEqual(drawWindow(650, 700))
    expect(drawWindow(0, 700)).not.toEqual(drawWindow(710, 700))
    const w = drawWindow(1500, 700)
    expect(w.from).toBeLessThanOrEqual(1500)
    expect(w.to).toBeGreaterThanOrEqual(1500 + 700)
  })
})

describe('peaks', () => {
  it('caps the bins for a long file', () => {
    expect(peakBinsFor(10).bins).toBe(1000)
    expect(peakBinsFor(4 * 3600).bins).toBeLessThanOrEqual(MAX_PEAK_BINS)
  })

  it('folds samples into min/max bins across channels', () => {
    const min = new Float32Array(10).fill(1)
    const max = new Float32Array(10).fill(-1)
    // 1 s of 100 Hz-ish samples at 1 kHz into 10 bins/s.
    const left = new Float32Array(1000).map((_, i) => Math.sin(i / 10) * 0.5)
    const right = new Float32Array(1000).map(() => 0.9)
    const { from, to } = accumulatePeaks(min, max, 10, 0, 1000, [left, right])
    expect([from, to]).toEqual([0, 10])
    for (let b = 0; b < 10; b++) {
      expect(max[b]).toBeCloseTo(0.9)
      expect(min[b]).toBeLessThan(0)
    }
  })

  it('leaves undecoded columns blank rather than silent', () => {
    const peaks = { rate: 10, min: new Float32Array(10).fill(-0.5), max: new Float32Array(10).fill(0.5), filled: 5 }
    const cols = peakColumns(peaks, 0, 1, 10)
    expect(cols[0]).toBeCloseTo(-0.5)
    expect(cols[1]).toBeCloseTo(0.5)
    expect(Number.isNaN(cols[9 * 2])).toBe(true)
  })
})
