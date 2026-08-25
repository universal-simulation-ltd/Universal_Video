/**
 * How wide the PICTURE is allowed to be drawn.
 *
 * Capped and centred rather than stretched to the browser window — a 4K monitor
 * showing a 480p clip at 2000 px wide is not a better preview.
 *
 * ⚠️ **The timeline is no longer laid out from this box** (2026-08-25). It was,
 * and the reasoning is worth keeping because it was wrong in an instructive
 * way: the owner asked for "the player needle to match the same position in the
 * video", and this file answered by making the timeline the width of the
 * PICTURE. But the picture is not a time axis — x across it is not a time — and
 * the thing that IS one, the scrub bar, kept its own wider ruler. So the knob
 * and the needle still disagreed, which is what got asked about again.
 *
 * The timeline now matches the scrub bar: both are the full content width of
 * their cards, which is a fact of the layout rather than an arithmetic
 * relationship anyone has to maintain. This constant still bounds the picture,
 * and only the picture.
 */
export const PLAYER_MAX_W = 720

/**
 * …and the cap that stops an upright movie owning the whole screen.
 *
 * A 9:16 frame drawn 720 px wide is ~1280 px tall: the transport, the toolbar
 * and the timeline all fall below the fold, and you edit by scrolling. So the
 * picture is bounded in BOTH directions — 720 across, {@link PLAYER_MAX_H}
 * down — and whichever bound bites first decides the box.
 *
 * ⚠️ Capping the height NARROWS THE BOX — and the timeline used to narrow with
 * it, which is how a 9:16 clip ended up being edited in a 304px timeline
 * underneath a full-width scrub bar. It does not any more; see the note above
 * `PLAYER_MAX_W`. What the spec checks now is that the timeline lines up with
 * the SCRUB, which is the other thing that measures time.
 *
 * 540 is not a round number picked for looking nice: it is 720 × 3/4, so the
 * cap starts biting at exactly 4:3 and **every landscape frame is left alone**.
 * Only an upright one is touched, which is the complaint this answers.
 */
export const PLAYER_MAX_H = 540

/**
 * The width of the picture box, for an output frame of the given aspect.
 *
 * 4:3 and every wider frame keep the full 720; a square one is 540, and 9:16 —
 * a phone held upright, the case this exists for — is 304 across and 540 down
 * instead of 720 × 1280. A nonsense aspect (a timeline with no frame yet, a
 * divide by zero) falls back to the full width rather than collapsing the box.
 */
export function pictureWidth(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return PLAYER_MAX_W
  return Math.min(PLAYER_MAX_W, Math.round(PLAYER_MAX_H * aspect))
}
