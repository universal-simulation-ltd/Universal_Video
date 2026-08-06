import { describe, expect, it } from 'vitest'
import { timecode } from './timecode'

describe('the editor clock', () => {
  it('keeps a tenth of a second, because that is what a cut is placed with', () => {
    expect(timecode(3.44)).toBe('0:03.4')
    expect(timecode(0)).toBe('0:00.0')
    // Rounds before it splits, so it never says "0:60.0".
    expect(timecode(59.95)).toBe('1:00.0')
  })

  it('pads minutes and shows hours only when there are any', () => {
    expect(timecode(61.2)).toBe('1:01.2')
    expect(timecode(3661.5)).toBe('1:01:01.5')
  })

  it('treats nonsense as zero rather than printing NaN at the user', () => {
    expect(timecode(Number.NaN)).toBe('0:00.0')
    expect(timecode(-4)).toBe('0:00.0')
  })

  it('can drop the decimals for a ruler label', () => {
    expect(timecode(75, 0)).toBe('1:15')
  })
})
