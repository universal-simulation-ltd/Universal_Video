import { buildMp4Movie } from '@unisim/media'
import { describe, expect, it } from 'vitest'
import { readRotation, type Rotation } from './strips/rotation'
import { matrixFor, setVideoRotation, withVideoRotation } from './turnExport'

// What `convertVideo()` hands back in @unisim/media 0.7.x: a movie from its own
// muxer, identity matrix on both tracks.
function exported(): Uint8Array {
  const avcC = new Uint8Array([1, 0x64, 0, 0x1f, 0xff, 0xe0, 0])
  return buildMp4Movie({
    video: {
      samples: [{ bytes: new Uint8Array([1, 2, 3, 4]), timestamp: 0, duration: 40_000, keyframe: true }],
      description: avcC,
      width: 320,
      height: 180,
    },
    audio: {
      frames: [new Uint8Array(8)],
      description: new Uint8Array([0x12, 0x10]),
      sampleRate: 48000,
      channels: 2,
      samplesPerFrame: 1024,
    },
  })
}
const blobOf = (bytes: Uint8Array) => new Blob([bytes.slice().buffer])

describe('setVideoRotation', () => {
  it('puts every quarter turn on the video track, and only there', async () => {
    for (const r of [90, 180, 270] as Rotation[]) {
      const bytes = exported()
      expect(await readRotation(blobOf(bytes))).toBe(0)
      expect(setVideoRotation(bytes, r)).toBe(true)
      expect(await readRotation(blobOf(bytes))).toBe(r)
      // Track 2 is the audio track: untouched.
      expect(await readRotation(blobOf(bytes), 2)).toBe(0)
    }
  })
  it('changes nothing for no turn, or for a track that is already turned', () => {
    const bytes = exported()
    const before = bytes.slice()
    expect(setVideoRotation(bytes, 0)).toBe(false)
    expect(bytes).toEqual(before)
    expect(setVideoRotation(bytes, 90)).toBe(true)
    const turned = bytes.slice()
    expect(setVideoRotation(bytes, 270)).toBe(false)
    expect(bytes).toEqual(turned)
  })
  it('leaves something that is not an MP4 alone', () => {
    expect(setVideoRotation(new Uint8Array([1, 2, 3]), 90)).toBe(false)
  })
  it('writes the matrix an upright iPhone writes for 90', () => {
    expect(matrixFor(90)).toEqual([0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000])
  })
})

describe('withVideoRotation', () => {
  it('hands the same Blob back when there is nothing to do', async () => {
    const blob = blobOf(exported())
    expect(await withVideoRotation(blob, 0)).toBe(blob)
    const turned = await withVideoRotation(blob, 90)
    expect(turned).not.toBe(blob)
    expect(await readRotation(turned)).toBe(90)
    expect(turned.size).toBe(blob.size)
  })
})
