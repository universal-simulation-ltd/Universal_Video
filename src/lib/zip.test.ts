import { describe, expect, it } from 'vitest'
import { createZip, crc32 } from './zip'

/**
 * The zip writer is a verbatim copy of the one shipped in Universal Converter,
 * Compress and PDF — and, it turns out, none of those three has a test for it.
 * Making a fourth copy is the moment to write one, because the way a hand-rolled
 * zip goes wrong is not a crash: it is a file that every tool refuses to open,
 * discovered by a customer.
 *
 * So this does not check "it produced some bytes". It walks the archive the way
 * an unzipper does — end-of-central-directory, then the central directory, then
 * each local header at the offset the directory claims — and extracts the
 * entries back out. If an offset, a size or a CRC is wrong, this fails.
 */

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50

interface Unzipped {
  name: string
  bytes: Uint8Array
}

/** A real (if minimal) unzipper for STORED entries. */
async function unzip(blob: Blob): Promise<Unzipped[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)

  // The end record is last, and fixed-length here (no archive comment).
  const endAt = bytes.length - 22
  expect(view.getUint32(endAt, true)).toBe(END)
  const count = view.getUint16(endAt + 8, true)
  let at = view.getUint32(endAt + 16, true)

  const out: Unzipped[] = []
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(at, true)).toBe(CENTRAL)
    const crc = view.getUint32(at + 16, true)
    const compressed = view.getUint32(at + 20, true)
    const uncompressed = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const localAt = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength))

    // STORED, so the two sizes agree and the bytes are the bytes.
    expect(compressed).toBe(uncompressed)

    // Follow the offset the directory gave us into the local header.
    expect(view.getUint32(localAt, true)).toBe(LOCAL)
    expect(view.getUint16(localAt + 8, true)).toBe(0) // method 0 = stored
    const localNameLength = view.getUint16(localAt + 26, true)
    const extraLength = view.getUint16(localAt + 28, true)
    const dataAt = localAt + 30 + localNameLength + extraLength
    const data = bytes.subarray(dataAt, dataAt + uncompressed)

    expect(crc32(data)).toBe(crc)
    out.push({ name, bytes: new Uint8Array(data) })
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
  }
  return out
}

// Built over an explicit ArrayBuffer, not via `Uint8Array.from`: TypeScript
// types the latter as `Uint8Array<ArrayBufferLike>`, which a `Blob` will not
// take because it could be a SharedArrayBuffer. Inference does the rest, so
// there is no return annotation to widen it back.
function payload(seed: number, length: number) {
  const bytes = new Uint8Array(new ArrayBuffer(length))
  for (let i = 0; i < length; i += 1) bytes[i] = (i * 31 + seed) % 251
  return bytes
}

describe('the zip a batch of pieces comes down as', () => {
  it('round-trips every entry, byte for byte, at the offsets it advertises', async () => {
    const first = payload(1, 5000)
    const second = payload(7, 12_345)
    const zip = await createZip([
      { name: '01_holiday_00-00-00.mp4', blob: new Blob([first]) },
      { name: '02_holiday_00-00-20.mp4', blob: new Blob([second]) },
    ])

    const entries = await unzip(zip)
    expect(entries.map((e) => e.name)).toEqual([
      '01_holiday_00-00-00.mp4',
      '02_holiday_00-00-20.mp4',
    ])
    expect(entries[0].bytes).toEqual(first)
    expect(entries[1].bytes).toEqual(second)
  })

  it('stores rather than deflates, so the zip is the pieces plus a little bookkeeping', async () => {
    // An MP4 does not compress. If this ever starts shrinking, something has
    // started spending CPU on a main thread for nothing.
    const bytes = payload(3, 40_000)
    const zip = await createZip([{ name: 'a.mp4', blob: new Blob([bytes]) }])
    expect(zip.size).toBeGreaterThanOrEqual(bytes.length)
    expect(zip.size).toBeLessThan(bytes.length + 512)
  })

  it('is byte-identical when the same pieces are zipped twice', async () => {
    // Timestamps are pinned to 1980-01-01 on purpose: no clock reading leaves
    // the device, and the same edit exported twice produces the same file.
    const entry = [{ name: 'a.mp4', blob: new Blob([payload(9, 900)]) }]
    const [one, two] = await Promise.all([createZip(entry), createZip(entry)])
    expect(new Uint8Array(await one.arrayBuffer())).toEqual(new Uint8Array(await two.arrayBuffer()))
  })

  it('writes names as UTF-8, so a piece cut from an accented file still unzips', async () => {
    const zip = await createZip([{ name: '01_vidéo_00-00-00.mp4', blob: new Blob([payload(2, 64)]) }])
    const entries = await unzip(zip)
    expect(entries[0].name).toBe('01_vidéo_00-00-00.mp4')
  })

  it('makes an empty archive rather than a broken one', async () => {
    const entries = await unzip(await createZip([]))
    expect(entries).toEqual([])
  })
})
