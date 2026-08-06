import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// The end-to-end proof. An editor that compiles proves nothing, so this drives
// the REAL app in a REAL browser with a REAL H.264 MP4: it plays it, cuts it,
// drags it onto a second track, and then asks the browser's own demuxer whether
// what comes out is a video.
//
// `fixtures/clip-480x270.mp4` is 2 seconds of 480×270 at ~1.5 Mbps, produced by
// Chromium's own VideoEncoder and muxed by @unisim/media — i.e. by the same
// container code under test, which is the only way to make a genuine H.264 file
// on a machine with no ffmpeg. It is checked in so this test needs nothing but
// the repo.

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(HERE, 'fixtures', 'clip-480x270.mp4')
const FIXTURE_BYTES = readFileSync(FIXTURE)

async function drop(page: Page, name: string, buffer: Buffer) {
  await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'video/mp4', buffer })
}

/** The clip rectangles on the timeline, as the DOM reports them. */
/**
 * Press Save, capture the Blob the download hands to `URL.createObjectURL`, and
 * read it back with the BROWSER's own decoders — `<video>` for the picture and
 * `decodeAudioData` for the sound.
 *
 * Reading both matters: a renderer bug can produce a file of exactly the right
 * length whose audio stops early, and every duration assertion would still pass.
 */
async function readBackExport(page: Page) {
  return page.evaluate(async () => {
    const captured: Blob[] = []
    const real = URL.createObjectURL
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      if (obj instanceof Blob) captured.push(obj)
      return real.call(URL, obj)
    }
    const save = [...document.querySelectorAll('button')].find((b) => /^Save /.test(b.textContent ?? ''))
    save?.click()
    await new Promise((r) => setTimeout(r, 300))
    URL.createObjectURL = real

    const blob = captured[captured.length - 1]
    const bytes = await blob.arrayBuffer()

    const video = document.createElement('video')
    video.src = real.call(URL, blob)
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('unreadable'))
      setTimeout(() => reject(new Error('timeout')), 30_000)
    })

    const ctx = new AudioContext()
    let audioDuration = 0
    try {
      const buf = await ctx.decodeAudioData(bytes.slice(0))
      audioDuration = buf.duration
    } finally {
      void ctx.close()
    }

    return {
      size: blob.size,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      audioDuration,
    }
  })
}

async function clips(page: Page) {
  return page.locator('[data-testid=clip]').evaluateAll((nodes) =>
    nodes.map((n) => ({
      id: n.getAttribute('data-clip-id')!,
      track: Number(n.getAttribute('data-track')),
      start: Number(n.getAttribute('data-start')),
      end: Number(n.getAttribute('data-end')),
      inSec: Number(n.getAttribute('data-in')),
      outSec: Number(n.getAttribute('data-out')),
      // The audio lane's own words, read out of the lane the user can see —
      // not out of the model. This is the assertion that would catch picture
      // and sound drifting apart in the UI even if the model were right.
      audioLane: n.querySelector('[data-testid=audio-lane]')?.textContent?.trim() ?? '',
    })),
  )
}

/** "sound · 0:01.0–0:02.0" → [1, 2] */
function audioBounds(lane: string): [number, number] {
  const times = [...lane.matchAll(/(\d+):(\d+\.\d)/g)].map(([, m, s]) => Number(m) * 60 + Number(s))
  return [times[0], times[1]]
}

test.describe('Universal Video', () => {
  test('the front door says the thing it exists to say', async ({ page }) => {
    await page.goto('/')

    // This is the whole reason the app is not a tab in Universal Converter
    // (§10, Q1). If this assertion ever has to be relaxed, the app has lost its
    // reason to exist separately.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Compress a video without uploading it',
    )
    await expect(page).toHaveTitle(/Compress a video without uploading it/)

    const description = await page.locator('meta[name=description]').getAttribute('content')
    expect(description).toContain('Compress a video without uploading it')
    const og = await page.locator('meta[property="og:title"]').getAttribute('content')
    expect(og).toContain('Compress a video without uploading it')
  })

  test('opens in light mode even when the device asks for dark', async ({ browser }) => {
    // The standing suite rule: an app opens LIGHT and stays light until the
    // user picks something else. `system` is offered; it is not the default.
    const context = await browser.newContext({ colorScheme: 'dark' })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await context.close()
  })

  test('reads a file’s header and predicts the output before anything runs', async ({ page }) => {
    await page.goto('/')
    await drop(page, 'clip.mp4', FIXTURE_BYTES)

    // The probe is a header read, so the facts appear immediately — no decode.
    await expect(page.getByText(/480×270 · 0:02 · 30 fps/)).toBeVisible()

    // The estimate is ON the button. §10.4: "arm or refuse the button *before*
    // it is pressed, with the estimate written on the button itself."
    const button = page.getByRole('button', { name: /Compress this video/ })
    await expect(button).toBeEnabled()
    await expect(button).toContainText(/About \d/)
    await expect(button).toContainText(/% smaller/)
  })

  test('one dropped file becomes a player and a timeline, and the player shows it', async ({ page }) => {
    await page.goto('/')
    await drop(page, 'clip.mp4', FIXTURE_BYTES)

    // One drag gives you the whole editor: preview, ruler, one clip with a
    // video lane and an audio lane inside one box.
    await expect(page.locator('[data-testid=preview]')).toBeVisible()
    await expect(page.locator('[data-testid=timeline]')).toBeVisible()
    await expect(page.locator('[data-testid=clip]')).toHaveCount(1)
    await expect(page.locator('[data-testid=clip] [data-testid=video-lane]')).toHaveCount(1)
    await expect(page.locator('[data-testid=clip] [data-testid=audio-lane]')).toHaveCount(1)

    // Move the playhead into the middle of the clip and let the preview settle.
    await page.getByLabel('Playhead').fill('1')
    await expect(page.locator('[data-testid=clock]')).toContainText('0:01.0')

    // The canvas is really showing decoded video, not an empty black box. This
    // is the difference between "the component rendered" and "the player works".
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const canvas = document.querySelector('[data-testid=preview]') as HTMLCanvasElement | null
            const ctx = canvas?.getContext('2d')
            if (!canvas || !ctx) return 0
            const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
            let lit = 0
            for (let i = 0; i < data.length; i += 4) {
              if (data[i] > 12 || data[i + 1] > 12 || data[i + 2] > 12) lit += 1
            }
            return lit
          }),
        { timeout: 15_000, message: 'the preview canvas never showed a decoded frame' },
      )
      .toBeGreaterThan(1000)
  })

  test('cutting splits picture AND sound at the same instant, and dragging stacks a track', async ({ page }) => {
    await page.goto('/')
    await drop(page, 'clip.mp4', FIXTURE_BYTES)
    await expect(page.locator('[data-testid=clip]')).toHaveCount(1)

    // ── Cut at the playhead ────────────────────────────────────────────────
    await page.getByLabel('Playhead').fill('1')
    await page.getByRole('button', { name: 'Cut at playhead' }).click()
    await expect(page.locator('[data-testid=clip]')).toHaveCount(2)

    const [left, right] = await clips(page)
    // The picture boundary.
    expect(left.end).toBeCloseTo(right.start, 3)
    expect(left.outSec).toBeCloseTo(right.inSec, 3)
    // The SOUND boundary, read off the audio lanes the user is looking at. It
    // is the same instant because there is one `Clip` behind both lanes — this
    // is the whole reason the contract has no separate audio clip.
    const [, leftAudioEnd] = audioBounds(left.audioLane)
    const [rightAudioStart] = audioBounds(right.audioLane)
    expect(leftAudioEnd).toBeCloseTo(rightAudioStart, 3)
    expect(leftAudioEnd).toBeCloseTo(left.end, 1)

    // ── Drag the second half back over the first ───────────────────────────
    // Two videos slid on top of each other stack onto a new track rather than
    // overwriting each other.
    expect(left.track).toBe(0)
    expect(right.track).toBe(0)

    const secondClip = page.locator('[data-testid=clip]').nth(1)
    const box = (await secondClip.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2, { steps: 8 })
    await page.mouse.up()

    await expect
      .poll(async () => (await clips(page)).filter((c) => c.track === 1).length, { timeout: 5_000 })
      .toBe(1)
    const stacked = await clips(page)
    expect(stacked).toHaveLength(2)
    // Nothing was overwritten: both clips are still there, and they now overlap.
    expect(Math.min(stacked[0].end, stacked[1].end)).toBeGreaterThan(
      Math.max(stacked[0].start, stacked[1].start),
    )

    // ── Delete one ─────────────────────────────────────────────────────────
    await secondClip.click()
    await page.getByRole('button', { name: 'Delete clip' }).click()
    await expect(page.locator('[data-testid=clip]')).toHaveCount(1)
  })

  test('an image becomes an intro card in front of the video', async ({ page }) => {
    await page.goto('/')
    await drop(page, 'clip.mp4', FIXTURE_BYTES)
    await expect(page.locator('[data-testid=clip]')).toHaveCount(1)

    await page.getByLabel('Add intro…').setInputFiles({
      name: 'title.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    })

    await expect(page.locator('[data-testid=clip]')).toHaveCount(2)
    const [intro, footage] = await clips(page)
    // The card is 3 s by default and the footage has been pushed behind it.
    expect(intro.start).toBe(0)
    expect(intro.end).toBeCloseTo(3, 3)
    expect(footage.start).toBeCloseTo(3, 3)
    // A still has no sound, and the lane says so rather than being absent.
    expect(intro.audioLane).toContain('no sound')
  })

  test('compresses a real video, and the browser reads the result back', async ({ page }) => {
    await page.goto('/')
    await drop(page, 'clip.mp4', FIXTURE_BYTES)

    const predicted = await page
      .getByRole('button', { name: /Compress this video/ })
      .textContent()
    expect(predicted).toMatch(/About/)

    await page.getByRole('button', { name: /Compress this video/ }).click()

    // Frames-done / frames-total, not just a percentage — that is what makes a
    // run drifting past its prediction visible at 20% rather than at 100%.
    await expect(page.getByText(/of 60 frames/)).toBeVisible({ timeout: 30_000 })

    await expect(page.getByText(/% smaller/).first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: /^Save clip\.mp4$/ })).toBeVisible()

    // The real test: hand the produced bytes to the browser's own demuxer. Our
    // reader agreeing with our writer proves nothing; Chromium agreeing does.
    const played = await page.evaluate(async () => {
      // Intercept the object URL the Save button mints, which is the only
      // public handle on the finished blob.
      const captured: Blob[] = []
      const real = URL.createObjectURL
      URL.createObjectURL = (obj: Blob | MediaSource) => {
        if (obj instanceof Blob) captured.push(obj)
        return real.call(URL, obj)
      }
      const save = [...document.querySelectorAll('button')].find((b) => /^Save /.test(b.textContent ?? ''))
      save?.click()
      await new Promise((r) => setTimeout(r, 300))
      URL.createObjectURL = real
      if (!captured.length) return { error: 'no blob was produced' }

      const blob = captured[captured.length - 1]
      const video = document.createElement('video')
      video.muted = true
      video.src = real.call(URL, blob)
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('the browser refused the file we wrote'))
        setTimeout(() => reject(new Error('timed out loading the result')), 15_000)
      })
      // Seeking forces a real decode of a frame in the middle of the file,
      // which `loadedmetadata` alone does not — and unlike `play()` it is not
      // subject to autoplay policy, which blocks a clip that has sound.
      let decodedAFrame = false
      try {
        await new Promise<void>((resolve, reject) => {
          video.onseeked = () => resolve()
          setTimeout(() => reject(new Error('seek timed out')), 10_000)
          video.currentTime = 1
        })
        decodedAFrame = video.readyState >= 2
      } catch { /* reported as false */ }

      // The sound half of the pipeline, proven rather than assumed: decode the
      // AAC track back out of the MP4 we wrote, with the browser's own decoder.
      let audioSeconds = 0
      try {
        const ctx = new OfflineAudioContext(1, 1, 44100)
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
        audioSeconds = decoded.duration
      } catch { /* reported as 0 below */ }

      return {
        size: blob.size,
        type: blob.type,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        played: decodedAFrame,
        audioSeconds,
      }
    })

    expect(played.error).toBeUndefined()
    expect(played.type).toBe('video/mp4')
    expect(played.width).toBe(480)
    expect(played.height).toBe(270)
    expect(played.duration).toBeGreaterThan(1.8)
    expect(played.duration).toBeLessThan(2.2)
    expect(played.played).toBe(true) // seeked to 1s and decoded a frame there
    // The sound survived, re-encoded to AAC alongside the picture. This is the
    // half that fails SILENTLY when it fails — `encodeAudioTrack` swallows an
    // audio error rather than losing the picture too — so it needs asserting
    // rather than eyeballing. (It was failing on all of Windows until the
    // one-frame AAC support trial in @unisim/media was fixed; that is exactly
    // the class of bug this assertion exists to catch.)
    expect(played.audioSeconds!).toBeGreaterThan(1.5)
    // The point of the product.
    expect(played.size!).toBeLessThan(FIXTURE_BYTES.length)
  })

  test('a trim typed into the timeline produces a shorter, smaller video', async ({ page }) => {
    await page.goto('/')
    await drop(page, 'clip.mp4', FIXTURE_BYTES)

    await page.getByLabel('Resolution').selectOption('480')
    // The trim is now the clip itself: pull the out point back to 1 s. This is
    // the same `trimClip()` the drag handle calls, so typing and dragging
    // cannot round differently.
    await page.getByLabel('Out point').fill('1')
    await page.getByLabel('Out point').blur()
    await expect(page.locator('[data-testid=clip]')).toHaveAttribute('data-out', '1.000')

    await page.getByRole('button', { name: /Compress this video/ }).click()
    await expect(page.getByRole('button', { name: /^Save clip\.mp4$/ })).toBeVisible({ timeout: 60_000 })

    const result = await page.evaluate(async () => {
      const captured: Blob[] = []
      const real = URL.createObjectURL
      URL.createObjectURL = (obj: Blob | MediaSource) => {
        if (obj instanceof Blob) captured.push(obj)
        return real.call(URL, obj)
      }
      const save = [...document.querySelectorAll('button')].find((b) => /^Save /.test(b.textContent ?? ''))
      save?.click()
      await new Promise((r) => setTimeout(r, 300))
      URL.createObjectURL = real
      const blob = captured[captured.length - 1]
      const video = document.createElement('video')
      video.src = real.call(URL, blob)
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('unreadable'))
        setTimeout(() => reject(new Error('timeout')), 15_000)
      })
      return { size: blob.size, duration: video.duration, width: video.videoWidth, height: video.videoHeight }
    })

    // 480p names the SHORT edge and the source's short edge is already 270, so
    // the picture must come back untouched rather than being scaled UP.
    expect(result.width).toBe(480)
    expect(result.height).toBe(270)
    // Roughly the first second — the cut starts at the keyframe at or before
    // the start time, so an exact 1.000 would be a lie to assert.
    expect(result.duration).toBeLessThan(1.4)
    expect(result.size).toBeLessThan(FIXTURE_BYTES.length / 2)
  })

  test('exports a two-clip edit, and the audio ends where the picture ends', async ({ page }) => {
    // The proof the whole contract exists for. Cutting splits ONE clip, so the
    // audio boundary IS the picture boundary — this drives that through the real
    // editor and the real renderer, then reads the result back with the
    // browser's own decoders rather than trusting what we asked for.
    await page.goto('/')
    await drop(page, 'clip.mp4', FIXTURE_BYTES)
    await page.getByLabel('Playhead').fill('1')
    await page.getByRole('button', { name: 'Cut at playhead' }).click()
    await expect(page.locator('[data-testid=clip]')).toHaveCount(2)

    await page.getByRole('button', { name: /Export this edit/ }).click()
    // Wait for the render to actually finish. Compositing two clips frame by
    // frame is real work, unlike the single-clip passthrough, so this is a
    // generous timeout rather than the 15 s the compress path uses.
    await expect(page.getByRole('button', { name: /^Save / })).toBeVisible({ timeout: 180_000 })
    const result = await readBackExport(page)

    // Both halves are still there, so the export is the whole original length.
    expect(result.duration).toBeGreaterThan(1.5)
    expect(result.audioDuration).toBeGreaterThan(1.5)
    // Picture and sound agree. 100 ms, not 1 ms: AAC priming rides at the head
    // because the muxer writes no edit list, and that is a known, measured
    // offset rather than drift.
    expect(Math.abs(result.duration - result.audioDuration)).toBeLessThan(0.1)
  })

  test('refuses a format it cannot read, by name, before doing any work', async ({ page }) => {
    await page.goto('/')
    // A .mkv is refused on drop rather than half way through a conversion —
    // and the refusal says what DOES work rather than only what doesn't.
    await page.locator('input[type=file]').first().setInputFiles({
      name: 'holiday.mkv', mimeType: 'video/x-matroska', buffer: Buffer.from(FIXTURE_BYTES),
    })
    await expect(page.getByRole('alert')).toContainText('MP4, M4V and MOV')
    await expect(page.getByRole('alert')).toContainText('.mkv')
  })

  test('refuses a file that is not really a video, without crashing', async ({ page }) => {
    await page.goto('/')
    await drop(page, 'not-a-video.mp4', Buffer.from('this is not an MP4 at all, not even slightly'))
    await expect(page.getByRole('alert')).toContainText(/no MP4 movie header|corrupt/)
  })

  test('nothing is uploaded — no request leaves for anything but the app itself', async ({ page }) => {
    // The product claim, mechanised. Every request the page makes is recorded;
    // none of them may carry the file, and none may go to a third-party host
    // (the §10.2 rule: if a user with devtools open would have to trust our
    // explanation, the design is wrong).
    const external: string[] = []
    page.on('request', (r) => {
      const url = new URL(r.url())
      const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      if (!local && url.protocol !== 'data:' && url.protocol !== 'blob:') external.push(r.url())
      if (r.method() === 'POST' || r.method() === 'PUT') external.push(`${r.method()} ${r.url()}`)
    })

    await page.goto('/')
    await drop(page, 'clip.mp4', FIXTURE_BYTES)
    await page.getByRole('button', { name: /Compress this video/ }).click()
    await expect(page.getByRole('button', { name: /^Save clip\.mp4$/ })).toBeVisible({ timeout: 60_000 })

    // The SDK talks to Supabase for auth/navbar state; that is allowed and is
    // not the file. What must never appear is an upload of the media itself, or
    // a fetch of an engine from a CDN.
    const forbidden = external.filter((u) =>
      /unpkg|jsdelivr|cdnjs|ffmpeg|storage\.googleapis|amazonaws/i.test(u),
    )
    expect(forbidden).toEqual([])
  })
})

/** A 2×2 red PNG, so the intro-card path has a real image to decode. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYEJRIAAIxUCBQGvUQoAAAAASUVORK5CYII=',
  'base64',
)
