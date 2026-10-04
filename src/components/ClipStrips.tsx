import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { Clip, TimelineSource } from '@unisim/media'
import {
  AUDIO_LANE_H,
  VIDEO_LANE_H,
  bucketFor,
  peakColumns,
  slotsFor,
  thumbWidthPx,
  type Slot,
} from '../lib/strips/layout'
import { strips, type StripSpec } from '../lib/strips/service'
import { useStripWindow } from '../stores/stripWindowStore'

/**
 * The pictures and the sound wave inside a clip block.
 *
 * Both are `<canvas>`es covering only the part of the clip near the screen
 * (`useStripWindow`), so a clip zoomed out to 40,000 px is not 40,000 px of
 * canvas. They redraw when a frame lands (coalesced to one redraw per animation
 * frame by the service), when the clip moves or is trimmed, and when a scroll
 * crosses into a new screenful — never per frame of playback.
 */

/** Device pixels per CSS px for the strips, capped: 3× buys nothing at 34 px tall but memory. */
function dpr(): number {
  return Math.min(2, Math.max(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1))
}

/** Size a canvas's backing store to its CSS box at `ratio`, and hand back its context. */
function prepare(canvas: HTMLCanvasElement, cssW: number, cssH: number, ratio: number) {
  const w = Math.max(1, Math.round(cssW * ratio))
  const h = Math.max(1, Math.round(cssH * ratio))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)
  return ctx
}

/** The visible part of a clip, in px from its own left edge. */
function visibleSpan(leftPx: number, widthPx: number, win: { from: number; to: number }) {
  const from = Math.max(0, win.from - leftPx)
  const to = Math.min(widthPx, win.to - leftPx)
  return { from, to: Math.max(from, to) }
}

function useServiceVersion(key: string): number {
  const subscribe = useCallback((cb: () => void) => strips.subscribe(key, cb), [key])
  return useSyncExternalStore(subscribe, () => strips.version(key))
}

export function FilmStrip({
  clip,
  source,
  file,
  leftPx,
  pxPerSec,
}: {
  clip: Clip
  source: TimelineSource
  file: File
  leftPx: number
  pxPerSec: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const win = useStripWindow()
  const ratio = dpr()
  const widthPx = (clip.outSec - clip.inSec) * pxPerSec
  const span = visibleSpan(leftPx, widthPx, win)
  const thumbW = thumbWidthPx(source.height > 0 ? source.width / source.height : 16 / 9)
  const spec: StripSpec = useMemo(
    () => ({
      file,
      kind: source.kind,
      width: Math.round(thumbW * ratio),
      height: Math.round(VIDEO_LANE_H * ratio),
    }),
    [file, source.kind, thumbW, ratio],
  )

  // An image card is one picture, tiled; a video is a frame per slot.
  const slots: Slot[] = useMemo(() => {
    if (source.kind === 'image') {
      const out: Slot[] = []
      const first = Math.floor(span.from / thumbW)
      for (let i = first; i * thumbW < span.to && out.length < 400; i++) out.push({ index: i, x: i * thumbW, width: thumbW, timeSec: 0 })
      return out
    }
    return slotsFor({
      inSec: clip.inSec,
      outSec: clip.outSec,
      sourceSec: source.durationSec,
      pxPerSec,
      thumbW,
      fromPx: span.from,
      toPx: span.to,
    }).slots
  }, [source.kind, source.durationSec, clip.inSec, clip.outSec, pxPerSec, thumbW, span.from, span.to])

  const times = useMemo(() => [...new Set(slots.map((s) => s.timeSec))], [slots])
  // Half a grid step: a keyframe that close is as good as the frame itself.
  const bucket = source.kind === 'image' ? 0 : bucketFor(thumbW / pxPerSec)
  const toleranceSec = source.kind === 'image' ? 0 : 2 ** bucket / 2
  const timesSig = times.join(',')
  const key = strips.keyOf(spec)

  useEffect(() => {
    strips.want(clip.id, spec, times, toleranceSec)
    // `timesSig` stands for `times`: a new array of the same times is not a new want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id, spec, timesSig, toleranceSec])
  useEffect(() => () => strips.release(clip.id), [clip.id])

  const version = useServiceVersion(key)
  const readyRef = useRef(0)

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cssW = span.to - span.from
    const ctx = prepare(canvas, cssW, VIDEO_LANE_H, ratio)
    if (!ctx) return
    let ready = 0
    const slotSec = thumbW / pxPerSec
    for (const slot of slots) {
      const x = slot.x - span.from
      const exact = strips.frame(key, slot.timeSec, toleranceSec)
      const bitmap = exact ?? (source.kind === 'video' ? strips.nearest(key, slot.timeSec, slotSec * 4) : null)
      if (exact) ready++
      if (bitmap) {
        ctx.globalAlpha = exact ? 1 : 0.75
        ctx.drawImage(bitmap, x, 0, slot.width, VIDEO_LANE_H)
        ctx.globalAlpha = 1
      } else {
        // Placeholder: a slot-shaped tile, so the strip reads as "coming"
        // rather than as a clip that has no picture.
        ctx.fillStyle = 'rgba(234, 88, 12, 0.10)'
        ctx.fillRect(x + 1, 2, slot.width - 2, VIDEO_LANE_H - 4)
      }
      // A hairline between frames, as on film.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
      ctx.fillRect(x + slot.width - 0.5, 0, 0.5, VIDEO_LANE_H)
    }
    readyRef.current = ready
    canvas.dataset.ready = String(ready)
    canvas.dataset.path = strips.pathOf(key) ?? ''
  }, [version, slots, span.from, span.to, ratio, key, thumbW, pxPerSec, source.kind, toleranceSec])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="filmstrip"
      data-wanted={slots.length}
      data-ready={readyRef.current}
      data-bucket={source.kind === 'image' ? 'image' : bucket}
      className="pointer-events-none absolute top-0"
      // −2: the clip's 2 px border sits between its timeline position and this
      // lane, and the strip is placed in TIMELINE px; the border clips the overhang.
      style={{ left: span.from - 2, width: span.to - span.from, height: VIDEO_LANE_H }}
    />
  )
}

export function Waveform({
  clip,
  file,
  leftPx,
  pxPerSec,
}: {
  clip: Clip
  file: File
  leftPx: number
  pxPerSec: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const win = useStripWindow()
  const ratio = dpr()
  const widthPx = (clip.outSec - clip.inSec) * pxPerSec
  const span = visibleSpan(leftPx, widthPx, win)
  const key = strips.peaksKey(file)
  const version = useServiceVersion(key)
  useEffect(() => {
    strips.peaks(file)
  }, [file])
  // Read on every render; `version` is what makes a new part re-render this.
  const { state, peaks } = strips.peaksOf(file)
  const gain = clip.audio.gain

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cssW = span.to - span.from
    const ctx = prepare(canvas, cssW, AUDIO_LANE_H, ratio)
    if (!ctx || !peaks) return
    const columns = Math.max(1, Math.round(cssW))
    const fromSec = clip.inSec + span.from / pxPerSec
    const toSec = clip.inSec + span.to / pxPerSec
    const cols = peakColumns(peaks, fromSec, toSec, columns)
    const mid = AUDIO_LANE_H / 2
    const half = mid - 1
    // The wave is drawn at the clip's own volume, clamped to the lane: a clip
    // turned down looks quieter, which is what it is.
    const g = Math.min(4, Math.max(0, gain))
    ctx.fillStyle = 'rgba(2, 132, 199, 0.55)'
    for (let c = 0; c < columns; c++) {
      const lo = cols[c * 2]
      const hi = cols[c * 2 + 1]
      if (Number.isNaN(lo)) continue
      const top = mid - Math.min(1, Math.max(-1, hi * g)) * half
      const bottom = mid - Math.min(1, Math.max(-1, lo * g)) * half
      ctx.fillRect(c * (cssW / columns), top, Math.max(1, cssW / columns), Math.max(0.5, bottom - top))
    }
  }, [version, peaks, span.from, span.to, ratio, clip.inSec, pxPerSec, gain])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="waveform"
      data-state={state === 'loading' && peaks && peaks.filled > 0 ? 'partial' : state}
      className="pointer-events-none absolute top-0"
      style={{ left: span.from - 2, width: span.to - span.from, height: AUDIO_LANE_H }}
    />
  )
}
