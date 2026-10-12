/**
 * Carry a source's display turn into an exported file.
 *
 * A phone held upright records LANDSCAPE frames and a quarter turn in the video
 * track's display matrix (`tkhd`) — see `strips/rotation.ts`. The export's
 * one-clip route re-encodes through `convertVideo()`, which decodes those
 * frames AS CODED and, in `@unisim/media` 0.7.x, writes the identity matrix:
 * the file came out on its side (2026-10-12). The pixels are right; only the
 * turn was lost, so the fix is to put it back — 36 bytes in the header, no
 * second encode.
 *
 * A file whose video track already carries a turn is left alone, so this stays
 * correct once the package writes the matrix itself.
 */

import { boxesIn, rotationFromMatrix, type Rotation } from './strips/rotation'

const ONE = 0x10000
const W = 0x40000000

/** The display matrix for a clockwise quarter turn, as nine signed 32-bit numbers. */
export function matrixFor(rotation: Rotation): number[] {
  switch (rotation) {
    case 90: return [0, ONE, 0, -ONE, 0, 0, 0, 0, W]
    case 180: return [-ONE, 0, 0, 0, -ONE, 0, 0, 0, W]
    case 270: return [0, -ONE, 0, ONE, 0, 0, 0, 0, W]
    default: return [ONE, 0, 0, 0, ONE, 0, 0, 0, W]
  }
}

/**
 * Write `rotation` into the first video track's matrix, IN PLACE. Returns
 * whether the bytes changed: false for no turn, no video track, a header it
 * cannot walk, or a track that is already turned.
 */
export function setVideoRotation(bytes: Uint8Array, rotation: Rotation): boolean {
  if (rotation === 0) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const moov = boxesIn(view, 0, bytes.byteLength).find((b) => b.type === 'moov')
  if (!moov) return false
  for (const trak of boxesIn(view, moov.body, moov.end)) {
    if (trak.type !== 'trak') continue
    const kids = boxesIn(view, trak.body, trak.end)
    const mdia = kids.find((k) => k.type === 'mdia')
    const hdlr = mdia && boxesIn(view, mdia.body, mdia.end).find((k) => k.type === 'hdlr')
    if (!hdlr || hdlr.end - hdlr.body < 12) continue
    if (String.fromCharCode(...bytes.subarray(hdlr.body + 8, hdlr.body + 12)) !== 'vide') continue
    const tkhd = kids.find((k) => k.type === 'tkhd')
    // The matrix sits 44 bytes from the end of tkhd in both versions: nine
    // 32-bit numbers, then the 16.16 width and height.
    if (!tkhd || tkhd.end - tkhd.body < 44 + 4) return false
    const m = tkhd.end - 44
    if (rotationFromMatrix(view.getInt32(m), view.getInt32(m + 4)) !== 0) return false
    matrixFor(rotation).forEach((v, i) => view.setInt32(m + i * 4, v))
    return true
  }
  return false
}

/** {@link setVideoRotation} on a Blob — the same Blob back when nothing changed. */
export async function withVideoRotation(blob: Blob, rotation: Rotation): Promise<Blob> {
  if (rotation === 0) return blob
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return setVideoRotation(bytes, rotation) ? new Blob([bytes], { type: blob.type || 'video/mp4' }) : blob
}
