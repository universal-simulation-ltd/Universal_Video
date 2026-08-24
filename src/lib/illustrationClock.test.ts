import { describe, expect, it } from 'vitest'
import { smoothstep, unSmoothstep } from './illustrationClock'

describe('smoothstep', () => {
  it('pins both ends, so frame 0 and the last frame are exact', () => {
    expect(smoothstep(0)).toBe(0)
    expect(smoothstep(1)).toBe(1)
  })

  it('is flat at both ends and steepest in the middle', () => {
    const nearStart = smoothstep(0.05) - smoothstep(0)
    const middle = smoothstep(0.55) - smoothstep(0.5)
    const nearEnd = smoothstep(1) - smoothstep(0.95)
    expect(middle).toBeGreaterThan(nearStart * 4)
    expect(middle).toBeGreaterThan(nearEnd * 4)
  })
})

describe('unSmoothstep', () => {
  // The whole point of the inverse: a mid-glide exit resumes on the frame that
  // is already on screen. Any drift here is a visible snap.
  it('round-trips every position back to the clock that produced it', () => {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      expect(unSmoothstep(smoothstep(t))).toBeCloseTo(t, 6)
    }
  })

  it('clamps rather than returning NaN when handed a value off the ends', () => {
    expect(unSmoothstep(-0.2)).toBeCloseTo(0, 6)
    expect(unSmoothstep(1.4)).toBeCloseTo(1, 6)
  })
})
