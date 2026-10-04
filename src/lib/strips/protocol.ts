/**
 * The messages between the strip service (main thread) and its worker.
 *
 * Kept in one file so both ends are type-checked against the same shapes — a
 * worker protocol drifting out of step fails silently, as a strip that simply
 * never fills in.
 */

export type ToWorker =
  | {
      type: 'frames'
      jobId: number
      file: File
      /** Grid times, ascending, in source seconds. */
      times: number[]
      width: number
      height: number
      /**
       * How far from a time a keyframe may be and still stand for it. Half the
       * grid step: zoomed out that is seconds, and one decode per slot
       * replaces a GOP's worth; zoomed in it is a frame or two, and every slot
       * gets its exact frame.
       */
      toleranceSec?: number
      /** Skip WebCodecs and go straight to the fallback — how the fallback is tested in Chromium. */
      noDecoder?: boolean
    }
  | { type: 'image'; jobId: number; file: File; width: number; height: number }
  | { type: 'peaks'; jobId: number; file: File; noDecoder?: boolean }
  /** PCM decoded on the main thread (the fallback), for the worker to fold into peaks. */
  | { type: 'pcm'; jobId: number; channels: Float32Array[]; sampleRate: number; durationSec: number }
  | { type: 'cancel'; jobId: number }

export type FromWorker =
  /**
   * `errorSec` is how far the picture is from `timeSec`: 0 when it is the
   * frame on screen at that time, more when a nearby keyframe stood in for it.
   */
  | { type: 'frame'; jobId: number; timeSec: number; errorSec: number; bitmap: ImageBitmap }
  | { type: 'frames-done'; jobId: number }
  /**
   * WebCodecs could not do this file (no VideoDecoder, an unsupported codec, a
   * decoder that died). `remaining` are the times still owed — the main thread
   * takes them over with a `<video>` element.
   */
  | { type: 'frames-fallback'; jobId: number; remaining: number[]; reason: string }
  | { type: 'image-done'; jobId: number; bitmap: ImageBitmap | null }
  | { type: 'peaks-meta'; jobId: number; rate: number; bins: number }
  | { type: 'peaks-part'; jobId: number; from: number; min: Float32Array; max: Float32Array }
  | { type: 'peaks-done'; jobId: number }
  /** The file has no sound. */
  | { type: 'peaks-none'; jobId: number }
  /**
   * No AudioDecoder for this track. `adts` is the AAC re-wrapped as an ADTS
   * stream — a few percent of the file — for the main thread to hand to
   * `decodeAudioData`; null when the codec isn't AAC and only the whole file
   * will do.
   */
  | { type: 'peaks-fallback'; jobId: number; adts: ArrayBuffer | null; durationSec: number; reason: string }
