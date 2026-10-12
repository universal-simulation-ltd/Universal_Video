/**
 * Which way up a video is meant to be shown — read from its MP4 header.
 *
 * A phone held upright records LANDSCAPE pictures and says "turn this a
 * quarter turn" in the video track's display matrix (`tkhd`), rather than
 * turning every frame. A `<video>` element honours that matrix; a frame out of
 * `VideoDecoder` does not — it is the picture as coded, on its side. So the
 * timeline's thumbnails, which decode with WebCodecs, have to read the matrix
 * themselves and turn the picture (2026-10-11).
 *
 * `@unisim/media`'s reader keeps the track's width and height but drops the
 * matrix, so it is read here: one walk over the top-level boxes to find
 * `moov`, then its tracks.
 */

export type Rotation = 0 | 90 | 180 | 270

/**
 * Clockwise quarter turns from a display matrix's `a` and `b` (any
 * consistent scale — 16.16 fixed point or plain numbers). A point (x, y) of
 * the coded picture lands at (a·x + c·y, b·x + d·y) with y pointing DOWN, so
 * `a = 0, b = 1, c = −1, d = 0` — what an upright iPhone writes, and ffmpeg for
 * a 90° rotation — turns the picture 90° clockwise. Anything that is not a
 * quarter turn (a skew, a mirror's odd angle) rounds to the nearest one.
 */
export function rotationFromMatrix(a: number, b: number): Rotation {
  if (!Number.isFinite(a) || !Number.isFinite(b) || (a === 0 && b === 0)) return 0
  const deg = (Math.atan2(b, a) * 180) / Math.PI
  const quarter = ((Math.round(deg / 90) % 4) + 4) % 4
  return (quarter * 90) as Rotation
}

export interface Box {
  type: string
  /** Where the box's body starts (after the size/type header). */
  body: number
  /** One past its last byte. */
  end: number
}

/** The child boxes laid out between `from` and `to`. */
export function boxesIn(view: DataView, from: number, to: number): Box[] {
  const out: Box[] = []
  let at = from
  while (at + 8 <= to) {
    let size = view.getUint32(at)
    const type = String.fromCharCode(view.getUint8(at + 4), view.getUint8(at + 5), view.getUint8(at + 6), view.getUint8(at + 7))
    let header = 8
    if (size === 1) {
      if (at + 16 > to) break
      size = view.getUint32(at + 8) * 2 ** 32 + view.getUint32(at + 12)
      header = 16
    } else if (size === 0) {
      size = to - at
    }
    if (size < header || at + size > to) break
    out.push({ type, body: at + header, end: at + size })
    at += size
  }
  return out
}

/**
 * The rotation of a track in a `moov` box's BODY (the bytes after its own
 * header). `trackId` picks the track; without one, or when no track has that
 * id, it is the first video track.
 */
export function rotationInMoov(moov: Uint8Array, trackId?: number): Rotation {
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength)
  let firstVideo: Rotation | null = null
  for (const trak of boxesIn(view, 0, moov.byteLength)) {
    if (trak.type !== 'trak') continue
    const kids = boxesIn(view, trak.body, trak.end)
    const tkhd = kids.find((k) => k.type === 'tkhd')
    // The matrix sits 44 bytes from the end of tkhd in both versions: nine
    // 32-bit numbers, then the 16.16 width and height.
    if (!tkhd || tkhd.end - tkhd.body < 44 + 4) continue
    const version = view.getUint8(tkhd.body)
    const id = version === 1 ? view.getUint32(tkhd.body + 20) : view.getUint32(tkhd.body + 12)
    const m = tkhd.end - 44
    const rotation = rotationFromMatrix(view.getInt32(m), view.getInt32(m + 4))
    if (trackId !== undefined && id === trackId) return rotation
    if (firstVideo === null) {
      const mdia = kids.find((k) => k.type === 'mdia')
      const hdlr = mdia && boxesIn(view, mdia.body, mdia.end).find((k) => k.type === 'hdlr')
      if (hdlr && hdlr.end - hdlr.body >= 12) {
        const handler = String.fromCharCode(...moov.subarray(hdlr.body + 8, hdlr.body + 12))
        if (handler === 'vide') firstVideo = rotation
      }
    }
  }
  return firstVideo ?? 0
}

/** A `moov` past this is not read — the thumbnails stay as coded rather than load it. */
const MOOV_CAP = 64 * 1024 * 1024

/**
 * The display rotation of a video file's video track (0 when there is none, or
 * the header cannot be read). Reads the top-level box headers and then the
 * `moov` alone, wherever it is in the file.
 */
export async function readRotation(file: Blob, trackId?: number): Promise<Rotation> {
  let at = 0
  while (at + 8 <= file.size) {
    const head = new DataView(await file.slice(at, at + 16).arrayBuffer())
    if (head.byteLength < 8) return 0
    let size = head.getUint32(0)
    const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7))
    let header = 8
    if (size === 1) {
      if (head.byteLength < 16) return 0
      size = head.getUint32(8) * 2 ** 32 + head.getUint32(12)
      header = 16
    } else if (size === 0) {
      size = file.size - at
    }
    if (size < header) return 0
    if (type === 'moov') {
      if (size - header > MOOV_CAP) return 0
      const body = new Uint8Array(await file.slice(at + header, at + size).arrayBuffer())
      return rotationInMoov(body, trackId)
    }
    at += size
  }
  return 0
}

/**
 * The largest box of the picture's shape that fits inside `boxW × boxH`,
 * centred — the same *contain* the player draws every layer with, so a
 * portrait clip on a landscape timeline is pillarboxed in its thumbnails just
 * as it is on screen.
 */
export function containBox(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; width: number; height: number } {
  if (!(srcW > 0) || !(srcH > 0)) return { x: 0, y: 0, width: boxW, height: boxH }
  const aspect = srcW / srcH
  let width = boxW
  let height = Math.round(boxW / aspect)
  if (height > boxH) {
    height = boxH
    width = Math.round(boxH * aspect)
  }
  width = Math.max(1, Math.min(boxW, width))
  height = Math.max(1, Math.min(boxH, height))
  return { x: Math.floor((boxW - width) / 2), y: Math.floor((boxH - height) / 2), width, height }
}

/**
 * Turn a coded thumbnail (`src`, RGBA, `srcW × srcH`) clockwise by `rotation`
 * and set it into an `outW × outH` black thumbnail at `at` — whose width and
 * height are the source's swapped for a quarter turn. Plain arithmetic rather
 * than a canvas transform, for the same reason as `yuv.ts`: in WebKit, drawing
 * in the worker stalls the main thread.
 */
export function placeRotated(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  rotation: Rotation,
  outW: number,
  outH: number,
  at: { x: number; y: number },
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(outW * outH * 4)
  // Opaque black everywhere first — the bars either side of a turned picture.
  for (let i = 3; i < out.length; i += 4) out[i] = 255
  const quarter = rotation === 90 || rotation === 270
  const upW = quarter ? srcH : srcW
  const upH = quarter ? srcW : srcH
  for (let v = 0; v < upH; v++) {
    const oy = at.y + v
    if (oy < 0 || oy >= outH) continue
    for (let u = 0; u < upW; u++) {
      const ox = at.x + u
      if (ox < 0 || ox >= outW) continue
      // The coded pixel that lands at upright (u, v).
      let x: number
      let y: number
      if (rotation === 90) {
        x = v
        y = srcH - 1 - u
      } else if (rotation === 180) {
        x = srcW - 1 - u
        y = srcH - 1 - v
      } else if (rotation === 270) {
        x = srcW - 1 - v
        y = u
      } else {
        x = u
        y = v
      }
      const i = (y * srcW + x) * 4
      const o = (oy * outW + ox) * 4
      out[o] = src[i]
      out[o + 1] = src[i + 1]
      out[o + 2] = src[i + 2]
      out[o + 3] = 255
    }
  }
  return out
}
