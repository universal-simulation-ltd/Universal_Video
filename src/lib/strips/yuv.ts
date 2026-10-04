/**
 * A decoded frame's raw planes, shrunk to a thumbnail and turned into RGBA — on
 * the CPU, in the worker.
 *
 * Why not just `drawImage(frame)` onto an `OffscreenCanvas`? Because in WebKit
 * that draw is not the worker's alone: measured in Playwright WebKit with a
 * 60 s 1080p clip, drawing each decoded `VideoFrame` into a worker canvas put
 * the MAIN thread's worst frame gap at 0.5–2.5 s (none over 50 ms with the
 * draw taken out), and `createImageBitmap(frame, { resize… })` was no better
 * during playback. `VideoFrame.copyTo()` into a buffer, and the arithmetic
 * below, touch nothing but the worker — worst gap 38–43 ms, the same as with
 * no strips at all. Chromium is happy either way; one path for both keeps the
 * colour maths under test in both.
 *
 * Point-sampled luma averaged over a 2×2 neighbourhood, chroma at the nearest
 * sample: a 60×34 thumbnail of a 1920×1080 frame reads 4 of every ~1,000
 * source pixels, which is the whole reason this is cheap.
 */

export type RawFormat = 'I420' | 'I420A' | 'I422' | 'I444' | 'NV12' | 'RGBA' | 'RGBX' | 'BGRA' | 'BGRX'

export interface Plane {
  offset: number
  stride: number
}

export interface RawFrame {
  format: RawFormat
  data: Uint8Array
  planes: Plane[]
  width: number
  height: number
  /** `VideoColorSpace.matrix`: 'bt709' uses Rec. 709 weights, anything else Rec. 601. */
  matrix?: string | null
  fullRange?: boolean | null
}

export const SUPPORTED_FORMATS: readonly string[] = ['I420', 'I420A', 'I422', 'I444', 'NV12', 'RGBA', 'RGBX', 'BGRA', 'BGRX']

/** Shrink `src` to `outW × outH` RGBA. Returns null for a format this does not read. */
export function thumbnailRgba(src: RawFrame, outW: number, outH: number): Uint8ClampedArray<ArrayBuffer> | null {
  if (!SUPPORTED_FORMATS.includes(src.format)) return null
  const { data, planes, width: w, height: h } = src
  const out = new Uint8ClampedArray(outW * outH * 4)
  const sx = w / outW
  const sy = h / outH
  // Offsets inside a source block for the 2×2 luma average, clamped to the frame.
  const dx = Math.max(0, Math.floor(sx / 4))
  const dy = Math.max(0, Math.floor(sy / 4))

  if (src.format.startsWith('RGB') || src.format.startsWith('BGR')) {
    const bgr = src.format.startsWith('BGR')
    const { offset, stride } = planes[0]
    for (let oy = 0; oy < outH; oy++) {
      const y = Math.min(h - 1, Math.floor((oy + 0.5) * sy))
      for (let ox = 0; ox < outW; ox++) {
        const x = Math.min(w - 1, Math.floor((ox + 0.5) * sx))
        const i = offset + y * stride + x * 4
        const o = (oy * outW + ox) * 4
        out[o] = data[bgr ? i + 2 : i]
        out[o + 1] = data[i + 1]
        out[o + 2] = data[bgr ? i : i + 2]
        out[o + 3] = 255
      }
    }
    return out
  }

  const bt709 = src.matrix === 'bt709'
  const full = src.fullRange === true
  // Y′CbCr → R′G′B′, per range and matrix.
  const ky = full ? 1 : 255 / 219
  const y0 = full ? 0 : 16
  const kc = full ? 1 : 255 / 224
  const [rv, gu, gv, bu] = bt709 ? [1.5748, -0.1873, -0.4681, 1.8556] : [1.402, -0.344136, -0.714136, 1.772]

  const nv12 = src.format === 'NV12'
  const halfX = src.format !== 'I444'
  const halfY = src.format === 'I420' || src.format === 'I420A' || nv12
  const Y = planes[0]
  const U = planes[1]
  const V = nv12 ? planes[1] : planes[2]

  for (let oy = 0; oy < outH; oy++) {
    const y = Math.min(h - 1, Math.floor((oy + 0.5) * sy))
    const yA = Math.max(0, y - dy)
    const yB = Math.min(h - 1, y + dy)
    const cy = halfY ? y >> 1 : y
    for (let ox = 0; ox < outW; ox++) {
      const x = Math.min(w - 1, Math.floor((ox + 0.5) * sx))
      const xA = Math.max(0, x - dx)
      const xB = Math.min(w - 1, x + dx)
      const luma =
        (data[Y.offset + yA * Y.stride + xA] +
          data[Y.offset + yA * Y.stride + xB] +
          data[Y.offset + yB * Y.stride + xA] +
          data[Y.offset + yB * Y.stride + xB]) /
        4
      const cx = halfX ? x >> 1 : x
      let cb: number
      let cr: number
      if (nv12) {
        const i = U.offset + cy * U.stride + cx * 2
        cb = data[i]
        cr = data[i + 1]
      } else {
        cb = data[U.offset + cy * U.stride + cx]
        cr = data[V.offset + cy * V.stride + cx]
      }
      const L = (luma - y0) * ky
      const Cb = (cb - 128) * kc
      const Cr = (cr - 128) * kc
      const o = (oy * outW + ox) * 4
      out[o] = L + rv * Cr
      out[o + 1] = L + gu * Cb + gv * Cr
      out[o + 2] = L + bu * Cb
      out[o + 3] = 255
    }
  }
  return out
}
