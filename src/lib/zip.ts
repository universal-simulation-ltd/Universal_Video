// A minimal, dependency-free ZIP writer for "Export separate videos".
//
// Entries are STORED (no compression): an MP4 is already compressed, so
// deflating it would burn CPU on a main thread for a percent or two, and STORED
// keeps this file to one readable page. Uses the classic 32-bit central
// directory.
//
// ⚠️ 32-bit offsets mean the ZIP itself must stay under 4 GB — far below the
// ceiling `lib/memory.ts` already refuses at (the whole thing is assembled in
// memory before it can be saved), so the pre-flight refusal reaches this limit
// long before the format does.
//
// This is the FOURTH copy of this file in the suite — Converter, Compress and
// PDF have the same one, and it is verbatim theirs apart from this comment. It
// belongs in `@unisim/media`; there is a backlog item saying so.

interface Entry {
  name: string
  bytes: Uint8Array
  crc: number
  offset: number
}

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_CENTRAL = 0x06054b50

export async function createZip(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const parts: Uint8Array[] = []
  const entries: Entry[] = []
  let offset = 0

  for (const file of files) {
    const bytes = new Uint8Array(await file.blob.arrayBuffer())
    const name = encodeName(file.name)
    const crc = crc32(bytes)

    const header = new Uint8Array(30 + name.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, LOCAL_HEADER, true)
    view.setUint16(4, 20, true)            // version needed
    view.setUint16(6, 0x0800, true)        // flags: UTF-8 filename
    view.setUint16(8, 0, true)             // method 0 = stored
    view.setUint16(10, 0, true)            // mod time (fixed — see note below)
    view.setUint16(12, 0x21, true)         // mod date: 1980-01-01
    view.setUint32(14, crc, true)
    view.setUint32(18, bytes.length, true) // compressed size
    view.setUint32(22, bytes.length, true) // uncompressed size
    view.setUint16(26, name.length, true)
    view.setUint16(28, 0, true)            // extra field length
    header.set(name, 30)

    parts.push(header, bytes)
    entries.push({ name: file.name, bytes, crc, offset })
    offset += header.length + bytes.length
  }

  const centralStart = offset
  for (const entry of entries) {
    const name = encodeName(entry.name)
    const record = new Uint8Array(46 + name.length)
    const view = new DataView(record.buffer)
    view.setUint32(0, CENTRAL_HEADER, true)
    view.setUint16(4, 20, true)            // version made by
    view.setUint16(6, 20, true)            // version needed
    view.setUint16(8, 0x0800, true)        // flags: UTF-8 filename
    view.setUint16(10, 0, true)            // method 0 = stored
    view.setUint16(12, 0, true)
    view.setUint16(14, 0x21, true)
    view.setUint32(16, entry.crc, true)
    view.setUint32(20, entry.bytes.length, true)
    view.setUint32(24, entry.bytes.length, true)
    view.setUint16(28, name.length, true)
    view.setUint16(30, 0, true)            // extra
    view.setUint16(32, 0, true)            // comment
    view.setUint16(34, 0, true)            // disk number
    view.setUint16(36, 0, true)            // internal attrs
    view.setUint32(38, 0, true)            // external attrs
    view.setUint32(42, entry.offset, true)
    record.set(name, 46)
    parts.push(record)
    offset += record.length
  }

  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, END_OF_CENTRAL, true)
  endView.setUint16(4, 0, true)                       // this disk
  endView.setUint16(6, 0, true)                       // disk with central dir
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, offset - centralStart, true)  // central directory size
  endView.setUint32(16, centralStart, true)
  endView.setUint16(20, 0, true)                      // comment length
  parts.push(end)

  return new Blob(parts as BlobPart[], { type: 'application/zip' })
}

function encodeName(name: string): Uint8Array {
  return new TextEncoder().encode(name)
}

// Timestamps are fixed at 1980-01-01 on purpose: the same batch zipped twice
// produces byte-identical output, and no clock reading leaves the device.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
