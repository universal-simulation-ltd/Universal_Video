import { describe, expect, it } from 'vitest'
import { thumbnailRgba } from './yuv'

/** A solid I420 or NV12 frame of one Y′CbCr colour. */
function solid(format: 'I420' | 'NV12', w: number, h: number, y: number, cb: number, cr: number) {
  const cw = w / 2
  const ch = h / 2
  const data = new Uint8Array(w * h + cw * ch * 2)
  data.fill(y, 0, w * h)
  if (format === 'I420') {
    data.fill(cb, w * h, w * h + cw * ch)
    data.fill(cr, w * h + cw * ch)
    return { format, data, width: w, height: h, planes: [{ offset: 0, stride: w }, { offset: w * h, stride: cw }, { offset: w * h + cw * ch, stride: cw }] }
  }
  for (let i = w * h; i < data.length; i += 2) {
    data[i] = cb
    data[i + 1] = cr
  }
  return { format, data, width: w, height: h, planes: [{ offset: 0, stride: w }, { offset: w * h, stride: w }] }
}

const px = (rgba: Uint8ClampedArray, i = 0) => [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], rgba[i * 4 + 3]]

describe('thumbnailRgba', () => {
  it('turns limited-range Rec. 601 red, green and blue back into themselves', () => {
    const near = (got: number[], want: number[]) => got.slice(0, 3).forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThan(6))
    near(px(thumbnailRgba(solid('I420', 64, 36, 81, 90, 240), 8, 4)!), [255, 0, 0])
    near(px(thumbnailRgba(solid('I420', 64, 36, 145, 54, 34), 8, 4)!), [0, 255, 0])
    near(px(thumbnailRgba(solid('NV12', 64, 36, 41, 240, 110), 8, 4)!), [0, 0, 255])
  })

  it('uses the Rec. 709 matrix when the frame says so', () => {
    // Rec. 709 limited-range red is Y′ 63, Cb 102, Cr 240.
    const frame = { ...solid('I420', 32, 18, 63, 102, 240), matrix: 'bt709' }
    const [r, g, b] = px(thumbnailRgba(frame, 4, 2)!)
    expect(r).toBeGreaterThan(245)
    expect(g).toBeLessThan(10)
    expect(b).toBeLessThan(10)
  })

  it('reads BGRA as well, and is opaque', () => {
    const data = new Uint8Array(4 * 4 * 4)
    for (let i = 0; i < data.length; i += 4) data.set([10, 20, 200, 255], i) // B G R A
    const out = thumbnailRgba({ format: 'BGRA', data, width: 4, height: 4, planes: [{ offset: 0, stride: 16 }] }, 2, 2)!
    expect(px(out)).toEqual([200, 20, 10, 255])
  })

  it('declines a format it does not read, so the caller can draw instead', () => {
    // @ts-expect-error — a 10-bit format, deliberately outside the union
    expect(thumbnailRgba({ format: 'I420P10', data: new Uint8Array(8), width: 2, height: 2, planes: [] }, 1, 1)).toBeNull()
  })
})
