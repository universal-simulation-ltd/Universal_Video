/**
 * The one measurement the player and the timeline have to agree on.
 *
 * The picture is capped and centred rather than stretched to the browser window
 * — a 4K monitor showing a 480p clip at 2000 px wide is not a better preview.
 * The timeline's scroll viewport is laid out from the SAME constant, in the same
 * way, so at fit-to-width the two boxes are the same width and start at the same
 * x: the needle under the picture is under the point of the picture it names.
 *
 * If this ever moves, move it once, here.
 */
export const PLAYER_MAX_W = 720
