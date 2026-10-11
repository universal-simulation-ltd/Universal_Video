import { ascii, box, u16, u32, u32s, u8 } from '@unisim/media'
import { describe, expect, it } from 'vitest'
import { containBox, placeRotated, readRotation, rotationFromMatrix, type Rotation } from './rotation'

// A header shaped like a phone's: an audio track first (so "the first track"
// is not the video one), then a video track whose tkhd matrix carries the turn.
// The real thing — an ffmpeg file with a 90° display matrix — goes through the
// app in e2e/strips.e2e.ts (`fixtures/rotated-90-320x180.mp4`).
const ONE = 0x10000
const MATRICES: Record<Rotation, number[]> = {
  0: [ONE, 0, 0, 0, ONE, 0, 0, 0, 0x40000000],
  90: [0, ONE, 0, -ONE >>> 0, 0, 0, 0, 0, 0x40000000],
  180: [-ONE >>> 0, 0, 0, 0, -ONE >>> 0, 0, 0, 0, 0x40000000],
  270: [0, -ONE >>> 0, 0, ONE, 0, 0, 0, 0, 0x40000000],
}
function trak(id: number, handler: string, matrix: number[], version = 0): Uint8Array {
  const times = version === 1 ? [u32(0), u32(0), u32(0), u32(0)] : [u32(0), u32(0)]
  const duration = version === 1 ? [u32(0), u32(0)] : [u32(0)]
  const tkhd = box('tkhd', u8(version, 0, 0, 7), ...times, u32(id), u32(0), ...duration, u32s([0, 0]), u16(0), u16(0), u16(0), u16(0), u32s(matrix), u32(1920 * ONE), u32(1080 * ONE))
  const hdlr = box('hdlr', u8(0, 0, 0, 0), u32(0), ascii(handler), u32s([0, 0, 0]), u8(0))
  return box('trak', tkhd, box('mdia', hdlr))
}
function mp4(rotation: Rotation, { moovLast = false, version = 0 } = {}): Blob {
  const moov = box('moov', trak(1, 'soun', MATRICES[0]), trak(2, 'vide', MATRICES[rotation], version))
  const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isom'))
  const mdat = box('mdat', new Uint8Array(1000))
  const parts = moovLast ? [ftyp, mdat, moov] : [ftyp, moov, mdat]
  return new Blob(parts.map((p) => p.slice().buffer))
}

describe('rotationFromMatrix', () => {
  it('reads the quarter turns, clockwise', () => {
    const one = 0x10000
    expect(rotationFromMatrix(one, 0)).toBe(0)
    expect(rotationFromMatrix(0, one)).toBe(90) // an upright iPhone
    expect(rotationFromMatrix(-one, 0)).toBe(180)
    expect(rotationFromMatrix(0, -one)).toBe(270)
  })
  it('treats an empty matrix as no turn', () => {
    expect(rotationFromMatrix(0, 0)).toBe(0)
  })
})

describe('readRotation', () => {
  it('finds every quarter turn on the video track', async () => {
    for (const r of [0, 90, 180, 270] as Rotation[]) expect(await readRotation(mp4(r))).toBe(r)
  })
  it('finds it with the moov at the END of the file, and in a version-1 tkhd', async () => {
    expect(await readRotation(mp4(90, { moovLast: true }))).toBe(90)
    expect(await readRotation(mp4(270, { version: 1 }))).toBe(270)
  })
  it('picks the track asked for by id', async () => {
    expect(await readRotation(mp4(90), 2)).toBe(90)
    expect(await readRotation(mp4(90), 1)).toBe(0)
  })
  it('says 0 for something that is not an MP4', async () => {
    expect(await readRotation(new Blob([new Uint8Array([1, 2, 3])]))).toBe(0)
    expect(await readRotation(new Blob([]))).toBe(0)
    expect(await readRotation(new Blob([new Uint8Array([0, 0, 0, 4, 0x66, 0x72, 0x65, 0x65])]))).toBe(0)
  })
})

describe('containBox', () => {
  it('pillarboxes a portrait picture in a landscape thumbnail', () => {
    expect(containBox(180, 320, 64, 36)).toEqual({ x: 22, y: 0, width: 20, height: 36 })
  })
  it('fills the box when the shapes match', () => {
    expect(containBox(320, 180, 64, 36)).toEqual({ x: 0, y: 0, width: 64, height: 36 })
  })
})

describe('placeRotated', () => {
  // A 3×2 coded picture, pixel values 1..6 in the red channel:
  //   1 2 3
  //   4 5 6
  const src = new Uint8ClampedArray(3 * 2 * 4)
  for (let i = 0; i < 6; i++) src[i * 4] = i + 1
  const reds = (r: Rotation, w: number, h: number) => {
    const out = placeRotated(src, 3, 2, r, w, h, { x: 0, y: 0 })
    const rows: number[][] = []
    for (let y = 0; y < h; y++) rows.push(Array.from({ length: w }, (_, x) => out[(y * w + x) * 4]))
    return rows
  }
  it('turns a quarter clockwise', () => {
    expect(reds(90, 2, 3)).toEqual([
      [4, 1],
      [5, 2],
      [6, 3],
    ])
  })
  it('turns a half', () => {
    expect(reds(180, 3, 2)).toEqual([
      [6, 5, 4],
      [3, 2, 1],
    ])
  })
  it('turns three quarters clockwise', () => {
    expect(reds(270, 2, 3)).toEqual([
      [3, 6],
      [2, 5],
      [1, 4],
    ])
  })
  it('leaves the bars opaque black', () => {
    const out = placeRotated(src, 3, 2, 90, 4, 3, { x: 1, y: 0 })
    expect([out[0], out[1], out[2], out[3]]).toEqual([0, 0, 0, 255])
    expect(out[(0 * 4 + 1) * 4]).toBe(4)
  })
})
