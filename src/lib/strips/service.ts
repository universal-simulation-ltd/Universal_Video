import type { FromWorker, ToWorker } from './protocol'
import { accumulatePeaks, peakBinsFor, timeKey, type Peaks } from './layout'

/**
 * The timeline strips' cache and scheduler — the main-thread half.
 *
 * Clips say which frames they would like to show (`want`), and this decides
 * what to ask the worker for, keeps what comes back, and tells the clips when
 * there is something new to draw. Four rules hold it together:
 *
 * 1. **Cached by file.** A cut makes two clips of one file; the same file added
 *    twice is still one file. Both share every frame and the one set of peaks.
 *    Frames are keyed by a power-of-two grid time (see `layout.ts`), so a frame
 *    fetched at one zoom is reused at every finer one.
 * 2. **One job per file, replaced not stacked.** When the wanted set changes
 *    (zoom, scroll, a trim) the job in flight is kept if it is still mostly
 *    useful and cancelled otherwise; wants are batched over a short debounce so
 *    a pinch-zoom does not start twenty jobs.
 * 3. **Bounded.** Frames are `ImageBitmap`s, which hold GPU/decoded memory until
 *    `close()`. A file no clip uses any more is dropped and every bitmap of it
 *    closed; above `MAX_BYTES` the least recently drawn frames nobody is asking
 *    for are closed first. The fallback's object URLs are revoked when its run
 *    ends, however it ends.
 * 4. **Main thread only for what the worker cannot do.** WebCodecs runs in the
 *    worker. Only the fallback — a hidden `<video>` seeked frame by frame, for a
 *    browser or a codec WebCodecs cannot decode — lives here, and it stands down
 *    while the movie is playing so it never competes with the preview.
 */

/** About 1,200 thumbnails at 2× — far more than a screenful, far less than a tab notices. */
const MAX_BYTES = 48 * 1024 * 1024
/** How long wants are gathered before jobs are (re)issued. */
const DEBOUNCE_MS = 60
/** Above this, the whole-file audio fallback is not attempted — it would load the file into memory. */
const WHOLE_FILE_AUDIO_LIMIT = 256 * 1024 * 1024

export type StripPath = 'decoder' | 'element'
export type PeaksState = 'loading' | 'done' | 'none' | 'failed'

export interface StripSpec {
  file: File
  kind: 'video' | 'image'
  /** Thumbnail size in device pixels. */
  width: number
  height: number
}

interface Entry {
  bitmap: ImageBitmap
  bytes: number
  /** How far the picture is from its grid time — 0 unless a keyframe stood in for it. */
  errorSec: number
}

interface FrameJob {
  id: number
  remaining: Set<number>
  toleranceSec: number
  path: StripPath
  abort?: AbortController
}

interface FileState {
  key: string
  spec: StripSpec
  frames: Map<number, Entry>
  /** Cached time keys, sorted, for the nearest-frame lookup. */
  sorted: number[]
  /** Times the fallback could not produce — not asked for again. */
  failed: Set<number>
  path: StripPath
  job: FrameJob | null
  imageJob: number | null
  imageDone: boolean
  version: number
}

interface PeaksEntry {
  file: File
  state: PeaksState
  peaks: Peaks | null
  jobId: number
  version: number
}

/** Test hook: `window.__uvStrips = { video: 'element', audio: 'fallback' }` before the app loads. */
interface ForceFlags {
  video?: 'element'
  audio?: 'fallback'
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Resolve on `event`, reject on `error` or after `ms` — never park forever on a media element. */
function once(el: HTMLMediaElement, event: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (ok: boolean) => {
      el.removeEventListener(event, onOk)
      el.removeEventListener('error', onErr)
      clearTimeout(timer)
      if (ok) resolve()
      else reject(new Error(`${event} never came`))
    }
    const onOk = () => done(true)
    const onErr = () => done(false)
    const timer = setTimeout(() => done(false), ms)
    el.addEventListener(event, onOk)
    el.addEventListener('error', onErr)
  })
}

export class StripService {
  private worker: Worker | null | undefined
  private files = new Map<string, FileState>()
  private peaksByFile = new Map<File, PeaksEntry>()
  private consumers = new Map<string, { key: string; times: number[]; toleranceSec: number }>()
  private listeners = new Map<string, Set<() => void>>()
  private jobOwner = new Map<number, string>()
  private peaksOwner = new Map<number, File>()
  private nextJob = 1
  private bytes = 0
  /** Least recently drawn first: `fileKey|timeKey`. */
  private lru = new Map<string, true>()
  private pumpTimer: ReturnType<typeof setTimeout> | null = null
  private notifyQueued = new Set<string>()
  private notifyFrame: number | null = null
  private paused = false
  private elementQueue: Promise<void> = Promise.resolve()
  private force: ForceFlags
  /** Counters for the tests and the leak check — nothing reads them in the app. */
  readonly stats = { bitmapsOpen: 0, urlsOpen: 0, jobsStarted: 0, jobsCancelled: 0, fallbacks: 0 }

  constructor() {
    const flags = (globalThis as { __uvStrips?: ForceFlags }).__uvStrips
    this.force = flags && typeof flags === 'object' ? flags : {}
  }

  // ─── What the clips call ───────────────────────────────────────────────────

  /** The cache key for a file at a thumbnail size. */
  keyOf(spec: StripSpec): string {
    const f = spec.file
    return `${f.name}|${f.size}|${f.lastModified}|${spec.kind}|${spec.width}x${spec.height}`
  }

  /**
   * `consumer` (a clip) would like these grid times of this file, each within
   * `toleranceSec`. Replaces what it wanted before.
   */
  want(consumer: string, spec: StripSpec, times: number[], toleranceSec: number): string {
    const key = this.keyOf(spec)
    if (!this.files.has(key)) {
      this.files.set(key, {
        key,
        spec,
        frames: new Map(),
        sorted: [],
        failed: new Set(),
        path: this.force.video === 'element' ? 'element' : 'decoder',
        job: null,
        imageJob: null,
        imageDone: false,
        version: 0,
      })
    }
    this.consumers.set(consumer, { key, times, toleranceSec })
    this.schedulePump()
    return key
  }

  release(consumer: string): void {
    if (!this.consumers.delete(consumer)) return
    this.schedulePump()
  }

  /**
   * The frame for this grid time, if one has been made close enough to it. A
   * keyframe that stood in for it when zoomed out is not close enough once
   * zoomed in: it stays on screen (through `nearest`) until the exact one lands.
   */
  frame(key: string, timeSec: number, toleranceSec: number): ImageBitmap | null {
    const file = this.files.get(key)
    if (!file) return null
    if (file.spec.kind === 'image') return file.frames.get(0)?.bitmap ?? null
    const tk = timeKey(timeSec)
    const hit = file.frames.get(tk)
    if (!hit || hit.errorSec > toleranceSec + 1e-3) return null
    const id = `${key}|${tk}`
    this.lru.delete(id)
    this.lru.set(id, true)
    return hit.bitmap
  }

  /**
   * The closest frame there is, within `withinSec` — what a slot shows while its
   * own frame is on the way. Zooming in therefore sharpens a strip that is
   * already there rather than blanking it and starting again.
   */
  nearest(key: string, timeSec: number, withinSec: number): ImageBitmap | null {
    const file = this.files.get(key)
    if (!file || !file.sorted.length) return null
    const tk = timeKey(timeSec)
    const s = file.sorted
    let lo = 0
    let hi = s.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (s[mid] < tk) lo = mid + 1
      else hi = mid
    }
    let best = s[lo]
    if (lo > 0 && Math.abs(s[lo - 1] - tk) < Math.abs(best - tk)) best = s[lo - 1]
    if (Math.abs(best - tk) > timeKey(withinSec)) return null
    return file.frames.get(best)?.bitmap ?? null
  }

  pathOf(key: string): StripPath | null {
    return this.files.get(key)?.path ?? null
  }

  /** Has the image card's one thumbnail been attempted? */
  imageSettled(key: string): boolean {
    return this.files.get(key)?.imageDone ?? false
  }

  /** The sound peaks for a file, starting the decode the first time anyone asks. */
  peaks(file: File): { state: PeaksState; peaks: Peaks | null } {
    let entry = this.peaksByFile.get(file)
    if (!entry) {
      const jobId = this.nextJob++
      entry = { file, state: 'loading', peaks: null, jobId, version: 0 }
      this.peaksByFile.set(file, entry)
      this.peaksOwner.set(jobId, file)
      this.stats.jobsStarted++
      const w = this.ensureWorker()
      if (w) this.send({ type: 'peaks', jobId, file, noDecoder: this.force.audio === 'fallback' })
      else void this.peaksOnMainThread(entry, null, 0)
    }
    return { state: entry.state, peaks: entry.peaks }
  }

  /** The peaks as they stand, without starting anything. */
  peaksOf(file: File): { state: PeaksState; peaks: Peaks | null } {
    const entry = this.peaksByFile.get(file)
    return entry ? { state: entry.state, peaks: entry.peaks } : { state: 'loading', peaks: null }
  }

  peaksKey(file: File): string {
    return `peaks|${file.name}|${file.size}|${file.lastModified}`
  }

  subscribe(key: string, cb: () => void): () => void {
    let set = this.listeners.get(key)
    if (!set) this.listeners.set(key, (set = new Set()))
    set.add(cb)
    return () => {
      set!.delete(cb)
      if (!set!.size) this.listeners.delete(key)
    }
  }

  version(key: string): number {
    if (key.startsWith('peaks|')) {
      for (const e of this.peaksByFile.values()) if (this.peaksKey(e.file) === key) return e.version
      return 0
    }
    return this.files.get(key)?.version ?? 0
  }

  /** The fallback stands down while the movie plays; the worker does not need to. */
  setPaused(paused: boolean): void {
    this.paused = paused
  }

  /**
   * Drop every file the timeline no longer uses: cancel its jobs and close its
   * bitmaps. Called on every timeline change, so deleting the last clip of a
   * file — or Start again — gives its memory straight back.
   */
  prune(live: Set<File>): void {
    for (const file of [...this.files.values()]) {
      if (!live.has(file.spec.file)) this.dropFile(file)
    }
    for (const entry of [...this.peaksByFile.values()]) {
      if (!live.has(entry.file)) {
        if (entry.state === 'loading') this.cancel(entry.jobId)
        this.peaksOwner.delete(entry.jobId)
        this.peaksByFile.delete(entry.file)
      }
    }
    if (!this.files.size && !this.peaksByFile.size && this.worker) {
      // Nothing left to make: let the worker (and any decoder it holds) go.
      this.worker.terminate()
      this.worker = undefined
    }
  }

  /** Everything, gone — the setting turned off. */
  clear(): void {
    this.consumers.clear()
    this.prune(new Set())
  }

  // ─── Scheduling ────────────────────────────────────────────────────────────

  private schedulePump(): void {
    if (this.pumpTimer !== null) return
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = null
      this.pump()
    }, DEBOUNCE_MS)
  }

  private pump(): void {
    const wanted = new Map<string, Set<number>>()
    const tolerance = new Map<string, number>()
    for (const { key, times, toleranceSec } of this.consumers.values()) {
      let set = wanted.get(key)
      if (!set) wanted.set(key, (set = new Set()))
      for (const t of times) set.add(timeKey(t))
      tolerance.set(key, Math.min(tolerance.get(key) ?? Infinity, toleranceSec))
    }
    for (const file of this.files.values()) {
      const want = wanted.get(file.key)
      if (file.spec.kind === 'image') {
        if (want && !file.imageDone && file.imageJob === null) this.startImage(file)
        continue
      }
      const tol = tolerance.get(file.key) ?? 0
      const missing = new Set<number>()
      for (const tk of want ?? []) {
        const hit = file.frames.get(tk)
        if ((!hit || hit.errorSec > tol + 1e-3) && !file.failed.has(tk)) missing.add(tk)
      }
      const job = file.job
      if (job) {
        const stillUseful = [...missing].every((tk) => job.remaining.has(tk))
        const wasted = [...job.remaining].filter((tk) => !missing.has(tk)).length
        // Keep a job that covers everything wanted and is not mostly working
        // for a zoom the user has already left; replace it otherwise.
        if (missing.size && stillUseful && wasted <= Math.max(4, missing.size / 2) && job.toleranceSec <= tol) continue
        this.cancelFrames(file)
      }
      if (missing.size) this.startFrames(file, [...missing].sort((a, b) => a - b).map((tk) => tk / 1024), tol)
    }
  }

  private startFrames(file: FileState, times: number[], toleranceSec: number): void {
    const id = this.nextJob++
    const job: FrameJob = { id, remaining: new Set(times.map(timeKey)), toleranceSec, path: file.path }
    file.job = job
    this.jobOwner.set(id, file.key)
    this.stats.jobsStarted++
    if (file.path === 'decoder' && this.ensureWorker()) {
      this.send({
        type: 'frames',
        jobId: id,
        file: file.spec.file,
        times,
        width: file.spec.width,
        height: file.spec.height,
        toleranceSec,
      })
    } else {
      file.path = 'element'
      job.path = 'element'
      this.runElement(file, job, times)
    }
  }

  private startImage(file: FileState): void {
    const id = this.nextJob++
    file.imageJob = id
    this.jobOwner.set(id, file.key)
    this.stats.jobsStarted++
    if (this.ensureWorker()) {
      this.send({ type: 'image', jobId: id, file: file.spec.file, width: file.spec.width, height: file.spec.height })
    } else {
      void this.imageOnMainThread(file, id)
    }
  }

  private cancelFrames(file: FileState): void {
    const job = file.job
    if (!job) return
    file.job = null
    // `jobOwner` keeps the id: frames the worker had already sent are still
    // good frames, and land in the cache when they arrive.
    job.abort?.abort()
    if (job.path === 'decoder') this.cancel(job.id)
    this.stats.jobsCancelled++
  }

  private cancel(jobId: number): void {
    this.send({ type: 'cancel', jobId })
  }

  private dropFile(file: FileState): void {
    this.cancelFrames(file)
    if (file.imageJob !== null) {
      this.cancel(file.imageJob)
      this.jobOwner.delete(file.imageJob)
      file.imageJob = null
    }
    for (const [tk, entry] of file.frames) {
      this.closeEntry(entry)
      this.lru.delete(`${file.key}|${tk}`)
    }
    file.frames.clear()
    file.sorted = []
    this.files.delete(file.key)
    for (const [id, key] of this.jobOwner) if (key === file.key) this.jobOwner.delete(id)
    for (const [consumer, c] of this.consumers) if (c.key === file.key) this.consumers.delete(consumer)
  }

  // ─── Results ───────────────────────────────────────────────────────────────

  private store(file: FileState, timeSec: number, bitmap: ImageBitmap, errorSec = 0): void {
    const tk = file.spec.kind === 'image' ? 0 : timeKey(timeSec)
    const old = file.frames.get(tk)
    // A closer picture replaces a stand-in; a stand-in never replaces a closer one.
    if (old && old.errorSec < errorSec) {
      bitmap.close()
      return
    }
    if (old) this.closeEntry(old)
    const bytes = bitmap.width * bitmap.height * 4
    file.frames.set(tk, { bitmap, bytes, errorSec })
    this.stats.bitmapsOpen++
    this.bytes += bytes
    if (!old) {
      // Sorted insert: the nearest-frame lookup binary-searches this.
      const s = file.sorted
      let lo = 0
      let hi = s.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (s[mid] < tk) lo = mid + 1
        else hi = mid
      }
      s.splice(lo, 0, tk)
    }
    const id = `${file.key}|${tk}`
    this.lru.delete(id)
    this.lru.set(id, true)
    this.evict()
    this.notify(file.key)
  }

  private closeEntry(entry: Entry): void {
    entry.bitmap.close()
    this.stats.bitmapsOpen--
    this.bytes -= entry.bytes
  }

  /** Close the least recently drawn frames nobody is asking for, until under budget. */
  private evict(): void {
    if (this.bytes <= MAX_BYTES) return
    const inUse = new Set<string>()
    for (const { key, times } of this.consumers.values()) for (const t of times) inUse.add(`${key}|${timeKey(t)}`)
    for (const id of this.lru.keys()) {
      if (this.bytes <= MAX_BYTES * 0.8) break
      if (inUse.has(id)) continue
      const cut = id.lastIndexOf('|')
      const file = this.files.get(id.slice(0, cut))
      const tk = Number(id.slice(cut + 1))
      const entry = file?.frames.get(tk)
      this.lru.delete(id)
      if (!file || !entry) continue
      this.closeEntry(entry)
      file.frames.delete(tk)
      file.sorted.splice(file.sorted.indexOf(tk), 1)
    }
  }

  private notify(key: string): void {
    const file = this.files.get(key)
    if (file) file.version++
    this.bump(key)
  }

  private notifyPeaks(entry: PeaksEntry): void {
    entry.version++
    this.bump(this.peaksKey(entry.file))
  }

  private bump(key: string): void {
    this.notifyQueued.add(key)
    // Coalesced to one redraw per animation frame, however many results land in it.
    if (this.notifyFrame !== null) return
    const run = () => {
      this.notifyFrame = null
      const keys = [...this.notifyQueued]
      this.notifyQueued.clear()
      for (const k of keys) for (const cb of this.listeners.get(k) ?? []) cb()
    }
    this.notifyFrame =
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : (setTimeout(run, 16) as unknown as number)
  }

  // ─── The worker ────────────────────────────────────────────────────────────

  private ensureWorker(): Worker | null {
    if (this.worker !== undefined) return this.worker
    try {
      this.worker = new Worker(new URL('./strip.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onWorker(e.data)
      this.worker.onerror = () => {
        // A worker that cannot even start (old browser, CSP) means the fallback for everything.
        this.worker?.terminate()
        this.worker = null
        for (const file of this.files.values()) {
          if (file.job?.path === 'decoder') {
            const times = [...file.job.remaining].map((tk) => tk / 1024)
            const tol = file.job.toleranceSec
            file.job = null
            file.path = 'element'
            if (times.length) this.startFrames(file, times, tol)
          }
        }
      }
    } catch {
      this.worker = null
    }
    return this.worker
  }

  private send(msg: ToWorker): void {
    this.worker?.postMessage(msg)
  }

  private onWorker(msg: FromWorker): void {
    if (msg.type.startsWith('peaks')) {
      this.onPeaks(msg)
      return
    }
    const key = this.jobOwner.get(msg.jobId)
    const file = key ? this.files.get(key) : undefined
    switch (msg.type) {
      case 'frame': {
        // A late frame from a cancelled job is still a good frame — keep it if
        // the file is still on the timeline, close it if not.
        if (!file) {
          msg.bitmap.close()
          return
        }
        file.job?.remaining.delete(timeKey(msg.timeSec))
        this.store(file, msg.timeSec, msg.bitmap, msg.errorSec)
        return
      }
      case 'frames-done':
        if (file?.job?.id === msg.jobId) file.job = null
        this.jobOwner.delete(msg.jobId)
        if (file) this.notify(file.key)
        this.schedulePump()
        return
      case 'frames-fallback':
        this.jobOwner.delete(msg.jobId)
        if (!file || file.job?.id !== msg.jobId) return
        this.stats.fallbacks++
        file.job = null
        file.path = 'element'
        if (msg.remaining.length) this.startFrames(file, msg.remaining, 0)
        this.notify(file.key)
        return
      case 'image-done':
        this.jobOwner.delete(msg.jobId)
        if (!file || file.imageJob !== msg.jobId) {
          msg.bitmap?.close()
          return
        }
        file.imageJob = null
        if (msg.bitmap) {
          file.imageDone = true
          this.store(file, 0, msg.bitmap)
        } else {
          void this.imageOnMainThread(file, msg.jobId)
        }
        return
    }
  }

  private onPeaks(msg: FromWorker): void {
    const file = this.peaksOwner.get(msg.jobId)
    const entry = file ? this.peaksByFile.get(file) : undefined
    if (!entry || entry.jobId !== msg.jobId) return
    switch (msg.type) {
      case 'peaks-meta':
        entry.peaks = {
          rate: msg.rate,
          min: new Float32Array(msg.bins).fill(1),
          max: new Float32Array(msg.bins).fill(-1),
          filled: 0,
        }
        this.notifyPeaks(entry)
        return
      case 'peaks-part':
        if (!entry.peaks) return
        entry.peaks.min.set(msg.min.subarray(0, Math.max(0, entry.peaks.min.length - msg.from)), msg.from)
        entry.peaks.max.set(msg.max.subarray(0, Math.max(0, entry.peaks.max.length - msg.from)), msg.from)
        entry.peaks.filled = Math.max(entry.peaks.filled, Math.min(entry.peaks.min.length, msg.from + msg.min.length))
        this.notifyPeaks(entry)
        return
      case 'peaks-done':
        if (entry.peaks) entry.peaks.filled = entry.peaks.min.length
        entry.state = 'done'
        this.peaksOwner.delete(msg.jobId)
        this.notifyPeaks(entry)
        return
      case 'peaks-none':
        entry.state = 'none'
        this.peaksOwner.delete(msg.jobId)
        this.notifyPeaks(entry)
        return
      case 'peaks-fallback':
        this.stats.fallbacks++
        void this.peaksOnMainThread(entry, msg.adts, msg.durationSec)
        return
    }
  }

  // ─── The fallbacks (main thread) ───────────────────────────────────────────

  /**
   * Thumbnails from a hidden `<video>`: seek, draw, next. Used where WebCodecs
   * is missing (older Safari, Firefox before 130) or cannot decode this codec.
   * The decode itself is still the browser's, off this thread; what runs here
   * is one small `drawImage` per frame, a yield between frames, and nothing at
   * all while the movie plays.
   */
  private runElement(file: FileState, job: FrameJob, times: number[]): void {
    const abort = new AbortController()
    job.abort = abort
    const signal = abort.signal
    // One element at a time, app-wide: each is a decoder of its own.
    this.elementQueue = this.elementQueue.then(async () => {
      if (signal.aborted) return
      const { width, height } = file.spec
      const url = URL.createObjectURL(file.spec.file)
      this.stats.urlsOpen++
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      video.setAttribute('aria-hidden', 'true')
      // In the document (iOS will not load media into a detached element), but
      // nowhere anyone can see or reach it.
      video.style.cssText = 'position:fixed;left:-10px;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
      document.body.appendChild(video)
      video.src = url
      try {
        await once(video, 'loadeddata', 15_000)
        const draw = makeDrawSurface(width, height)
        for (const t of times) {
          if (signal.aborted) return
          while (this.paused && !signal.aborted) await sleep(200)
          if (signal.aborted) return
          const target = Math.max(0, Math.min(t, (video.duration || t) - 0.001))
          if (Math.abs(video.currentTime - target) > 0.0005) {
            video.currentTime = target
            try {
              await once(video, 'seeked', 5_000)
            } catch {
              file.failed.add(timeKey(t))
              continue
            }
          }
          if (signal.aborted) return
          const bitmap = await draw(video)
          if (signal.aborted || !this.files.has(file.key)) {
            bitmap?.close()
            return
          }
          job.remaining.delete(timeKey(t))
          if (bitmap) this.store(file, t, bitmap)
          else file.failed.add(timeKey(t))
          // Give the page its frame back between thumbnails.
          await sleep(0)
        }
      } catch {
        for (const t of times) if (!file.frames.has(timeKey(t))) file.failed.add(timeKey(t))
      } finally {
        video.pause()
        video.removeAttribute('src')
        video.load()
        video.remove()
        URL.revokeObjectURL(url)
        this.stats.urlsOpen--
        if (file.job === job) {
          file.job = null
          this.jobOwner.delete(job.id)
          this.notify(file.key)
          if (!signal.aborted) this.schedulePump()
        }
      }
    })
  }

  private async imageOnMainThread(file: FileState, jobId: number): Promise<void> {
    let bitmap: ImageBitmap | null = null
    try {
      const full = await createImageBitmap(file.spec.file)
      try {
        const draw = makeDrawSurface(file.spec.width, file.spec.height)
        bitmap = await draw(full)
      } finally {
        full.close()
      }
    } catch {
      bitmap = null
    }
    if (!this.files.has(file.key) || (file.imageJob !== null && file.imageJob !== jobId)) {
      bitmap?.close()
      return
    }
    file.imageJob = null
    file.imageDone = true
    if (bitmap) this.store(file, 0, bitmap)
    else this.notify(file.key)
  }

  /**
   * Sound peaks without an `AudioDecoder`: `decodeAudioData` on the ADTS the
   * worker re-wrapped (a few percent of the file), into an 8 kHz offline
   * context so the PCM handed back is small. The folding into peaks happens in
   * the worker. With no ADTS (not AAC) the whole file is tried, below a size.
   */
  private async peaksOnMainThread(entry: PeaksEntry, adts: ArrayBuffer | null, durationSec: number): Promise<void> {
    const fail = () => {
      if (this.peaksByFile.get(entry.file) !== entry) return
      entry.state = 'failed'
      this.cancel(entry.jobId)
      this.peaksOwner.delete(entry.jobId)
      this.notifyPeaks(entry)
    }
    try {
      let bytes = adts
      if (!bytes) {
        if (entry.file.size > WHOLE_FILE_AUDIO_LIMIT) return fail()
        bytes = await entry.file.arrayBuffer()
      }
      const Ctx =
        (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext ??
        (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
      if (!Ctx) return fail()
      let ctx: OfflineAudioContext
      try {
        ctx = new Ctx(1, 1, 8000)
      } catch {
        // Some engines will not make an offline context this slow.
        ctx = new Ctx(1, 1, 44100)
      }
      const audio = await new Promise<AudioBuffer>((resolve, reject) => {
        // The callback form as well as the promise: older WebKit only has the first.
        const p = ctx.decodeAudioData(bytes!, resolve, reject) as Promise<AudioBuffer> | undefined
        p?.then(resolve, reject)
      })
      if (this.peaksByFile.get(entry.file) !== entry) return
      const channels: Float32Array[] = []
      for (let c = 0; c < Math.min(2, audio.numberOfChannels); c++) channels.push(audio.getChannelData(c).slice())
      if (this.worker) {
        const msg: ToWorker = {
          type: 'pcm',
          jobId: entry.jobId,
          channels,
          sampleRate: audio.sampleRate,
          durationSec: durationSec || audio.duration,
        }
        this.worker.postMessage(msg, channels.map((c) => c.buffer))
      } else {
        // No worker at all: fold here. A one-off pass over 8 kHz samples.
        const { rate, bins } = peakBinsFor(durationSec || audio.duration)
        const min = new Float32Array(bins).fill(1)
        const max = new Float32Array(bins).fill(-1)
        accumulatePeaks(min, max, rate, 0, audio.sampleRate, channels)
        entry.peaks = { rate, min, max, filled: bins }
        entry.state = 'done'
        this.notifyPeaks(entry)
      }
    } catch {
      fail()
    }
  }
}

/**
 * A thumbnail-sized surface to draw a frame into and lift an `ImageBitmap`
 * off. `OffscreenCanvas` where there is one; a detached `<canvas>` otherwise.
 */
function makeDrawSurface(width: number, height: number): (src: CanvasImageSource) => Promise<ImageBitmap | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (ctx) {
      return async (src) => {
        try {
          ctx.drawImage(src, 0, 0, width, height)
          return canvas.transferToImageBitmap()
        } catch {
          return null
        }
      }
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  return async (src) => {
    if (!ctx) return null
    try {
      ctx.drawImage(src, 0, 0, width, height)
      return await createImageBitmap(canvas)
    } catch {
      return null
    }
  }
}

/** The one service the app uses. */
export const strips = new StripService()

if (import.meta.env.DEV) {
  // The e2e leak check reads this; it is not part of the app.
  ;(globalThis as { __uvStripStats?: () => unknown }).__uvStripStats = () => ({ ...strips.stats })
}
