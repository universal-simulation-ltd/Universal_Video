import { useCallback, useEffect, useRef } from 'react'
import { timelineDuration } from '@unisim/media'
import { audioAt, fitInside, layersAt } from '../lib/compose'
import { PLAYER_MAX_W } from '../lib/layout'
import { timecode } from '../lib/timecode'
import { useEditorStore } from '../stores/editorStore'

/**
 * The picture, at the playhead.
 *
 * This is a PREVIEW, not the renderer. It composites the source `<video>` and
 * `<img>` elements onto a canvas using `layersAt()` — the same pure function
 * the tests cover — so what you see while you edit is the same arrangement
 * `renderTimeline()` will be given. It is deliberately not the same code: the
 * exporter re-encodes with WebCodecs and cannot run at 30 fps while you scrub.
 *
 * The media elements live in the DOM (one per source) rather than being created
 * per draw, because a `<video>` that has to be re-created every frame can never
 * be seeked ahead of the frame that needs it.
 */
export default function Player() {
  const timeline = useEditorStore((s) => s.timeline)
  const assets = useEditorStore((s) => s.assets)
  const playing = useEditorStore((s) => s.playing)
  const setPlaying = useEditorStore((s) => s.setPlaying)
  const seek = useEditorStore((s) => s.seek)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRef = useRef(new Map<string, HTMLVideoElement | HTMLImageElement>())
  // The playhead is mirrored here so the draw loop can advance it without a
  // React render per frame; the store is the source of truth and is written
  // back on every tick for the ruler and the readout.
  const headRef = useRef(0)
  const lastTickRef = useRef(0)
  const playingRef = useRef(playing)
  const timelineRef = useRef(timeline)

  timelineRef.current = timeline
  playingRef.current = playing

  const duration = timelineDuration(timeline)
  const aspect = timeline.width > 0 ? timeline.width / timeline.height : 16 / 9

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const tl = timelineRef.current
    const at = headRef.current

    // Cleared to black every frame: a `fade` transition fades to and from
    // exactly this, so the background is part of the picture rather than
    // decoration.
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (const layer of layersAt(tl, at)) {
      const el = mediaRef.current.get(layer.clip.sourceId)
      if (!el) continue
      const isVideo = el instanceof HTMLVideoElement
      if (isVideo && el.readyState < 2) continue
      if (!isVideo && !(el as HTMLImageElement).complete) continue

      const w = isVideo ? el.videoWidth : (el as HTMLImageElement).naturalWidth
      const h = isVideo ? el.videoHeight : (el as HTMLImageElement).naturalHeight
      if (!w || !h) continue

      const box = fitInside(w, h, canvas.width, canvas.height)
      ctx.globalAlpha = layer.opacity
      ctx.drawImage(el, box.x, box.y, box.width, box.height)
      ctx.globalAlpha = 1
    }
  }, [])

  /** Point every source element at the frame (and the volume) it should be at. */
  const syncMedia = useCallback((at: number, isPlaying: boolean) => {
    const tl = timelineRef.current
    const wanted = new Map(layersAt(tl, at).map((l) => [l.clip.sourceId, l.sourceSec]))
    const gains = new Map(audioAt(tl, at).map((a) => [a.clip.sourceId, a.gain]))

    for (const [sourceId, el] of mediaRef.current) {
      if (!(el instanceof HTMLVideoElement)) continue
      const target = wanted.get(sourceId)
      if (target === undefined) {
        if (!el.paused) el.pause()
        continue
      }
      const gain = gains.get(sourceId) ?? 0
      el.volume = Math.min(1, Math.max(0, gain))
      el.muted = gain === 0

      const drift = Math.abs(el.currentTime - target)
      // Scrubbing wants an exact frame; playback only wants to stay in step, and
      // seeking a playing video every frame is what makes a preview stutter.
      if (drift > (isPlaying ? 0.3 : 0.04)) el.currentTime = target
      if (isPlaying && el.paused) void el.play().catch(() => { /* autoplay policy; the picture still runs */ })
      if (!isPlaying && !el.paused) el.pause()
    }
  }, [])

  // One animation loop for the whole player. It runs whenever there is anything
  // on the timeline — not only during playback — so a seek always repaints.
  useEffect(() => {
    let raf = 0
    lastTickRef.current = performance.now()

    const tick = (now: number) => {
      const elapsed = (now - lastTickRef.current) / 1000
      lastTickRef.current = now

      if (playingRef.current) {
        const end = timelineDuration(timelineRef.current)
        const next = headRef.current + elapsed
        if (next >= end) {
          headRef.current = end
          useEditorStore.getState().setPlaying(false)
          useEditorStore.getState().seek(end)
        } else {
          headRef.current = next
          useEditorStore.getState().seek(next)
        }
      }

      syncMedia(headRef.current, playingRef.current)
      draw()
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [draw, syncMedia])

  // A seek from anywhere else (the ruler, the slider, a cut) lands here.
  const playheadSec = useEditorStore((s) => s.playheadSec)
  useEffect(() => {
    if (Math.abs(headRef.current - playheadSec) > 0.001) {
      headRef.current = playheadSec
      syncMedia(playheadSec, false)
      draw()
    }
  }, [playheadSec, draw, syncMedia])

  const sources = timeline.sources.filter((s) => assets[s.id])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      {/* The timeline's scroll viewport is laid out from this same constant, in
          this same box, so the needle lines up under the picture. */}
      <div className="mx-auto w-full" style={{ maxWidth: PLAYER_MAX_W }}>
        <canvas
          ref={canvasRef}
          width={640}
          height={Math.round(640 / (aspect || 16 / 9))}
          data-testid="preview"
          aria-label="Preview of the edit"
          className="w-full rounded-xl bg-black"
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'Pause' : 'Play'}
          className="shrink-0 rounded-lg bg-orange-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-orange-700"
        >
          {playing ? 'Pause' : 'Play'}
        </button>

        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.01}
          value={Math.min(playheadSec, duration)}
          aria-label="Playhead"
          onChange={(e) => {
            setPlaying(false)
            seek(Number(e.target.value))
          }}
          className="min-w-0 flex-1 accent-orange-600"
        />

        <p className="shrink-0 text-[12px] tabular-nums text-slate-600 dark:text-slate-300" data-testid="clock">
          <span className="font-semibold text-slate-900 dark:text-slate-100">{timecode(playheadSec)}</span>
          {' / '}
          {timecode(duration)}
        </p>
      </div>

      {/* The source elements the canvas draws from. Off-screen rather than
          `display:none`, which some browsers take as permission to stop
          decoding. Nothing here is uploaded: every `src` is a blob: URL made
          from a file this tab already holds. */}
      <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
        {sources.map((source) => {
          const asset = assets[source.id]
          return source.kind === 'video' ? (
            <video
              key={source.id}
              ref={(el) => {
                if (el) mediaRef.current.set(source.id, el)
                else mediaRef.current.delete(source.id)
              }}
              src={asset.url}
              preload="auto"
              playsInline
            />
          ) : (
            <img
              key={source.id}
              ref={(el) => {
                if (el) mediaRef.current.set(source.id, el)
                else mediaRef.current.delete(source.id)
              }}
              src={asset.url}
              alt=""
            />
          )
        })}
      </div>
    </section>
  )
}
