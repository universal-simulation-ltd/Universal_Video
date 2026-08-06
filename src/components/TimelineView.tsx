import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { clipDuration, clipSpan, timelineDuration, type Clip } from '@unisim/media'
import { sourceById, trackCount } from '../lib/edit'
import { timecode } from '../lib/timecode'
import { useEditorStore } from '../stores/editorStore'

/**
 * The timeline: a ruler, and every clip drawn as a video lane and an audio lane
 * inside ONE box.
 *
 * The two lanes are a presentation choice and nothing more — there is a single
 * `Clip` behind them (see `lib/edit.ts`), which is why a cut cannot separate
 * the picture from the sound and why the audio lane has no handles of its own.
 * Drawing them as two rectangles inside one border, with one selection ring
 * around both, is the honest picture of that: linked, because they are one
 * thing.
 *
 * V1 is at the BOTTOM and higher tracks stack above it, matching the contract's
 * `track: 0` and matching every other editor: what is higher covers what is
 * lower.
 */

const TRACK_H = 62
const TRACK_GAP = 6
const RULER_H = 26

export default function TimelineView() {
  const timeline = useEditorStore((s) => s.timeline)
  const pxPerSec = useEditorStore((s) => s.pxPerSec)
  const seek = useEditorStore((s) => s.seek)
  const setPlaying = useEditorStore((s) => s.setPlaying)
  const surfaceRef = useRef<HTMLDivElement>(null)

  const duration = timelineDuration(timeline)
  // One empty track above the highest in use, so "drag it up to a new track" is
  // a place you can actually drop on rather than a rule you have to know.
  const rows = trackCount(timeline) + 1
  const width = Math.max(duration * pxPerSec + 160, 480)
  const height = rows * TRACK_H + (rows - 1) * TRACK_GAP

  const secondsAt = useCallback(
    (clientX: number) => {
      const rect = surfaceRef.current?.getBoundingClientRect()
      if (!rect) return 0
      return Math.max(0, (clientX - rect.left) / pxPerSec)
    },
    [pxPerSec],
  )

  return (
    <section
      data-testid="timeline"
      aria-label="Timeline"
      className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <div ref={surfaceRef} className="relative" style={{ width, minWidth: '100%' }}>
        <Ruler
          duration={duration}
          pxPerSec={pxPerSec}
          width={width}
          onSeek={(sec) => {
            setPlaying(false)
            seek(sec)
          }}
        />

        <div className="relative mt-1" style={{ height }}>
          {Array.from({ length: rows }, (_, i) => {
            const track = rows - 1 - i
            return (
              <div
                key={track}
                data-testid="track"
                data-track={track}
                className="absolute left-0 right-0 rounded-lg border border-dashed border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"
                style={{ top: i * (TRACK_H + TRACK_GAP), height: TRACK_H }}
              >
                <span className="pointer-events-none absolute left-1 top-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
                  V{track + 1}
                </span>
              </div>
            )
          })}

          {timeline.clips.map((clip) => (
            <ClipBlock
              key={clip.id}
              clip={clip}
              rows={rows}
              pxPerSec={pxPerSec}
              secondsAt={secondsAt}
              surfaceRef={surfaceRef}
            />
          ))}
        </div>

        <Playhead pxPerSec={pxPerSec} height={height + RULER_H + 4} />
      </div>
    </section>
  )
}

function Ruler({
  duration,
  pxPerSec,
  width,
  onSeek,
}: {
  duration: number
  pxPerSec: number
  width: number
  onSeek: (sec: number) => void
}) {
  const step = tickStep(pxPerSec)
  const ticks: number[] = []
  for (let t = 0; t <= duration + step; t += step) ticks.push(Number(t.toFixed(3)))

  return (
    <div
      role="presentation"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        onSeek(Math.max(0, (e.clientX - rect.left) / pxPerSec))
      }}
      className="relative cursor-pointer select-none border-b border-slate-200 dark:border-slate-800"
      style={{ height: RULER_H, width }}
    >
      {ticks.map((t) => (
        <div key={t} className="absolute bottom-0 top-0" style={{ left: t * pxPerSec }}>
          <div className="absolute bottom-0 h-2 w-px bg-slate-300 dark:bg-slate-700" />
          <span className="absolute bottom-2.5 left-1 text-[9.5px] tabular-nums text-slate-400">
            {timecode(t, step < 1 ? 1 : 0)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Its own component so the playhead can move at 60 fps without redrawing the clips. */
function Playhead({ pxPerSec, height }: { pxPerSec: number; height: number }) {
  const playheadSec = useEditorStore((s) => s.playheadSec)
  return (
    <div
      data-testid="playhead"
      data-sec={playheadSec.toFixed(3)}
      className="pointer-events-none absolute top-0 z-20 w-0.5 bg-orange-600"
      style={{ left: playheadSec * pxPerSec, height }}
    />
  )
}

interface DragState {
  kind: 'move' | 'in' | 'out'
  pointerX: number
  pointerY: number
  startSec: number
  track: number
}

function ClipBlock({
  clip,
  rows,
  pxPerSec,
  secondsAt,
  surfaceRef,
}: {
  clip: Clip
  rows: number
  pxPerSec: number
  secondsAt: (clientX: number) => number
  surfaceRef: RefObject<HTMLDivElement>
}) {
  const timeline = useEditorStore((s) => s.timeline)
  const selected = useEditorStore((s) => s.selectedClipId === clip.id)
  const select = useEditorStore((s) => s.select)
  const drag = useEditorStore((s) => s.drag)
  const trim = useEditorStore((s) => s.trim)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [preview, setPreview] = useState<{ startSec: number; track: number } | null>(null)

  const source = sourceById(timeline, clip.sourceId)
  const span = clipSpan(clip)
  const shownStart = preview?.startSec ?? clip.startSec
  const shownTrack = preview?.track ?? clip.track
  const rowIndex = rows - 1 - shownTrack

  const onPointerDown = (kind: DragState['kind']) => (e: PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    select(clip.id)
    setDragState({ kind, pointerX: e.clientX, pointerY: e.clientY, startSec: clip.startSec, track: clip.track })
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!dragState) return
    if (dragState.kind === 'move') {
      const dx = (e.clientX - dragState.pointerX) / pxPerSec
      const rect = surfaceRef.current?.getBoundingClientRect()
      // Which lane is the pointer over? Rows are drawn top-down with V1 last,
      // so the arithmetic is inverted deliberately.
      const y = rect ? e.clientY - rect.top - RULER_H - 4 : 0
      const row = Math.max(0, Math.min(rows - 1, Math.floor(y / (TRACK_H + TRACK_GAP))))
      setPreview({ startSec: Math.max(0, dragState.startSec + dx), track: rows - 1 - row })
      return
    }
    // Trimming is applied live: it is clamped and idempotent, so there is
    // nothing to be gained by waiting for the pointer to come up.
    trim(clip.id, dragState.kind, secondsAt(e.clientX))
  }

  const onPointerUp = () => {
    if (dragState?.kind === 'move' && preview) drag(clip.id, preview.startSec, preview.track)
    setDragState(null)
    setPreview(null)
  }

  const nudge = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 1 : 0.1
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      drag(clip.id, clip.startSec + (e.key === 'ArrowLeft' ? -step : step), clip.track)
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      drag(clip.id, clip.startSec, clip.track + (e.key === 'ArrowUp' ? 1 : -1))
    }
  }

  const name = source?.name ?? 'clip'

  return (
    <div
      data-testid="clip"
      data-clip-id={clip.id}
      data-track={clip.track}
      data-start={clip.startSec.toFixed(3)}
      data-end={span.end.toFixed(3)}
      data-in={clip.inSec.toFixed(3)}
      data-out={clip.outSec.toFixed(3)}
      data-audio={clip.audio.enabled ? 'on' : 'off'}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`absolute z-10 overflow-hidden rounded-lg border-2 shadow-sm ${
        selected
          ? 'border-orange-500 ring-2 ring-orange-300 dark:ring-orange-500/40'
          : 'border-slate-300 dark:border-slate-700'
      } ${dragState ? 'opacity-80' : ''}`}
      style={{
        left: shownStart * pxPerSec,
        width: Math.max(6, clipDuration(clip) * pxPerSec),
        top: rowIndex * (TRACK_H + TRACK_GAP) + 2,
        height: TRACK_H - 4,
      }}
    >
      {/* ONE unit: the video lane and the audio lane share this box, this
          border and this selection ring, because they share a `Clip`. */}
      <button
        type="button"
        onPointerDown={onPointerDown('move')}
        onKeyDown={nudge}
        onClick={() => select(clip.id)}
        aria-label={`${name}, ${timecode(span.start)} to ${timecode(span.end)}, track ${clip.track + 1}`}
        className="block h-full w-full cursor-grab text-left active:cursor-grabbing"
      >
        <span
          data-testid="video-lane"
          className="flex h-[34px] items-center gap-1 bg-orange-100 px-2 text-[10.5px] font-semibold text-orange-950 dark:bg-orange-900/50 dark:text-orange-50"
        >
          {clip.transitionIn && <Chevron title={`${clip.transitionIn.kind} in`} />}
          <span className="min-w-0 flex-1 truncate">{name}</span>
          {clip.transitionOut && <Chevron title={`${clip.transitionOut.kind} out`} flipped />}
        </span>
        <span
          data-testid="audio-lane"
          className={`flex h-[20px] items-center overflow-hidden whitespace-nowrap border-t border-orange-200/70 px-2 text-[9.5px] tabular-nums dark:border-orange-900 ${
            clip.audio.enabled
              ? 'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100'
              : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
          }`}
        >
          {clip.audio.enabled
            ? `sound · ${timecode(span.start, 1)}–${timecode(span.end, 1)}`
            : source?.hasAudio === false
              ? 'no sound in this file'
              : 'muted'}
        </span>
      </button>

      <Handle side="in" label={`Trim the start of ${name}`} onPointerDown={onPointerDown('in')} />
      <Handle side="out" label={`Trim the end of ${name}`} onPointerDown={onPointerDown('out')} />
    </div>
  )
}

function Handle({
  side,
  label,
  onPointerDown,
}: {
  side: 'in' | 'out'
  label: string
  onPointerDown: (e: PointerEvent) => void
}) {
  const trim = useEditorStore((s) => s.trim)
  const timeline = useEditorStore((s) => s.timeline)
  const selectedClipId = useEditorStore((s) => s.selectedClipId)

  return (
    <button
      type="button"
      aria-label={label}
      data-testid={`trim-${side}`}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        // The keyboard path is not a courtesy: a handle you can only reach with
        // a mouse cannot be used with a trackpad at 4 px per second either.
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const clip = timeline.clips.find((c) => c.id === selectedClipId)
        if (!clip) return
        const step = (e.shiftKey ? 1 : 0.1) * (e.key === 'ArrowLeft' ? -1 : 1)
        const at = side === 'in' ? clip.startSec + step : clipSpan(clip).end + step
        trim(clip.id, side, at)
      }}
      className={`absolute top-0 z-10 h-full w-2 cursor-ew-resize bg-orange-500/0 hover:bg-orange-500/60 focus-visible:bg-orange-500/70 ${
        side === 'in' ? 'left-0' : 'right-0'
      }`}
    />
  )
}

function Chevron({ title, flipped }: { title: string; flipped?: boolean }) {
  return (
    <svg
      viewBox="0 0 8 8"
      aria-hidden="true"
      className={`h-2.5 w-2.5 shrink-0 fill-current opacity-70 ${flipped ? 'rotate-180' : ''}`}
    >
      <title>{title}</title>
      <path d="M0 8 L8 0 L8 8 Z" />
    </svg>
  )
}

/** A tick every 60-odd pixels, at a spacing a person would actually write down. */
function tickStep(pxPerSec: number): number {
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
  return candidates.find((c) => c * pxPerSec >= 60) ?? 600
}
