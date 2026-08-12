/**
 * The one-line form of a longer explanation, for the collapsed rows in
 * `Honesty`.
 *
 * The rows each carry a hand-written `summary` as well as their full text,
 * rather than this cutting the full text down mechanically: the full text is
 * rich — bold, links, `<em>` — and a character count through JSX either drops
 * the markup or slices a tag in half. A written summary is also simply better
 * than the first 120 characters of a paragraph, which usually stop mid-clause.
 *
 * So what is this for? A **guard**. A summary is prose in a file anyone can
 * edit, and the collapsed row is one line; a summary that grows past the line
 * silently reflows the whole box. This caps it and says so with an ellipsis
 * instead. In normal use it does nothing, and that is the intent — if you find
 * it firing, shorten the summary rather than raising the limit.
 */
export const SUMMARY_LIMIT = 100

export interface Summary {
  text: string
  /** True when the cap fired — the row is longer than its one line admits. */
  truncated: boolean
}

/**
 * Cut `text` to `limit` characters at a word boundary and append an ellipsis.
 *
 * Backs up to the last space so a word is never cut in half — unless that would
 * throw away most of the line (a single very long token, a URL), in which case
 * a hard cut is the lesser evil. Trailing punctuation goes before the ellipsis
 * so the result never reads `word,…`.
 */
export function summarise(text: string, limit: number = SUMMARY_LIMIT): Summary {
  const trimmed = text.trim()
  if (trimmed.length <= limit) return { text: trimmed, truncated: false }

  const cut = trimmed.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  // Below 60% of the limit the "word" is long enough that keeping the boundary
  // would leave a stub, so cut hard instead.
  const body = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut

  return { text: `${body.replace(/[\s,;:.—-]+$/, '')}…`, truncated: true }
}
