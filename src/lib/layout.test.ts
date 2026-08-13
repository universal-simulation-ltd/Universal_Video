import { describe, expect, it } from 'vitest'
import { PLAYER_MAX_H, PLAYER_MAX_W, pictureWidth } from './layout'

describe('pictureWidth', () => {
  it('leaves every landscape frame at the full width', () => {
    expect(pictureWidth(16 / 9)).toBe(PLAYER_MAX_W)
    expect(pictureWidth(21 / 9)).toBe(PLAYER_MAX_W)
    // 4:3 is the boundary the cap is chosen to sit on, so it must not narrow.
    expect(pictureWidth(4 / 3)).toBe(PLAYER_MAX_W)
  })

  it('narrows anything taller than 4:3 so it cannot pass the height cap', () => {
    for (const aspect of [1, 1080 / 1920, 270 / 480, 9 / 21]) {
      const w = pictureWidth(aspect)
      expect(w).toBeLessThan(PLAYER_MAX_W)
      // The whole point: the height that width implies is within the cap.
      expect(w / aspect).toBeLessThanOrEqual(PLAYER_MAX_H + 1)
    }
  })

  it('puts a 9:16 phone clip at 304 across rather than 720', () => {
    // The number in the doc comment, asserted so the comment cannot drift.
    expect(pictureWidth(1080 / 1920)).toBe(304)
  })

  it('falls back to the full width rather than collapsing on a nonsense aspect', () => {
    expect(pictureWidth(0)).toBe(PLAYER_MAX_W)
    expect(pictureWidth(Number.NaN)).toBe(PLAYER_MAX_W)
    expect(pictureWidth(-2)).toBe(PLAYER_MAX_W)
  })
})
