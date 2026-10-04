/// <reference lib="webworker" />
import { probeVideoFile, type Sample, type Track } from '@unisim/media'
import { accumulatePeaks, peakBinsFor } from './layout'
import type { FromWorker, ToWorker } from './protocol'
import { SUPPORTED_FORMATS, thumbnailRgba, type RawFormat } from './yuv'

/**
 * The timeline strips' worker: thumbnails through `VideoDecoder`, sound peaks
 * through `AudioDecoder`, both off the main thread.
 *
 * Nothing here holds a decoded frame. Every `VideoFrame` is drawn into a
 * thumbnail-sized `OffscreenCanvas` and closed in the same output callback, and
 * every `AudioData` is folded into min/max bins and closed the same way. That is
 * not tidiness: a hardware H.264 decoder emits into a FIXED pool of picture
 * buffers, and `flush()` cannot resolve while the caller sits on them — the
 * export renderer learned that by hanging. Holding nothing is what makes every
 * `flush()` below safe to await.
 *
 * Frame jobs run one at a time (one decoder, so the player's own `<video>`
 * elements keep theirs), and so do peak jobs; the two queues run side by side.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  scope.postMessage(msg, transfer)
}

const cancelled = new Set<number>()

/** The parsed sample tables, per file, so a second job on a file does not re-read its header. */
const tracksCache = new Map<File, Track[]>()
async function tracksOf(file: File): Promise<Track[]> {
  const hit = tracksCache.get(file)
  if (hit) return hit
  const probe = await probeVideoFile(file)
  tracksCache.set(file, probe.tracks)
  // A handful is plenty — the timeline rarely has more sources than this, and
  // a sample table for an hour of video is megabytes.
  if (tracksCache.size > 6) tracksCache.delete(tracksCache.keys().next().value as File)
  return probe.tracks
}

let videoQueue: Promise<void> = Promise.resolve()
let audioQueue: Promise<void> = Promise.resolve()
/** PCM waiting for a peaks job that handed its decode to the main thread. */
const pcmWaiters = new Map<number, (msg: Extract<ToWorker, { type: 'pcm' }> | null) => void>()

scope.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  switch (msg.type) {
    case 'cancel':
      cancelled.add(msg.jobId)
      // A peaks job parked on the main thread's decode must wake, or the
      // audio queue behind it never moves again.
      pcmWaiters.get(msg.jobId)?.(null)
      pcmWaiters.delete(msg.jobId)
      return
    case 'frames':
      videoQueue = videoQueue.then(() => runFrames(msg)).catch(() => undefined)
      return
    case 'image':
      videoQueue = videoQueue.then(() => runImage(msg)).catch(() => undefined)
      return
    case 'peaks':
      audioQueue = audioQueue.then(() => runPeaks(msg)).catch(() => undefined)
      return
    case 'pcm':
      pcmWaiters.get(msg.jobId)?.(msg)
      pcmWaiters.delete(msg.jobId)
      return
  }
}

// ─── Thumbnails ──────────────────────────────────────────────────────────────

const usOf = (track: Track, ticks: number) => (ticks / track.timescale) * 1_000_000

/** Read the bytes of a decode-order run, in as few `File.slice` reads as the layout allows. */
async function readRun(file: File, run: Sample[]): Promise<Uint8Array[]> {
  const out: Uint8Array[] = new Array(run.length)
  let i = 0
  while (i < run.length) {
    // Samples of one track sit back to back inside a chunk; read each such
    // block once rather than one tiny read per frame. Capped so a long chunk
    // cannot put tens of megabytes in memory at once.
    let j = i
    let end = run[i].offset + run[i].size
    while (j + 1 < run.length && run[j + 1].offset === end && end - run[i].offset < 8 * 1024 * 1024) {
      j++
      end = run[j].offset + run[j].size
    }
    const block = new Uint8Array(await file.slice(run[i].offset, end).arrayBuffer())
    for (let k = i; k <= j; k++) {
      const at = run[k].offset - run[i].offset
      out[k] = block.subarray(at, at + run[k].size)
    }
    i = j + 1
  }
  return out
}

/** A promise that settles after `ms`, so no wait in here can park forever on a codec that went quiet. */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function runFrames(job: Extract<ToWorker, { type: 'frames' }>): Promise<void> {
  const { jobId, file, width, height } = job
  const tolerance = Math.max(0, job.toleranceSec ?? 0)
  let snapping = tolerance > 0
  const pending = [...job.times].sort((a, b) => a - b)
  if (cancelled.has(jobId)) return

  const fallback = (reason: string) => {
    if (!cancelled.has(jobId)) post({ type: 'frames-fallback', jobId, remaining: pending, reason })
  }

  if (job.noDecoder || typeof VideoDecoder === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    fallback('no VideoDecoder')
    return
  }
  let track: Track | undefined
  try {
    track = (await tracksOf(file)).find((t) => t.kind === 'video')
  } catch {
    fallback('unreadable header')
    return
  }
  if (!track || !track.samples.length) {
    fallback('no video track')
    return
  }
  const config: VideoDecoderConfig = {
    codec: track.codec,
    codedWidth: track.width,
    codedHeight: track.height,
    description: track.description ?? undefined,
    optimizeForLatency: true,
  }
  try {
    const support = await VideoDecoder.isConfigSupported(config)
    if (!support.supported) {
      fallback(`${track.codec} not decodable here`)
      return
    }
  } catch {
    fallback('config check failed')
    return
  }

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) {
    fallback('no 2d context')
    return
  }
  // The last thumbnail made, for any time past the final frame (a grid point
  // in the last fraction of a second).
  let lastImage: ImageData | null = null
  let buffer = new Uint8Array(0)

  /**
   * A frame's thumbnail. Copied out of the frame and shrunk in this worker
   * (`yuv.ts` says why not `drawImage`); drawn only for a pixel format the
   * arithmetic does not read.
   */
  const thumbnail = async (frame: VideoFrame): Promise<ImageData | null> => {
    const format = frame.format
    if (format && SUPPORTED_FORMATS.includes(format)) {
      const size = frame.allocationSize()
      if (buffer.length < size) buffer = new Uint8Array(size)
      const planes = await frame.copyTo(buffer)
      const rect = frame.visibleRect ?? { width: frame.codedWidth, height: frame.codedHeight }
      const rgba = thumbnailRgba(
        {
          format: format as RawFormat,
          data: buffer,
          planes,
          width: rect.width,
          height: rect.height,
          matrix: frame.colorSpace?.matrix,
          fullRange: frame.colorSpace?.fullRange,
        },
        width,
        height,
      )
      if (rgba) return new ImageData(rgba, width, height)
    }
    ctx.drawImage(frame, 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height)
  }

  const emit = (image: ImageData, timeSec: number, errorSec: number) => {
    ctx.putImageData(image, 0, 0)
    const bitmap = canvas.transferToImageBitmap()
    post({ type: 'frame', jobId, timeSec, errorSec, bitmap }, [bitmap])
  }

  // Conversions run one after another, so the copy buffer is shared, and each
  // frame is closed the moment its pixels are out — it never waits on the
  // decoder, so holding it for the copy cannot wedge one (see the header).
  let converting: Promise<void> = Promise.resolve()
  const send = (frame: VideoFrame, answers: { timeSec: number; errorSec: number }[]) => {
    const copy = frame.clone()
    converting = converting.then(async () => {
      try {
        if (cancelled.has(jobId)) return
        const image = await thumbnail(copy)
        copy.close()
        if (!image || cancelled.has(jobId)) return
        lastImage = image
        for (const a of answers) emit(image, a.timeSec, a.errorSec)
      } catch {
        // One frame that would not copy leaves its slot to the placeholder.
      } finally {
        copy.close()
      }
    })
  }

  let failure: string | null = null
  /** Set while a lone keyframe is being decoded on behalf of these times (see below). */
  let answering: number[] | null = null
  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        if (cancelled.has(jobId)) return
        if (answering) {
          const at = frame.timestamp / 1_000_000
          send(frame, answering.map((timeSec) => ({ timeSec, errorSec: Math.abs(at - timeSec) })))
          answering = null
        } else {
          const startSec = frame.timestamp / 1_000_000
          const durSec = (frame.duration ?? 1_000_000 / 30) / 1_000_000
          // Every pending time this frame is on screen for — or that no
          // earlier frame answered — is answered by it.
          const answers: { timeSec: number; errorSec: number }[] = []
          while (pending.length && pending[0] < startSec + durSec - 1e-6) answers.push({ timeSec: pending.shift()!, errorSec: 0 })
          if (answers.length) send(frame, answers)
        }
      } finally {
        // ⚠️ Closed here, always, before anything else can happen. See the
        // header: a frame held across a flush is how a decoder wedges.
        frame.close()
      }
    },
    error: (err) => {
      failure = err.message || 'decoder error'
    },
  })

  const samples = track.samples
  const tr = track
  // Keyframes in decode order, with their presentation times, for a binary search.
  const syncs: number[] = []
  for (let i = 0; i < samples.length; i++) if (samples[i].sync) syncs.push(i)
  if (!syncs.length || syncs[0] !== 0) syncs.unshift(0)
  const syncUs = syncs.map((i) => usOf(tr, samples[i].pts))
  /** Position in `syncs` of the last keyframe presenting at or before `us`. */
  const syncAt = (us: number): number => {
    let lo = 0
    let hi = syncs.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (syncUs[mid] <= us) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  const frameUs = usOf(tr, tr.duration) / Math.max(1, samples.length)

  /** Wait for the decoder to drain — it holds nothing of ours, so this always can. */
  const drain = async () => {
    const flushed = decoder.flush().then(
      () => true,
      () => false,
    )
    // A dead decoder resolves nothing: give up after ten seconds of silence.
    const ok = await Promise.race([flushed, sleep(10_000).then(() => false)])
    if (!ok && !failure) failure = 'decoder stalled'
  }

  try {
    decoder.configure(config)
    while (pending.length && !failure) {
      if (cancelled.has(jobId)) return
      const target = pending[0]
      const s = syncAt(target * 1_000_000)

      // Zoomed out, a slot spans seconds, and the keyframe nearest its time is
      // as good a picture of it as the exact frame — at the cost of ONE decode
      // instead of up to a whole GOP. Every pending time that keyframe is
      // close enough to is answered by it.
      const near = [s, s + 1]
        .filter((j) => j < syncs.length)
        .sort((a, b) => Math.abs(syncUs[a] - target * 1_000_000) - Math.abs(syncUs[b] - target * 1_000_000))[0]
      if (snapping && Math.abs(syncUs[near] - target * 1_000_000) <= tolerance * 1_000_000) {
        const times: number[] = []
        while (pending.length && Math.abs(syncUs[near] - pending[0] * 1_000_000) <= tolerance * 1_000_000) times.push(pending.shift()!)
        const key = samples[syncs[near]]
        const [data] = await readRun(file, [key])
        if (cancelled.has(jobId)) return
        answering = times
        decoder.decode(
          new EncodedVideoChunk({
            type: 'key',
            timestamp: Math.round(usOf(tr, key.pts)),
            duration: Math.round(usOf(tr, key.duration)),
            data,
          }),
        )
        await drain()
        // A keyframe that produced no picture: answer from the full run instead.
        if (answering) {
          pending.unshift(...(answering as number[]))
          answering = null
          snapping = false
          if (failure) break
        } else continue
      }

      const k = syncs[s]
      // The GOP ends at the first keyframe presenting after the target.
      let n = s + 1
      while (n < syncs.length && syncUs[n] <= target * 1_000_000 + frameUs) n++
      const nextSync = n < syncs.length ? syncs[n] : samples.length
      const gopEndUs = n < syncs.length ? syncUs[n] : Infinity
      // Every pending time inside this GOP is answered by the same run.
      let runEndUs = target * 1_000_000 + frameUs * 1.5
      for (const t of pending) {
        if (t * 1_000_000 >= gopEndUs) break
        runEndUs = Math.max(runEndUs, t * 1_000_000 + frameUs * 1.5)
      }
      // In DECODE order and contiguous from the keyframe: a B-frame needs
      // anchors that present after it (the rule `samplesForWindow` in
      // @unisim/media spells out), so the run cannot be filtered by time.
      let lastIdx = k
      for (let i = k; i < nextSync; i++) if (usOf(tr, samples[i].pts) < runEndUs) lastIdx = i
      const run = samples.slice(k, lastIdx + 1)
      const bytes = await readRun(file, run)
      for (let i = 0; i < run.length; i++) {
        if (cancelled.has(jobId) || failure) break
        // Back-pressure: let the decoder catch up rather than queueing a GOP
        // of 4K frames at once. Polled rather than parked on `dequeue`, so a
        // codec that dies mid-wait cannot strand this loop.
        while (decoder.decodeQueueSize > 8 && !failure && !cancelled.has(jobId)) await sleep(4)
        decoder.decode(
          new EncodedVideoChunk({
            type: i === 0 || run[i].sync ? 'key' : 'delta',
            timestamp: Math.round(usOf(tr, run[i].pts)),
            duration: Math.round(usOf(tr, run[i].duration)),
            data: bytes[i],
          }),
        )
      }
      if (cancelled.has(jobId)) return
      // Drain per GOP: the frames this run's times are waiting on may still be
      // in the decoder's reorder queue, and the next run starts at a keyframe.
      await drain()
      // Still unanswered after its whole run — a time past the last frame.
      if (pending.length && pending[0] === target) break
    }
  } catch (err) {
    failure = err instanceof Error ? err.message : 'decode failed'
  } finally {
    if (decoder.state !== 'closed') decoder.close()
  }

  await converting
  if (cancelled.has(jobId)) return
  if (failure && pending.length) {
    fallback(failure)
    return
  }
  // Times past the last frame: the last picture there is.
  if (lastImage) {
    for (const timeSec of pending.splice(0)) emit(lastImage, timeSec, 0)
  } else if (pending.length) {
    fallback('no frames decoded')
    return
  }
  post({ type: 'frames-done', jobId })
}

async function runImage(job: Extract<ToWorker, { type: 'image' }>): Promise<void> {
  const { jobId, file, width, height } = job
  if (cancelled.has(jobId)) return
  let bitmap: ImageBitmap | null = null
  try {
    const full = await createImageBitmap(file)
    try {
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(full, 0, 0, width, height)
        bitmap = canvas.transferToImageBitmap()
      }
    } finally {
      full.close()
    }
  } catch {
    bitmap = null
  }
  if (cancelled.has(jobId)) {
    bitmap?.close()
    return
  }
  post({ type: 'image-done', jobId, bitmap }, bitmap ? [bitmap] : [])
}

// ─── Peaks ───────────────────────────────────────────────────────────────────

/** Re-wrap AAC access units as ADTS, which every browser's `decodeAudioData` reads. */
function adtsOf(track: Track, payloads: Uint8Array[]): ArrayBuffer | null {
  const asc = track.description
  if (!asc || asc.length < 2 || !track.codec.startsWith('mp4a.40')) return null
  const objectType = asc[0] >> 3
  const freqIndex = ((asc[0] & 0x07) << 1) | (asc[1] >> 7)
  const channelConfig = (asc[1] >> 3) & 0x0f
  // ADTS carries profiles 1–4 only; HE-AAC's core is AAC-LC, which decodes.
  const profile = Math.min(3, Math.max(0, (objectType === 5 || objectType === 29 ? 2 : objectType) - 1))
  if (freqIndex > 12) return null
  const total = payloads.reduce((n, p) => n + p.length + 7, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const p of payloads) {
    const len = p.length + 7
    out[at] = 0xff
    out[at + 1] = 0xf1
    out[at + 2] = (profile << 6) | (freqIndex << 2) | ((channelConfig >> 2) & 0x1)
    out[at + 3] = ((channelConfig & 0x3) << 6) | ((len >> 11) & 0x3)
    out[at + 4] = (len >> 3) & 0xff
    out[at + 5] = ((len & 0x7) << 5) | 0x1f
    out[at + 6] = 0xfc
    out.set(p, at + 7)
    at += len
  }
  return out.buffer
}

async function runPeaks(job: Extract<ToWorker, { type: 'peaks' }>): Promise<void> {
  const { jobId, file } = job
  if (cancelled.has(jobId)) return
  let track: Track | undefined
  try {
    track = (await tracksOf(file)).find((t) => t.kind === 'audio')
  } catch {
    post({ type: 'peaks-fallback', jobId, adts: null, durationSec: 0, reason: 'unreadable header' })
    return
  }
  if (!track || !track.samples.length) {
    post({ type: 'peaks-none', jobId })
    return
  }
  const durationSec = track.duration / track.timescale
  const { rate, bins } = peakBinsFor(durationSec)
  const min = new Float32Array(bins).fill(1)
  const max = new Float32Array(bins).fill(-1)

  /** Send what has changed since the last post — progressive, a few times a second. */
  let sentTo = 0
  let lastPost = 0
  const flushOut = (to: number, force = false) => {
    const now = performance.now()
    if (to <= sentTo || (!force && now - lastPost < 120)) return
    const partMin = min.slice(sentTo, to)
    const partMax = max.slice(sentTo, to)
    post({ type: 'peaks-part', jobId, from: sentTo, min: partMin, max: partMax }, [partMin.buffer, partMax.buffer])
    sentTo = to
    lastPost = now
  }

  const config: AudioDecoderConfig = {
    codec: track.codec,
    sampleRate: track.sampleRate,
    numberOfChannels: track.channels,
    description: track.description ?? undefined,
  }
  let decodable = !job.noDecoder && typeof AudioDecoder !== 'undefined'
  if (decodable) {
    try {
      decodable = (await AudioDecoder.isConfigSupported(config)).supported === true
    } catch {
      decodable = false
    }
  }

  // The ADTS bytes are only needed for the fallback, but they are read in the
  // same pass, so collect them only when there is going to be a fallback.
  const reader = async (onRun: (run: Sample[], bytes: Uint8Array[]) => Promise<void> | void) => {
    const samples = track!.samples
    for (let i = 0; i < samples.length && !cancelled.has(jobId); ) {
      // Audio samples sit in contiguous chunks between video chunks: one read per chunk.
      let j = i
      while (j + 1 < samples.length && samples[j + 1].offset === samples[j].offset + samples[j].size && j - i < 2048) j++
      const run = samples.slice(i, j + 1)
      await onRun(run, await readRun(file, run))
      i = j + 1
    }
  }

  if (!decodable) {
    const payloads: Uint8Array[] = []
    await reader((_run, bytes) => {
      // Copied: `bytes` are views into a block that is otherwise let go.
      for (const b of bytes) payloads.push(b.slice())
    })
    if (cancelled.has(jobId)) return
    const adts = adtsOf(track, payloads)
    payloads.length = 0
    post(
      { type: 'peaks-fallback', jobId, adts, durationSec, reason: 'no AudioDecoder for this track' },
      adts ? [adts] : [],
    )
    // The main thread decodes and sends the PCM back to be folded here.
    const pcm = await new Promise<Extract<ToWorker, { type: 'pcm' }> | null>((resolve) => {
      // If the main thread cannot decode it either, it cancels this job,
      // which resolves this with null.
      pcmWaiters.set(jobId, resolve)
    })
    if (!pcm || cancelled.has(jobId)) return
    const pcmRate = peakBinsFor(pcm.durationSec || durationSec)
    const pmin = new Float32Array(pcmRate.bins).fill(1)
    const pmax = new Float32Array(pcmRate.bins).fill(-1)
    post({ type: 'peaks-meta', jobId, rate: pcmRate.rate, bins: pcmRate.bins })
    accumulatePeaks(pmin, pmax, pcmRate.rate, 0, pcm.sampleRate, pcm.channels)
    post({ type: 'peaks-part', jobId, from: 0, min: pmin, max: pmax }, [pmin.buffer, pmax.buffer])
    post({ type: 'peaks-done', jobId })
    return
  }

  post({ type: 'peaks-meta', jobId, rate, bins })
  let reached = 0
  let failure: string | null = null
  const decoder = new AudioDecoder({
    output: (data) => {
      try {
        if (cancelled.has(jobId)) return
        const channels: Float32Array[] = []
        const n = Math.min(2, data.numberOfChannels)
        for (let c = 0; c < n; c++) {
          const plane = new Float32Array(data.numberOfFrames)
          data.copyTo(plane, { planeIndex: c, format: 'f32-planar' })
          channels.push(plane)
        }
        const { to } = accumulatePeaks(min, max, rate, data.timestamp / 1_000_000, data.sampleRate, channels)
        if (to > reached) reached = to
      } finally {
        data.close()
      }
    },
    error: (err) => {
      failure = err.message || 'audio decoder error'
    },
  })
  try {
    decoder.configure(config)
    await reader(async (run, bytes) => {
      for (let i = 0; i < run.length && !failure; i++) {
        while (decoder.decodeQueueSize > 32 && !failure && !cancelled.has(jobId)) await sleep(2)
        decoder.decode(
          new EncodedAudioChunk({
            type: 'key',
            timestamp: Math.round(usOf(track!, run[i].pts)),
            duration: Math.round(usOf(track!, run[i].duration)),
            data: bytes[i],
          }),
        )
      }
      // Bins behind the furthest one decoded are complete — post them.
      flushOut(Math.max(0, reached - 1))
    })
    if (!cancelled.has(jobId) && !failure) {
      await Promise.race([decoder.flush().catch(() => undefined), sleep(10_000)])
    }
  } catch (err) {
    failure = err instanceof Error ? err.message : 'audio decode failed'
  } finally {
    if (decoder.state !== 'closed') decoder.close()
  }
  if (cancelled.has(jobId)) return
  flushOut(bins, true)
  post({ type: 'peaks-done', jobId })
}
