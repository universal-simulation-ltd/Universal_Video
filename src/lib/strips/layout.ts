/**
 * Where the thumbnails and the waveform go on a clip — pure arithmetic, no DOM.
 *
 * Two decisions shape everything here.
 *
 * **The strip is tiled against the SOURCE, not against the clip.** Slot `i`
 * always covers source seconds `[i·slot, (i+1)·slot)`, and a clip only decides
 * which slots are visible. Trimming the in point therefore slides the strip
 * under a fixed window — exactly what is happening to the footage — rather than
 * re-choosing every frame from the new start, which would make the picture
 * shuffle under the user's finger and show the wrong part of the file.
 *
 * **Frames are asked for on a power-of-two grid of seconds** (the "zoom
 * bucket"). A slot's frame is its middle snapped to the grid, so every time a
 * strip can ask for is `n · 2^k`. Those grids NEST: a frame fetched at one zoom
 * is still a grid point at every finer one, so zooming in reuses everything
 * already decoded and only fills the gaps. Without the grid, every zoom step
 * would ask for a fresh set of times that miss the cache by a few milliseconds.
 */

/** The video lane's height in CSS px — the thumbnails are drawn this tall. */
export const VIDEO_LANE_H = 34
/** The audio lane's height in CSS px. */
export const AUDIO_LANE_H = 20

/**
 * The finest grid step, in seconds. A thirty-second of a second is about a
 * frame at 30 fps; asking for frames closer than that only asks the decoder for
 * the same frame twice.
 */
export const MIN_GRID_EXP = -5

/** A strip never asks for more than this many frames at once — a backstop, not a layout rule. */
export const MAX_SLOTS = 400

/** How many waveform bins per second of source the peaks are computed at. */
export const PEAK_RATE = 100
/** …and the most bins one file may hold, so a two-hour file cannot ask for megabytes of peaks. */
export const MAX_PEAK_BINS = 720_000

/** Integer cache key for a grid time. Grid times are multiples of 1/32 s, so this is exact. */
export function timeKey(sec: number): number {
  return Math.round(sec * 1024)
}

/** The thumbnail's width in CSS px, for a source of this aspect drawn `laneH` tall. */
export function thumbWidthPx(aspect: number, laneH = VIDEO_LANE_H): number {
  const a = Number.isFinite(aspect) && aspect > 0 ? Math.min(4, Math.max(0.3, aspect)) : 16 / 9
  return Math.max(12, Math.round(laneH * a))
}

/**
 * The zoom bucket: the largest power-of-two second step that is no wider than
 * one slot, so every slot lands on its own grid point.
 */
export function bucketFor(slotSec: number): number {
  if (!Number.isFinite(slotSec) || slotSec <= 0) return MIN_GRID_EXP
  return Math.max(MIN_GRID_EXP, Math.floor(Math.log2(slotSec)))
}

export interface Slot {
  /** Slot number, counted from source time 0. */
  index: number
  /** Left edge, in CSS px from the clip's left edge. Can be negative (the first slot is cut by the in point). */
  x: number
  /** Width in CSS px — the thumbnail's width. */
  width: number
  /** The grid time whose frame this slot shows. */
  timeSec: number
}

export interface SlotQuery {
  /** Seconds into the source where the clip starts and ends. */
  inSec: number
  outSec: number
  /** The source's true length, so the last slot never asks for a frame past the end. */
  sourceSec: number
  pxPerSec: number
  thumbW: number
  /** The part of the clip worth drawing, in CSS px from its left edge. */
  fromPx: number
  toPx: number
}

/** The slots a clip shows between `fromPx` and `toPx`, and the bucket their times are on. */
export function slotsFor(q: SlotQuery): { bucket: number; slots: Slot[] } {
  const { inSec, outSec, sourceSec, pxPerSec, thumbW } = q
  if (!(pxPerSec > 0) || !(thumbW > 0) || !(outSec > inSec)) return { bucket: MIN_GRID_EXP, slots: [] }
  const slotSec = thumbW / pxPerSec
  const bucket = bucketFor(slotSec)
  const grid = 2 ** bucket
  const clipPx = (outSec - inSec) * pxPerSec
  const from = Math.max(0, q.fromPx)
  const to = Math.min(clipPx, q.toPx)
  if (to <= from) return { bucket, slots: [] }

  const firstSrc = inSec + from / pxPerSec
  const lastSrc = inSec + to / pxPerSec
  const i0 = Math.floor(firstSrc / slotSec + 1e-9)
  const i1 = Math.min(i0 + MAX_SLOTS, Math.ceil(lastSrc / slotSec - 1e-9))
  // The last grid point that still has a frame under it.
  const end = Number.isFinite(sourceSec) && sourceSec > 0 ? sourceSec : outSec
  const lastGrid = Math.max(0, Math.floor((end - 1e-3) / grid) * grid)

  const slots: Slot[] = []
  for (let i = i0; i < Math.max(i1, i0 + 1); i++) {
    const mid = (i + 0.5) * slotSec
    const timeSec = Math.min(lastGrid, Math.max(0, Math.round(mid / grid) * grid))
    slots.push({ index: i, x: (i * slotSec - inSec) * pxPerSec, width: thumbW, timeSec })
  }
  return { bucket, slots }
}

/**
 * The window of the timeline worth drawing strips for, in surface px.
 *
 * Quantised to whole viewport widths on purpose: it changes only when a scroll
 * crosses a viewport boundary, so the needle scrolling the timeline during
 * playback re-draws the strips once per screenful rather than on every frame.
 * One viewport either side means a scroll never shows an undrawn edge before
 * the next window has been asked for.
 */
export function drawWindow(scrollLeft: number, viewportPx: number): { from: number; to: number } {
  const w = Math.max(1, viewportPx)
  const page = Math.floor(Math.max(0, scrollLeft) / w)
  return { from: (page - 1) * w, to: (page + 3) * w }
}

/** How many bins a file's peaks are computed at. */
export function peakBinsFor(durationSec: number): { rate: number; bins: number } {
  const d = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0
  const rate = d * PEAK_RATE > MAX_PEAK_BINS ? MAX_PEAK_BINS / d : PEAK_RATE
  return { rate, bins: Math.max(1, Math.ceil(d * rate)) }
}

export interface Peaks {
  /** Bins per second of source. */
  rate: number
  /** Per-bin minimum and maximum sample, −1…1. */
  min: Float32Array
  max: Float32Array
  /** Bins `[0, filled)` are real; the rest have not been decoded yet. */
  filled: number
}

/**
 * The waveform's columns: for each of `columns` equal slices of source time
 * `[fromSec, toSec)`, the lowest and highest sample in it. NaN where the peaks
 * have not been decoded yet, so the drawing can leave that part blank (and
 * fill in as it arrives) rather than drawing silence that isn't there.
 */
export function peakColumns(peaks: Peaks, fromSec: number, toSec: number, columns: number): Float32Array {
  const n = Math.max(0, Math.floor(columns))
  const out = new Float32Array(n * 2)
  const span = (toSec - fromSec) / Math.max(1, n)
  for (let c = 0; c < n; c++) {
    const t0 = fromSec + c * span
    const b0 = Math.max(0, Math.floor(t0 * peaks.rate))
    // At least one bin per column: zoomed in past the bin rate, neighbouring
    // columns share a bin rather than falling into the gap between two.
    const b1 = Math.max(b0 + 1, Math.ceil((t0 + span) * peaks.rate))
    if (b0 >= peaks.filled || b0 >= peaks.min.length) {
      out[c * 2] = NaN
      out[c * 2 + 1] = NaN
      continue
    }
    let lo = 1
    let hi = -1
    const end = Math.min(b1, peaks.filled, peaks.min.length)
    for (let b = b0; b < end; b++) {
      if (peaks.min[b] < lo) lo = peaks.min[b]
      if (peaks.max[b] > hi) hi = peaks.max[b]
    }
    out[c * 2] = lo > hi ? 0 : lo
    out[c * 2 + 1] = lo > hi ? 0 : hi
  }
  return out
}

/** Fold `frames` interleaved samples into min/max bins. Shared by the worker's decoders. */
export function accumulatePeaks(
  min: Float32Array,
  max: Float32Array,
  rate: number,
  startSec: number,
  sampleRate: number,
  channels: Float32Array[],
): { from: number; to: number } {
  const frames = channels[0]?.length ?? 0
  if (!frames) return { from: 0, to: 0 }
  const binsPerSample = rate / sampleRate
  const first = Math.max(0, Math.floor(startSec * rate))
  let last = first
  for (let i = 0; i < frames; i++) {
    const b = Math.floor(startSec * rate + i * binsPerSample)
    if (b < 0 || b >= min.length) continue
    let lo = channels[0][i]
    let hi = lo
    for (let c = 1; c < channels.length; c++) {
      const v = channels[c][i]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    if (lo < min[b]) min[b] = lo
    if (hi > max[b]) max[b] = hi
    last = b
  }
  return { from: first, to: Math.min(min.length, last + 1) }
}
