import { describe, expect, it } from 'vitest'
import { MAX_FILE_BYTES, MAX_RECENTS, MAX_TOTAL_BYTES, isKeepable, keepWithinBudget } from './recents'

const MB = 1024 * 1024
const entry = (name: string, mb: number, lastOpened: number) => ({
  name,
  size: mb * MB,
  lastOpened,
})

describe('keepWithinBudget', () => {
  it('keeps the newest and drops the oldest past the count', () => {
    const all = [
      entry('a', 1, 5),
      entry('b', 1, 4),
      entry('c', 1, 3),
      entry('d', 1, 2),
      entry('e', 1, 1),
    ]
    const { keep, drop } = keepWithinBudget(all)
    expect(keep.map((k) => k.name)).toEqual(['a', 'b', 'c', 'd'])
    expect(drop.map((k) => k.name)).toEqual(['e'])
    expect(keep).toHaveLength(MAX_RECENTS)
  })

  it('drops on total size even when the count would allow it', () => {
    // Two of these fit; the third would take the store past the budget.
    const big = Math.floor(MAX_TOTAL_BYTES / 2 / MB)
    const all = [entry('a', big, 3), entry('b', big, 2), entry('c', big, 1)]
    const { keep, drop } = keepWithinBudget(all)
    expect(keep.map((k) => k.name)).toEqual(['a', 'b'])
    expect(drop.map((k) => k.name)).toEqual(['c'])
  })

  // The `continue`-not-`break` case, and the reason it is written that way: one
  // oversized file part way down the list must not take the small ones behind it.
  it('skips one file that does not fit without evicting the ones after it', () => {
    const all = [
      entry('small-new', 1, 4),
      entry('huge', Math.floor(MAX_TOTAL_BYTES / MB), 3),
      entry('small-old', 1, 2),
    ]
    const { keep, drop } = keepWithinBudget(all)
    expect(keep.map((k) => k.name)).toEqual(['small-new', 'small-old'])
    expect(drop.map((k) => k.name)).toEqual(['huge'])
  })

  it('is stable on an empty store', () => {
    expect(keepWithinBudget([])).toEqual({ keep: [], drop: [] })
  })
})

describe('isKeepable', () => {
  it('takes a file at the limit and refuses one past it', () => {
    expect(isKeepable(MAX_FILE_BYTES)).toBe(true)
    expect(isKeepable(MAX_FILE_BYTES + 1)).toBe(false)
  })

  it('refuses an empty file — there is nothing to reopen', () => {
    expect(isKeepable(0)).toBe(false)
  })
})
