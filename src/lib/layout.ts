/**
 * The one measurement the player and the timeline have to agree on.
 *
 * The picture is capped and centred rather than stretched to the browser window
 * — a 4K monitor showing a 480p clip at 2000 px wide is not a better preview.
 * The timeline's scroll viewport is laid out from the SAME box, in the same way,
 * so at fit-to-width the two are the same width and start at the same x: the
 * needle under the picture is under the point of the picture it names.
 *
 * If this ever moves, move it once, here.
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
 * ⚠️ Capping the height NARROWS THE BOX, and the timeline has to narrow with
 * it. The needle is placed at `t / duration` of the timeline's width and is
 * only under the frame it names while that width equals the picture's; leave
 * the timeline at 720 while the picture shrinks to 304 and every needle
 * position becomes a lie. That is why this is a function both of them call,
 * rather than a constant one of them applies. `e2e/video.e2e.ts` asserts the
 * two boxes match, in pixels, for a portrait source — that spec is the check.
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
