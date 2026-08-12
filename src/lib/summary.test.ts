import { describe, expect, it } from 'vitest'
import { SUMMARY_LIMIT, summarise } from './summary'

describe('summarise', () => {
  it('leaves a line that already fits completely alone', () => {
    const short = 'MP4, M4V and MOV — not MKV, WebM, AVI or WMV.'
    expect(summarise(short)).toEqual({ text: short, truncated: false })
  })

  it('does not fire at exactly the limit', () => {
    const exact = 'a'.repeat(SUMMARY_LIMIT)
    expect(summarise(exact).truncated).toBe(false)
  })

  it('fires one character past the limit', () => {
    expect(summarise('a'.repeat(SUMMARY_LIMIT + 1)).truncated).toBe(true)
  })

  it('cuts at a word boundary rather than mid-word', () => {
    const { text } = summarise('the quick brown fox jumps over the lazy dog', 20)
    expect(text).toBe('the quick brown fox…')
  })

  it('never returns more characters than the limit, plus the ellipsis', () => {
    const long = 'the quick brown fox jumps over the lazy dog'.repeat(4)
    const { text } = summarise(long, 30)
    expect(text.length).toBeLessThanOrEqual(31)
    expect(text.endsWith('…')).toBe(true)
  })

  it('cuts a single very long token hard, rather than leaving a stub', () => {
    // No space before the limit at all, so the word-boundary path would return
    // an empty string.
    const { text } = summarise('supercalifragilisticexpialidocious and more', 20)
    expect(text).toBe('supercalifragilistic…')
  })

  it('keeps an early space only when it leaves most of the line', () => {
    // The space sits at index 2, well under 60% of a 20-char limit, so the
    // boundary is refused in favour of a hard cut.
    const { text } = summarise('an extraordinarilylongunbrokenword follows', 20)
    expect(text).toBe('an extraordinarilylo…')
  })

  it('drops trailing punctuation so the result never reads "word,…"', () => {
    expect(summarise('one, two, three, four', 16).text).toBe('one, two, three…')
    expect(summarise('a clause — and then more', 14).text).toBe('a clause…')
  })

  it('trims surrounding whitespace before measuring', () => {
    expect(summarise('   spaced   ')).toEqual({ text: 'spaced', truncated: false })
  })

  it('handles an empty string', () => {
    expect(summarise('')).toEqual({ text: '', truncated: false })
  })
})
