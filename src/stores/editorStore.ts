import { create } from 'zustand'
import {
  DEFAULT_VIDEO_SETTINGS,
  VIDEO_INPUT_EXTS,
  probeVideoFile,
  videoSupported,
  timelineDuration,
  type ClipId,
  type ConvertedFile,
  type SourceId,
  type Timeline,
  type TimelineSource,
  type Transition,
  type VideoProgress,
  type VideoSettings,
} from '@unisim/media'
import {
  DEFAULT_IMAGE_SEC,
  DEFAULT_TRANSITION_SEC,
  addSource,
  appendClip,
  applyCrossfade,
  clipById,
  cutAt,
  deleteClip,
  describeSource,
  emptyTimeline,
  insertIntro,
  moveClip,
  newSourceId,
  setClipAudio,
  setImageDuration,
  setTransition,
  trimClip,
} from '../lib/edit'
import {
  DEFAULT_FRAME,
  applyFrame,
  customEdge,
  outputFrame,
  type FrameChoice,
  type FramePresetId,
  type FrameSize,
} from '../lib/frame'
import { pictureWidth } from '../lib/layout'
import { planTimelineExport, type TimelinePlan } from '../lib/memory'
import { FALLBACK_VIEWPORT_PX, FIT, clampZoom, maxZoomFor, pxPerSecFor } from '../lib/zoom'
import { exportRoute, exportTimeline } from '../lib/render'
import { secondsRemaining } from '../lib/eta'
import { deleteRecent, getRecent, listRecents, saveRecent, type RecentMeta } from '../lib/recents'

/**
 * The editor IS the app.
 *
 * v1 was drop → settings → convert, one file at a time. The centre of that has
 * been replaced by a timeline, but the two things that made it worth shipping
 * are unchanged: the one-drag-one-click compress path is still one drag and one
 * click (a single dropped file becomes a single clip, and the button still says
 * "Compress this video"), and nothing here ever sends a byte anywhere.
 *
 * Everything that CHANGES the timeline goes through a pure function in
 * `lib/edit.ts`. This store holds what the DOM needs and cannot be pure about:
 * the `File` handles, the object URLs the `<video>` elements read from, the
 * playhead, and the export in flight.
 */

export type EditorStatus = 'empty' | 'reading' | 'editing' | 'exporting' | 'done'

export interface SourceAsset {
  /** The file itself. Never uploaded; only read by this tab. */
  file: File
  /** Object URL for the `<video>`/`<img>` the player draws from. Revoked on reset. */
  url: string
  /** Videos only — the header read that fills in duration, fps and dimensions. */
  probe: { width: number; height: number; duration: number; fps: number; hasAudio: boolean } | null
}

export interface RunProgress extends VideoProgress {
  startedAt: number
  secondsLeft: number | null
}

/** Stills we can put on the timeline as an intro or outro card. */
export const IMAGE_INPUT_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp']

export const EDITOR_ACCEPT = [
  'video/mp4',
  'video/quicktime',
  '.mp4',
  '.m4v',
  '.mov',
  'image/*',
].join(',')

export type Placement = 'append' | 'intro' | 'outro'

interface EditorState {
  status: EditorStatus
  supported: boolean | null
  timeline: Timeline
  assets: Record<SourceId, SourceAsset>
  selectedClipId: ClipId | null
  playheadSec: number
  playing: boolean
  /**
   * Timeline zoom, as a multiple of fit-to-width: 1 means the whole movie spans
   * the player's picture, so the needle at `t` is at `t / duration` of it.
   * Pixels per second is derived from this and `viewportPx` — see `lib/zoom.ts`.
   */
  zoomFactor: number
  /** The width the timeline has to draw in, measured from the DOM by TimelineView. */
  viewportPx: number
  settings: VideoSettings
  /**
   * The output frame the movie is composed into. A property of the MOVIE, not
   * of a clip — which is why it lives here and is edited in the export panel
   * rather than in the clip inspector.
   */
  frame: FrameChoice
  plan: TimelinePlan | null
  progress: RunProgress | null
  result: ConvertedFile | null
  error: string | null
  /** Set when the export could not run at all — e.g. the renderer isn't in the package yet. */
  blocked: string | null

  /** The last few videos, kept in this browser. Metadata only — see `lib/recents.ts`. */
  recents: RecentMeta[]
  /**
   * What the user asked for on the way in, when it was not simply "open this".
   * `'convert'` comes from the front door's Convert pill and makes the export
   * panel announce itself rather than sitting quietly at the bottom right.
   */
  intent: 'convert' | null

  checkSupport(): Promise<void>
  addFiles(files: File[], placement?: Placement): Promise<void>

  select(clipId: ClipId | null): void
  seek(sec: number): void
  setPlaying(playing: boolean): void
  zoom(zoomFactor: number): void
  zoomBy(multiple: number): void
  setViewport(px: number): void

  cut(): void
  removeSelected(): void
  trim(clipId: ClipId, edge: 'in' | 'out', timelineSec: number): void
  drag(clipId: ClipId, startSec: number, track: number): void
  transition(clipId: ClipId, side: 'in' | 'out', kind: Transition['kind'] | null, durationSec?: number): void
  audio(clipId: ClipId, patch: { enabled?: boolean; gain?: number }): void
  cardDuration(sourceId: SourceId, seconds: number): void

  updateSettings(patch: Partial<VideoSettings>): void
  setFramePreset(preset: FramePresetId): void
  setCustomFrame(patch: Partial<FrameSize>): void
  acceptAlternative(): void
  exportEdit(): Promise<void>
  /** Open one video and export it straight away, at whatever the settings are. */
  compressNow(files: File[]): Promise<void>
  loadRecents(): Promise<void>
  openRecent(id: string): Promise<void>
  forgetRecent(id: string): Promise<void>
  setIntent(intent: 'convert' | null): void
  download(): void
  reset(): void
}

/** Only the sources a clip actually uses get read into memory by the exporter. */
function residentBytes(timeline: Timeline, assets: Record<SourceId, SourceAsset>): number {
  const used = new Set(timeline.clips.map((c) => c.sourceId))
  return [...used].reduce((total, id) => total + (assets[id]?.file.size ?? 0), 0)
}

export const useEditorStore = create<EditorState>((set, get) => {
  /**
   * Re-plan after anything that changes what would be exported. The refusal is
   * recomputed on every edit rather than at the moment of pressing Export,
   * because §10.4's whole point is that the answer arrives before the work does.
   *
   * The chosen frame is stamped on FIRST, and that ordering matters twice over.
   * `addSource()` adopts the first video's shape, so a drop after a reframe
   * would otherwise put the frame back; and the memory plan budgets
   * `Σ sources + 2 × output`, so reframing a phone clip up to 1080p changes the
   * output term by a factor of eight — it has to be counted here, while the
   * user can still change it, rather than discovered when Export is pressed.
   */
  function reflow(timeline: Timeline, overrides: Partial<EditorState> = {}) {
    const { assets, settings, frame } = get()
    const framed = applyFrame(timeline, frame)
    const plan = framed.clips.length
      ? planTimelineExport(framed, residentBytes(framed, assets), settings)
      : null
    set({ timeline: framed, plan, ...overrides } as Partial<EditorState>)
  }

  return {
    status: 'empty',
    supported: null,
    timeline: emptyTimeline(),
    assets: {},
    selectedClipId: null,
    playheadSec: 0,
    playing: false,
    zoomFactor: FIT,
    viewportPx: FALLBACK_VIEWPORT_PX,
    settings: DEFAULT_VIDEO_SETTINGS,
    frame: DEFAULT_FRAME,
    plan: null,
    progress: null,
    result: null,
    error: null,
    recents: [],
    intent: null,
    blocked: null,

    checkSupport: async () => {
      set({ supported: await videoSupported() })
    },

    // Nothing here decodes anything: a video is read from its header (see
    // probe.ts) and an image only far enough to learn its size. A 4 GB file
    // lands on the timeline in milliseconds and without touching memory.
    addFiles: async (files, placement = 'append') => {
      if (!files.length) return
      set({ status: 'reading', error: null, result: null })

      let timeline = get().timeline
      const assets = { ...get().assets }
      const problems: string[] = []
      const remember: { file: File; probe: { durationSec: number; width: number; height: number } }[] = []

      for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
        const isVideo = VIDEO_INPUT_EXTS.includes(ext)
        const isImage = IMAGE_INPUT_EXTS.includes(ext) || file.type.startsWith('image/')

        if (!isVideo && !isImage) {
          problems.push(
            `This app reads MP4, M4V and MOV, plus images for intro and outro cards. A .${ext || '???'} ` +
              `file isn’t one of them — and that’s not a missing feature so much as a different product: ` +
              `MKV and AVI need a whole other container reader, and the browser can’t decode the video ` +
              `inside an AVI or WMV even once it’s open.`,
          )
          continue
        }

        try {
          const id = newSourceId()
          const url = URL.createObjectURL(file)
          let source: TimelineSource
          let fps: number | undefined

          if (isVideo) {
            const probe = await probeVideoFile(file)
            source = describeSource(id, 'video', file.name, probe.duration, probe.width, probe.height, probe.hasAudio)
            fps = probe.fps
            assets[id] = {
              file,
              url,
              probe: {
                width: probe.width,
                height: probe.height,
                duration: probe.duration,
                fps: probe.fps,
                hasAudio: probe.hasAudio,
              },
            }
            remember.push({
              file,
              probe: { durationSec: probe.duration, width: probe.width, height: probe.height },
            })
          } else {
            const size = await imageSize(url)
            source = describeSource(id, 'image', file.name, DEFAULT_IMAGE_SEC, size.width, size.height, false)
            assets[id] = { file, url, probe: null }
          }

          timeline = addSource(timeline, source, fps)
          timeline =
            placement === 'intro'
              ? insertIntro(timeline, id)
              : appendClip(timeline, id) // an outro IS an append; there is nothing after the end
        } catch (err) {
          problems.push(err instanceof Error ? err.message : `${file.name} couldn’t be read`)
        }
      }

      set({ assets })
      reflow(timeline, {
        status: timeline.clips.length ? 'editing' : 'empty',
        error: problems.length ? problems.join(' ') : null,
        selectedClipId: timeline.clips.length ? timeline.clips[timeline.clips.length - 1].id : null,
      })

      // Remember them, in the background and never in the way: `saveRecent`
      // swallows a full quota or a private window, and the editor is already
      // usable by the time any of this runs. Videos only — an intro card is
      // not a video somebody comes back to.
      void (async () => {
        let changed = false
        for (const { file, probe } of remember) {
          if (await saveRecent(file, probe)) changed = true
        }
        if (changed) await get().loadRecents()
      })()
    },

    select: (clipId) => set({ selectedClipId: clipId }),

    seek: (sec) => set({ playheadSec: Math.max(0, sec) }),

    setPlaying: (playing) => set({ playing }),

    // The clamp needs the duration and the measured width, because how far in a
    // movie can usefully be pushed depends on both — see `maxZoomFor()`.
    zoom: (zoomFactor) => {
      const { viewportPx, timeline } = get()
      set({ zoomFactor: clampZoom(zoomFactor, viewportPx, timelineDuration(timeline)) })
    },

    zoomBy: (multiple) => get().zoom(get().zoomFactor * multiple),

    setViewport: (px) => {
      // Re-clamp on resize: a narrower window makes fit coarser, which can put
      // the current zoom above the new ceiling.
      const { viewportPx, timeline, zoomFactor } = get()
      if (Math.abs(px - viewportPx) < 0.5) return
      set({ viewportPx: px, zoomFactor: clampZoom(zoomFactor, px, timelineDuration(timeline)) })
    },

    cut: () => {
      const { timeline, playheadSec } = get()
      reflow(cutAt(timeline, playheadSec))
    },

    removeSelected: () => {
      const { timeline, selectedClipId } = get()
      if (!selectedClipId) return
      reflow(deleteClip(timeline, selectedClipId), { selectedClipId: null })
    },

    trim: (clipId, edge, timelineSec) => reflow(trimClip(get().timeline, clipId, edge, timelineSec)),

    drag: (clipId, startSec, track) => reflow(moveClip(get().timeline, clipId, startSec, track)),

    transition: (clipId, side, kind, durationSec = DEFAULT_TRANSITION_SEC) => {
      const timeline = get().timeline
      if (kind === null) {
        reflow(setTransition(timeline, clipId, side, null))
        return
      }
      // A crossfade needs something to dissolve into, so setting one on a clip's
      // head slides it back over its neighbour. A fade needs nothing.
      if (kind === 'crossfade' && side === 'in') {
        reflow(applyCrossfade(timeline, clipId, durationSec))
        return
      }
      reflow(setTransition(timeline, clipId, side, { kind, durationSec }))
    },

    audio: (clipId, patch) => reflow(setClipAudio(get().timeline, clipId, patch)),

    cardDuration: (sourceId, seconds) => reflow(setImageDuration(get().timeline, sourceId, seconds)),

    updateSettings: (patch) => {
      const settings = { ...get().settings, ...patch }
      set({ settings })
      reflow(get().timeline)
    },

    setFramePreset: (preset) => {
      set({ frame: { ...get().frame, preset } })
      reflow(get().timeline)
    },

    // Evened on the way IN, so an odd number never reaches the timeline and the
    // renderer's "both edges have to be even numbers" refusal stays unreachable
    // from this control (see `lib/frame.ts`).
    setCustomFrame: (patch) => {
      const { custom } = get().frame
      const next = {
        width: customEdge(patch.width ?? custom.width),
        height: customEdge(patch.height ?? custom.height),
      }
      set({ frame: { ...get().frame, custom: next } })
      reflow(get().timeline)
    },

    acceptAlternative: () => {
      const alternative = get().plan?.alternative
      if (!alternative) return
      get().updateSettings(alternative.settings)
    },

    exportEdit: async () => {
      const { timeline, assets, settings, plan, status } = get()
      if (status === 'exporting' || !timeline.clips.length) return
      // The refusal is enforced here as well as on the button. A disabled button
      // is a hint; this is the guarantee.
      if (plan?.verdict === 'refuse') return

      const files: Record<SourceId, File> = {}
      for (const [id, asset] of Object.entries(assets)) files[id] = asset.file

      set({
        status: 'exporting',
        playing: false,
        error: null,
        blocked: null,
        result: null,
        progress: { fraction: 0, framesDone: 0, framesTotal: 0, bytesOut: 0, startedAt: Date.now(), secondsLeft: null },
      })

      try {
        const result = await exportTimeline({ timeline, files, settings }, (detail) => {
          const started = get().progress?.startedAt ?? Date.now()
          const elapsed = (Date.now() - started) / 1000
          set({
            progress: {
              ...detail,
              startedAt: started,
              secondsLeft: secondsRemaining(detail.framesDone, detail.framesTotal, elapsed),
            },
          })
        })
        set({ status: 'done', result })
      } catch (err) {
        // Whatever went wrong, the edit itself survives it — the timeline is
        // left exactly as it was so the user can change a setting and try
        // again rather than rebuild the cut.
        set({
          status: 'editing',
          progress: null,
          error: err instanceof Error ? err.message : 'The export failed',
        })
      }
    },

    /**
     * The front door's one-click path: open it, then export it, with no stop in
     * between. It is the same two calls the user would make by hand — there is
     * no second pipeline here, and no settings of its own.
     *
     * ⚠️ It does NOT force the export past a refusal. If the memory plan says
     * the edit will not fit, `exportEdit` returns without doing anything and the
     * editor is on screen with the reason showing, which is the same place a
     * refused Export button leaves you.
     */
    compressNow: async (files) => {
      await get().addFiles(files)
      const { timeline, plan } = get()
      if (!timeline.clips.length) return
      if (plan?.verdict === 'refuse') return
      await get().exportEdit()
    },

    loadRecents: async () => set({ recents: await listRecents() }),

    openRecent: async (id) => {
      const file = await getRecent(id)
      if (!file) {
        // Evicted by the budget, or cleared with the browser's site data. Say so
        // and take the row away rather than leaving a button that does nothing.
        await get().forgetRecent(id)
        set({ error: 'That video isn’t in this browser any more — open it again from your files.' })
        return
      }
      await get().addFiles([file])
    },

    forgetRecent: async (id) => {
      await deleteRecent(id)
      set((s) => ({ recents: s.recents.filter((r) => r.id !== id) }))
    },

    setIntent: (intent) => set({ intent }),

    download: () => {
      const result = get().result
      if (!result) return
      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.name
      a.click()
      // Revoked on the next tick rather than immediately: Safari has been known
      // to cancel the download if the URL dies in the same frame as the click.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },

    reset: () => {
      for (const asset of Object.values(get().assets)) URL.revokeObjectURL(asset.url)
      set({
        status: 'empty',
        timeline: emptyTimeline(),
        assets: {},
        selectedClipId: null,
        playheadSec: 0,
        playing: false,
        // `viewportPx` deliberately survives a reset: it is a fact about the
        // window, not about the edit, and re-measuring it costs a frame of
        // wrong-width timeline.
        zoomFactor: FIT,
        settings: DEFAULT_VIDEO_SETTINGS,
        frame: DEFAULT_FRAME,
        plan: null,
        progress: null,
        result: null,
        error: null,
        blocked: null,
        // Back at the front door, so the way in is a fresh question. `recents`
        // is NOT cleared — it is a fact about this browser, not about the edit.
        intent: null,
      })
    },
  }
})

/** Selectors used in more than one component. */
export const selectDuration = (s: EditorState) => timelineDuration(s.timeline)
/**
 * The zoom, in the units everything that draws works in. Derived rather than
 * stored so it cannot fall out of step with the width or the duration.
 */
export const selectPxPerSec = (s: EditorState) =>
  pxPerSecFor(s.viewportPx, timelineDuration(s.timeline), s.zoomFactor)
export const selectMaxZoom = (s: EditorState) => maxZoomFor(s.viewportPx, timelineDuration(s.timeline))
export const selectSelectedClip = (s: EditorState) =>
  s.selectedClipId ? clipById(s.timeline, s.selectedClipId) : undefined
export const selectRoute = (s: EditorState) => exportRoute(s.timeline)
/**
 * The exported frame size — what the file will really be. The player draws its
 * canvas at this shape, so the preview's black bars are the file's black bars.
 * Selected as two numbers rather than an object because a selector returning a
 * fresh object every render has no stable identity to compare.
 */
export const selectFrameWidth = (s: EditorState) => outputFrame(s.timeline, s.settings).width
export const selectFrameHeight = (s: EditorState) => outputFrame(s.timeline, s.settings).height
/**
 * How wide the picture is drawn — the full width, or less when the frame is
 * upright enough to hit the height cap (see `lib/layout.ts`).
 *
 * A selector rather than a calculation in each component because the PLAYER and
 * the TIMELINE both lay out from it and they must never disagree: the needle is
 * placed as a fraction of the timeline's width, so a timeline wider than the
 * picture puts the needle somewhere the picture isn't.
 */
export const selectPictureWidth = (s: EditorState) => {
  const { width, height } = outputFrame(s.timeline, s.settings)
  return pictureWidth(height > 0 ? width / height : 0)
}

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('That image couldn’t be opened by this browser.'))
    img.src = url
  })
}
