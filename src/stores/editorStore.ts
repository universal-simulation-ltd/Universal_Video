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
  DEFAULT_FPS,
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
import {
  exportRoute,
  exportTimeline,
  runSegments,
  zipPieces,
  type PieceSink,
  type SegmentOutcome,
} from '../lib/render'
import {
  ZipPickCancelled,
  chooseZipTarget,
  streamingZipSupported,
  type ZipTarget,
} from '../lib/zipTarget'
import { segmentsOf, separateBlocked, zipName, type ExportMode } from '../lib/segments'
import { batchProgress, secondsRemaining } from '../lib/eta'
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
  /**
   * Which piece is being written, when the export is a batch of them. `total`
   * is 1 for a joined movie, and the readout says nothing extra in that case.
   *
   * ⚠️ `fraction`, `framesDone` and `secondsLeft` all describe THIS PIECE, not
   * the batch — they come straight from the encoder, which has never heard of
   * a batch. A progress bar that silently resets to zero four times reads as a
   * bug, so `Progress.tsx` shows the piece counter alongside it rather than
   * pretending the bar spans the whole job.
   */
  piece: { index: number; total: number; name: string }
}

/**
 * One finished piece of a batch, as the result card needs it.
 *
 * ⚠️ `file` is null when the archive was streamed to disk, and that is the
 * whole point of streaming: the piece was handed to the file and released, so
 * there is nothing left in the tab to offer a Save button for. Keeping the
 * blobs "just for the list" would put `Σ pieces` straight back into memory and
 * undo the feature. The name and the size are kept because they cost nothing
 * and are what the list actually shows.
 */
export interface BatchPiece {
  name: string
  bytes: number
  file: ConvertedFile | null
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
  /**
   * One movie, or one file per cut.
   *
   * This is the whole of the "export each piece separately" feature's state.
   * There is no separate mode to enter, no list of split points to manage and
   * no second screen: the cuts already ON the timeline are the pieces, so this
   * flag only decides whether they are joined back together on the way out.
   */
  mode: ExportMode
  /**
   * What the primary Save button saves: the movie, or the zip.
   *
   * Deliberately still one `ConvertedFile`, so `download()`, `ResultCard`'s
   * headline and the "% smaller" comparison did not have to learn about
   * batches. The individual files live in `pieces` beside it.
   *
   * ⚠️ **Null on the streamed path**, where there is nothing to save because
   * the file is already saved — `savedTo` is set instead. A `done` status no
   * longer implies `result`, and `ResultCard` checks both.
   */
  result: ConvertedFile | null
  /** The individual pieces, when the export was a batch. Null otherwise. */
  pieces: BatchPiece[] | null
  /**
   * Where a streamed archive ended up, and how big it turned out.
   *
   * Set instead of `result` when the batch was written straight into a file the
   * user picked. There is no blob to offer afterwards and that is the feature,
   * not a gap: the bytes went to disk as they were made, which is why a batch
   * bigger than the tab can hold is possible at all.
   */
  savedTo: { name: string; bytes: number } | null
  /**
   * Set when a batch stopped part-way and the archive holds only what got
   * written. `status` is still `'done'` — because something usable came out —
   * but the result card says amber and names what is missing.
   */
  partial: { written: number; total: number; reason: string; missing: string[] } | null
  /**
   * Can this browser write an archive straight to a file the user chooses?
   *
   * Read once, at store construction: it is a property of the browser and
   * cannot change mid-session. It reaches the memory plan (which budgets
   * differently for the two destinations) and the export panel (which says what
   * the button is about to do).
   */
  streamingZip: boolean
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
  setMode(mode: ExportMode): void
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
  /** Save one piece on its own, without unzipping. No-op on the streamed path. */
  downloadPiece(index: number): void
  reset(): void
}

/** Only the sources a clip actually uses get read into memory by the exporter. */
function residentBytes(timeline: Timeline, assets: Record<SourceId, SourceAsset>): number {
  const used = new Set(timeline.clips.map((c) => c.sourceId))
  return [...used].reduce((total, id) => total + (assets[id]?.file.size ?? 0), 0)
}

/**
 * Hand a finished file to the browser.
 *
 * Shared by the movie, the zip and a single piece, because all three are the
 * same act — and the Safari note below was learned once and should not have to
 * be learned again in a second copy of this.
 */
/**
 * What to say when a batch produced nothing at all.
 *
 * Kept in the shape it has always had — "Piece 3 of 5 (name) could not be
 * written — reason" — because it is the sentence that used to be thrown from
 * `exportSegments` and it was a good one. What changed is only that it is now
 * reserved for the case where there is genuinely nothing to show for the run;
 * a batch that got three pieces out reports through `partial` instead and
 * keeps them.
 */
function failureMessage(outcome: SegmentOutcome): string {
  const failure = outcome.failure
  if (!failure) return 'The export failed'
  const { index, total, name } = failure.piece
  return `Piece ${index} of ${total} (${name}) could not be written — ${failure.reason}`
}

/** The partial-batch record, or null when every piece was written. */
function partialOf(outcome: SegmentOutcome, total: number) {
  if (!outcome.failure) return null
  return {
    written: outcome.written.length,
    total,
    reason: outcome.failure.reason,
    missing: outcome.failure.missing,
  }
}

function save(file: ConvertedFile | null): void {
  if (!file) return
  const url = URL.createObjectURL(file.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  // Revoked on the next tick rather than immediately: Safari has been known to
  // cancel the download if the URL dies in the same frame as the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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
    const { assets, settings, frame, mode } = get()
    const framed = applyFrame(timeline, frame)
    // ⚠️ The MODE goes into the plan, because the two modes predict different
    // numbers from the same timeline — a gap is black in a joined movie and
    // simply absent from a zip. The button shows `plan.estimate`, so a plan
    // that did not know the mode would put the joined size on a zip button.
    // ⚠️ And the DESTINATION goes in beside it, for the same reason. A batch
    // written straight into a file holds one piece at a time instead of all of
    // them, so the same timeline that is refused on Safari exports on Chrome —
    // and a plan that ignored this would refuse it on both.
    const destination = mode === 'separate' && get().streamingZip ? 'stream' : 'memory'
    const plan = framed.clips.length
      ? planTimelineExport(framed, residentBytes(framed, assets), settings, mode, undefined, destination)
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
    mode: 'one',
    result: null,
    pieces: null,
    savedTo: null,
    partial: null,
    // Asked once. It is a fact about the browser, not about the edit.
    streamingZip: streamingZipSupported(),
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
      set({ status: 'reading', error: null, result: null, pieces: null, savedTo: null, partial: null })

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

    setMode: (mode) => {
      if (get().mode === mode) return
      set({ mode })
      // Re-plan: the two modes predict different totals from the same timeline,
      // and the number on the button comes from the plan.
      reflow(get().timeline)
    },

    exportEdit: async () => {
      const { timeline, assets, settings, plan, status, mode, streamingZip } = get()
      if (status === 'exporting' || !timeline.clips.length) return
      // The refusal is enforced here as well as on the button. A disabled button
      // is a hint; this is the guarantee.
      if (plan?.verdict === 'refuse') return

      const segments = mode === 'separate' ? segmentsOf(timeline) : []
      if (mode === 'separate' && segments.length === 0) {
        // Same guarantee for the other refusal: the timeline stopped being a
        // plain row of cuts (a transition was added, a clip was stacked) while
        // "separate files" was still selected.
        set({ blocked: separateBlocked(timeline) })
        return
      }

      /* ── The save dialog goes FIRST, and nothing may come before it ────────
       *
       * ⚠️ `showSaveFilePicker()` needs transient user activation, and the
       * activation is spent by the first await that outlives it. Every line
       * above this point is synchronous for exactly that reason. Move a probe,
       * a plan or a `set()` that triggers async work in front of it and the
       * picker starts throwing `SecurityError` on slow machines only — the
       * worst kind of bug to be handed.
       *
       * One piece is not a batch: there is nothing to release between pieces,
       * so streaming buys nothing and a save dialog for it would be a dialog
       * for nothing. See the matching guard in `planTimelineExport`.
       */
      let target: ZipTarget | null = null
      if (mode === 'separate' && segments.length > 1 && streamingZip) {
        try {
          target = await chooseZipTarget(zipName(timeline))
        } catch (err) {
          // ⚠️ Cancelling the dialog CANCELS THE EXPORT. Falling back to the
          // in-tab zip here would start a several-minute encode that someone
          // has just declined — and on a batch the tab cannot hold, it would
          // then fail. Silence is the right answer: they are back in the editor
          // with nothing changed.
          if (err instanceof ZipPickCancelled) return
          target = null
        }
      }

      const files: Record<SourceId, File> = {}
      for (const [id, asset] of Object.entries(assets)) files[id] = asset.file

      // Predicted frames per piece — the WEIGHTS that turn the encoder's
      // per-piece reports into one bar that crosses the whole batch. See
      // `batchProgress()`; an empty array (the joined export) makes every line
      // below collapse to exactly what the encoder said.
      const fps = timeline.fps > 0 ? timeline.fps : DEFAULT_FPS
      const weights = segments.map((segment) => Math.max(1, Math.round(segment.durationSec * fps)))
      const startedAt = Date.now()
      let finishedFrames = 0
      let finishedBytes = 0

      const firstPiece = { index: 1, total: Math.max(1, segments.length), name: segments[0]?.name ?? '' }

      set({
        status: 'exporting',
        playing: false,
        error: null,
        blocked: null,
        result: null,
        pieces: null,
        savedTo: null,
        partial: null,
        progress: { fraction: 0, framesDone: 0, framesTotal: 0, bytesOut: 0, startedAt, secondsLeft: null, piece: firstPiece },
      })

      /**
       * One progress writer for both modes.
       *
       * The bytes are cumulative on purpose: `plan.estimate.bytes` predicts the
       * WHOLE export, so an overrun warning comparing one piece against the
       * batch's prediction would never fire. Banking each finished piece's real
       * size keeps the two numbers comparable all the way through.
       */
      const track = (detail: VideoProgress, piece: { index: number; total: number; name: string }) => {
        const remaining = weights.slice(piece.index).reduce((total, frames) => total + frames, 0)
        const batch = batchProgress(finishedFrames, detail, weights[piece.index - 1] ?? 0, remaining)
        const elapsed = (Date.now() - startedAt) / 1000
        set({
          progress: {
            ...detail,
            ...batch,
            fraction: batch.framesTotal > 0 ? batch.framesDone / batch.framesTotal : detail.fraction,
            bytesOut: finishedBytes + detail.bytesOut,
            startedAt,
            secondsLeft: secondsRemaining(batch.framesDone, batch.framesTotal, elapsed),
            piece,
          },
        })
      }

      try {
        if (mode === 'separate') {
          /* Where a finished piece goes, and the ONLY difference between the
           * two destinations.
           *
           * ⚠️ `kept` must stay empty on the streamed path. It is the array
           * whose growth `lib/memory.ts` budgets `2 × Σ pieces` for; pushing to
           * it "just so the result list can offer a Save button" would put the
           * entire ceiling back while the plan went on promising it had gone. */
          const kept: ConvertedFile[] = []
          const sink: PieceSink = target
            ? { accept: async (file) => void (await target!.stream.add(file.name, file.blob)) }
            : { accept: async (file) => void kept.push(file) }

          const outcome = await runSegments({ timeline, files, settings }, sink, {
            onPiece: (piece) =>
              set((s) => ({ progress: s.progress ? { ...s.progress, piece } : s.progress })),
            onDetail: track,
            onPieceDone: (piece, bytes) => {
              finishedFrames += weights[piece.index - 1] ?? 0
              finishedBytes += bytes
            },
          })

          // Nothing at all was written. An archive of no files is not a result
          // to offer, so this is the plain failure it has always been — and the
          // half-made file on disk is abandoned rather than left as a 22-byte
          // empty zip with the user's chosen name on it.
          if (outcome.written.length === 0) {
            await target?.abandon()
            set({ status: 'editing', progress: null, error: failureMessage(outcome) })
            return
          }

          const pieces: BatchPiece[] = outcome.written.map((record, index) => ({
            ...record,
            file: target ? null : (kept[index] ?? null),
          }))
          const partial = partialOf(outcome, segments.length)

          if (target) {
            // Closing writes the central directory for the pieces that landed —
            // all of them, or the ones before the failure. Either way what is on
            // disk is a valid archive when this resolves.
            const bytes = await target.close()
            set({ status: 'done', result: null, savedTo: { name: target.name, bytes }, pieces, partial })
          } else {
            const zip = await zipPieces(kept, zipName(timeline))
            set({ status: 'done', result: zip, savedTo: null, pieces, partial })
          }
        } else {
          const result = await exportTimeline({ timeline, files, settings }, (detail) =>
            track(detail, firstPiece),
          )
          set({ status: 'done', result, pieces: null, savedTo: null, partial: null })
        }
      } catch (err) {
        // Whatever went wrong, the edit itself survives it — the timeline is
        // left exactly as it was so the user can change a setting and try
        // again rather than rebuild the cut.
        await target?.abandon()
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

    download: () => save(get().result),

    // A zip of five pieces is the right default, and a poor way to get at ONE
    // of them — so when the pieces are still in the tab, offering them
    // individually costs nothing but a click.
    //
    // ⚠️ There is nothing to offer on the streamed path: the piece went into
    // the file and was released. `ResultCard` does not draw the button in that
    // case, and this is the guarantee underneath it rather than a second
    // reading of the same condition.
    downloadPiece: (index) => save(get().pieces?.[index]?.file ?? null),

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
        pieces: null,
        savedTo: null,
        partial: null,
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
/** Why "separate files" is not available on this timeline, or null if it is. */
export const selectSeparateBlock = (s: EditorState) => separateBlocked(s.timeline)
/** How many files "separate files" would produce right now. */
export const selectSegmentCount = (s: EditorState) => segmentsOf(s.timeline).length
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
