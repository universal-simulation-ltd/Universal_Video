import { useCallback, useEffect, useRef } from 'react'
import { timelineDuration } from '@unisim/media'
import { audioAt, fitInside, layersAt, visibleLayers, type Layer, type LayerSize } from '../lib/compose'
import { timecode } from '../lib/timecode'
import {
  selectFrameHeight,
  selectFrameWidth,
  selectPictureWidth,
  useEditorStore,
} from '../stores/editorStore'

/**
 * The canvas's backing store, in pixels across.
 *
 * Fixed, so the DISPLAYED width never changes with the output frame — the
 * timeline is laid out to the same box and the needle would stop lining up if
 * the picture narrowed. The frame's aspect sets the height instead.
 */
const PREVIEW_W = 640

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
 *
 * ⚠️ **The canvas IS the output frame.** It is sized to the exported frame's
 * aspect and every layer is drawn through `fitInside()` — the same *contain*
 * the renderer's `drawContained()` uses — so a source of a differing shape is
 * centred with black down the sides or across the top, exactly as it will be in
 * the file. That equality is the whole point of the reframe control: if the
 * preview and the export disagree about the bars, the preview is lying, and the
 * user finds out after the encode instead of before it.
 *
 * The BOX it is drawn in is bounded both ways (`lib/layout.ts`): 720 across, 540
 * down. An upright frame therefore narrows rather than growing to ~1280 px tall
 * and pushing the transport, the toolbar and the timeline off the screen — and
 * the timeline narrows with it, because the needle is placed as a fraction of
 * the timeline's width and only means anything while the two boxes match.
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
  // The output frame, for the culling test. A ref because `syncMedia` and
  // `draw` are stable callbacks reading refs rather than re-created per render.
  const frameRef = useRef({ width: 1920, height: 1080 })

  timelineRef.current = timeline
  playingRef.current = playing

  // The EXPORTED frame, not the timeline's raw one: the resolution cap scales
  // it, and the preview has to show the shape that will really come out.
  const frameWidth = useEditorStore(selectFrameWidth)
  const frameHeight = useEditorStore(selectFrameHeight)
  // How wide the picture is allowed to be drawn: the full box, or narrower when
  // an upright frame would otherwise be taller than the screen. The timeline
  // reads the SAME selector — see `lib/layout.ts` for why they cannot differ.
  const boxWidth = useEditorStore(selectPictureWidth)

  const duration = timelineDuration(timeline)
  const aspect = frameWidth > 0 && frameHeight > 0 ? frameWidth / frameHeight : 16 / 9
  frameRef.current = { width: frameWidth, height: frameHeight }

  /**
   * How big a layer's picture actually is.
   *
   * ⚠️ Read off the LIVE element, not off `TimelineSource.width/height`, and
   * the difference matters in exactly one direction. The cull below throws away
   * a layer on the strength of this answer, so being wrong here means blanking
   * picture the user can see — and the element is the same thing the canvas
   * will draw, so it cannot disagree with what is on screen. A source whose
   * metadata has not loaded returns null, which the cull treats as "does not
   * cover".
   */
  const sizeOf = useCallback((layer: Layer): LayerSize | null => {
    const el = mediaRef.current.get(layer.clip.sourceId)
    if (!el) return null
    const width = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth
    const height = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight
    return width > 0 && height > 0 ? { width, height } : null
  }, [])

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

    // Nothing hidden behind an opaque, frame-filling layer is drawn: on a
    // stacked timeline that is a whole `drawImage` of a full-frame video per
    // animation frame, spent on pixels that are immediately painted over.
    const frame = frameRef.current
    const visible = visibleLayers(layersAt(tl, at), frame.width, frame.height, sizeOf)
    // How many layers this frame actually cost. On the canvas because the cull
    // is otherwise invisible by construction — a correct cull looks exactly
    // like no cull — so without this the only way to test it is to measure
    // frame rates, which is not a test. Written only when it changes; a dataset
    // write per animation frame is a layout-thrash waiting to happen.
    const drawn = String(visible.length)
    if (canvas.dataset.drawn !== drawn) canvas.dataset.drawn = drawn

    for (const layer of visible) {
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
  }, [sizeOf])

  /** Point every source element at the frame (and the volume) it should be at. */
  const syncMedia = useCallback((at: number, isPlaying: boolean) => {
    const tl = timelineRef.current
    const frame = frameRef.current
    const layers = layersAt(tl, at)
    const wanted = new Map(layers.map((l) => [l.clip.sourceId, l.sourceSec]))
    const gains = new Map(audioAt(tl, at).map((a) => [a.clip.sourceId, a.gain]))
    const seen = new Set(
      visibleLayers(layers, frame.width, frame.height, sizeOf).map((l) => l.clip.sourceId),
    )

    for (const [sourceId, el] of mediaRef.current) {
      if (!(el instanceof HTMLVideoElement)) continue
      const target = wanted.get(sourceId)
      const gain = gains.get(sourceId) ?? 0
      // ⚠️ HIDDEN IS NOT ENOUGH TO PAUSE. A clip behind another is still
      // audible — laying a shot over a running voiceover is an ordinary edit,
      // not a mistake — and a paused `<video>` makes no sound. So a source is
      // only stopped when it is both out of sight AND silent; that is the case
      // where it can contribute nothing, and where stopping it takes a whole
      // video decode off the main thread. A hidden but audible source keeps
      // playing (the browser will decode its frames; there is no way to have
      // the sound without that) and simply is not drawn.
      if (target === undefined || (!seen.has(sourceId) && gain === 0)) {
        if (!el.paused) el.pause()
        continue
      }
      el.volume = Math.min(1, Math.max(0, gain))
      el.muted = gain === 0

      const drift = Math.abs(el.currentTime - target)
      // Scrubbing wants an exact frame; playback only wants to stay in step, and
      // seeking a playing video every frame is what makes a preview stutter.
      if (drift > (isPlaying ? 0.3 : 0.04)) el.currentTime = target
      if (isPlaying && el.paused) void el.play().catch(() => { /* autoplay policy; the picture still runs */ })
      if (!isPlaying && !el.paused) el.pause()
    }
  }, [sizeOf])

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
      {/* The PICTURE is capped and centred — `lib/layout.ts` — and that box is
          about the picture only. The timeline is no longer laid out from it:
          it matches the scrub bar below, which is the other thing measuring
          time. See the ⚠️ on the scrub. */}
      <div className="mx-auto w-full" style={{ maxWidth: boxWidth }}>
        <canvas
          ref={canvasRef}
          width={PREVIEW_W}
          height={Math.max(2, Math.round(PREVIEW_W / (aspect || 16 / 9)))}
          data-testid="preview"
          data-frame={`${frameWidth}x${frameHeight}`}
          aria-label="Preview of the edit"
          className="w-full rounded-xl bg-black"
        />
      </div>

      {/* ⚠️ THE SCRUB IS ON ITS OWN ROW, AND THAT IS THE WHOLE POINT.
          It used to share a row with the button and the clock — `flex-1`
          between two `shrink-0`s — so its time axis started after the Play
          button and stopped before the clock, while the timeline below ran the
          full width of its card. The two were the same movie measured against
          two different rulers: the knob at half way and the needle at half way
          were ~120px apart at 1440, and further at every other width.

          On its own row it is exactly the card's content box, which is exactly
          what the timeline's viewport is — so they agree structurally, at every
          breakpoint and for every duration, rather than by arithmetic somebody
          has to keep true. Do not put anything back on this row.

          (The residual: a native range's thumb CENTRE travels from half a thumb
          in to half a thumb short of the end, so t=0 and t=duration sit ~8px
          inside the needle's own 0…width. Everything between is exact. Fixing
          those 8px means `appearance-none` and hand-drawing the track in both
          engines, which is a lot of CSS to buy half a thumb.) */}
      <input
        type="range"
        min={0}
        max={Math.max(duration, 0.1)}
        step={0.01}
        value={Math.min(playheadSec, duration)}
        aria-label="Playhead"
        data-testid="scrub"
        onChange={(e) => {
          setPlaying(false)
          seek(Number(e.target.value))
        }}
        className="mt-3 block w-full accent-orange-600"
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'Pause' : 'Play'}
          className="shrink-0 rounded-lg bg-orange-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-orange-800"
        >
          {playing ? 'Pause' : 'Play'}
        </button>

        <p className="ml-auto shrink-0 text-[12px] tabular-nums text-slate-600 dark:text-slate-300" data-testid="clock">
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
              data-source-id={source.id}
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
              data-source-id={source.id}
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
