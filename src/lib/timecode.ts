/**
 * `0:03.4` — the editor's clock.
 *
 * `formatDuration()` in `@unisim/media` rounds to whole seconds, which is right
 * for "this file is 2:41 long" and wrong for a playhead: an editor whose readout
 * cannot tell 3.0 from 3.4 cannot be used to place a cut, which is the one thing
 * the readout is for.
 */
export function timecode(seconds: number, decimals = 1): string {
  const raw = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  // Round FIRST, then split. Rounding the seconds field on its own is how a
  // readout ends up saying "0:60.0" one frame before it says "1:00.0".
  const factor = 10 ** decimals
  const safe = Math.round(raw * factor) / factor
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const rest = safe % 60
  const secs = rest.toFixed(decimals).padStart(decimals > 0 ? decimals + 3 : 2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}
