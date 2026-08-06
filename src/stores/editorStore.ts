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
import { planTimelineExport, type TimelinePlan } from '../lib/memory'
import { RendererUnavailableError, exportRoute, exportTimeline } from '../lib/render'
import { secondsRemaining } from '../lib/eta'

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
  /** Timeline zoom. Pixels per second of movie. */
  pxPerSec: number
  settings: VideoSettings
  plan: TimelinePlan | null
  progress: RunProgress | null
  result: ConvertedFile | null
  error: string | null
  /** Set when the export could not run at all — e.g. the renderer isn't in the package yet. */
  blocked: string | null

  checkSupport(): Promise<void>
  addFiles(files: File[], placement?: Placement): Promise<void>

  select(clipId: ClipId | null): void
  seek(sec: number): void
  setPlaying(playing: boolean): void
  zoom(pxPerSec: number): void

  cut(): void
  removeSelected(): void
  trim(clipId: ClipId, edge: 'in' | 'out', timelineSec: number): void
  drag(clipId: ClipId, startSec: number, track: number): void
  transition(clipId: ClipId, side: 'in' | 'out', kind: Transition['kind'] | null, durationSec?: number): void
  audio(clipId: ClipId, patch: { enabled?: boolean; gain?: number }): void
  cardDuration(sourceId: SourceId, seconds: number): void

  updateSettings(patch: Partial<VideoSettings>): void
  acceptAlternative(): void
  exportEdit(): Promise<void>
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
   */
  function reflow(timeline: Timeline, overrides: Partial<EditorState> = {}) {
    const { assets, settings } = get()
    const plan = timeline.clips.length
      ? planTimelineExport(timeline, residentBytes(timeline, assets), settings)
      : null
    set({ timeline, plan, ...overrides } as Partial<EditorState>)
  }

  return {
    status: 'empty',
    supported: null,
    timeline: emptyTimeline(),
    assets: {},
    selectedClipId: null,
    playheadSec: 0,
    playing: false,
    pxPerSec: 60,
    settings: DEFAULT_VIDEO_SETTINGS,
    plan: null,
    progress: null,
    result: null,
    error: null,
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
    },

    select: (clipId) => set({ selectedClipId: clipId }),

    seek: (sec) => set({ playheadSec: Math.max(0, sec) }),

    setPlaying: (playing) => set({ playing }),

    zoom: (pxPerSec) => set({ pxPerSec: Math.min(400, Math.max(4, pxPerSec)) }),

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
        // The renderer being absent is not a failure of the edit — say so
        // differently, and leave the timeline exactly as it was.
        if (err instanceof RendererUnavailableError) {
          set({ status: 'editing', progress: null, blocked: err.message })
          return
        }
        set({
          status: 'editing',
          progress: null,
          error: err instanceof Error ? err.message : 'The export failed',
        })
      }
    },

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
        pxPerSec: 60,
        settings: DEFAULT_VIDEO_SETTINGS,
        plan: null,
        progress: null,
        result: null,
        error: null,
        blocked: null,
      })
    },
  }
})

/** Selectors used in more than one component. */
export const selectDuration = (s: EditorState) => timelineDuration(s.timeline)
export const selectSelectedClip = (s: EditorState) =>
  s.selectedClipId ? clipById(s.timeline, s.selectedClipId) : undefined
export const selectRoute = (s: EditorState) => exportRoute(s.timeline)

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('That image couldn’t be opened by this browser.'))
    img.src = url
  })
}
