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

// `fixtures/portrait-270x480.mp4` is the same thing stood on its end: 2 seconds
// of 270×480 H.264 + AAC, a solid red fill with a moving white marker, made the
// same way and for the same reason. It exists because the reframe assertion
// cannot be made with a 16:9 source at all — a 480×270 clip put into a 1920×1080
// frame is the same shape and grows no bars, so it could not tell a letterbox
// from a stretch. A portrait source in a landscape frame can.
const PORTRAIT = join(HERE, 'fixtures', 'portrait-270x480.mp4')
const PORTRAIT_BYTES = readFileSync(PORTRAIT)

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

/**
 * Save the export, decode a frame of it, and read individual PIXELS back out.
 *
 * A dimension assertion alone cannot tell a letterbox from a stretch: a portrait
 * clip squashed sideways to fill 1920×1080 has exactly the same `videoWidth`
 * and `videoHeight` as one centred with black bars. Only the colour of a pixel
 * near the edge can, so that is what this reads — through the BROWSER's own
 * decoder, not ours.
 */
async function readBackPixels(page: Page, atSec: number, points: [number, number][]) {
  return page.evaluate(
    async ({ atSec, points }) => {
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
      video.muted = true
      video.src = real.call(URL, blob)
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('the browser refused the file we wrote'))
        setTimeout(() => reject(new Error('timed out loading the result')), 30_000)
      })
      // Seeking forces a real decode of a frame in the middle of the file, which
      // `loadedmetadata` alone does not.
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve()
        setTimeout(() => reject(new Error('seek timed out')), 20_000)
        video.currentTime = atSec
      })

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(video, 0, 0)

      return {
        size: blob.size,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        samples: points.map(([x, y]) => {
          const d = ctx.getImageData(x, y, 1, 1).data
          return { x, y, r: d[0], g: d[1], b: d[2] }
        }),
      }
    },
    { atSec, points },
  )
}

/** The preview canvas, sampled the same way the exported file is. */
async function previewPixels(page: Page, points: [number, number][]) {
  return page.evaluate((points) => {
    const canvas = document.querySelector('[data-testid=preview]') as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    return {
      width: canvas.width,
      height: canvas.height,
      samples: points.map(([fx, fy]) => {
        // Fractions of the frame, so the same point can be read out of a 640-wide
        // preview and a 1920-wide export.
        const x = Math.round(fx * (canvas.width - 1))
        const y = Math.round(fy * (canvas.height - 1))
        const d = ctx.getImageData(x, y, 1, 1).data
        return { x, y, r: d[0], g: d[1], b: d[2] }
      }),
    }
  }, points)
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

  test('the app name opens the suite switcher rather than reloading the page', async ({ page, browser }) => {
    await page.goto('/')

    // The identity is NOT a link. `SuiteSwitcher` skips any click that lands on
    // an `<a>` or a `<button>`, so a home link there means the name can only
    // ever navigate — and on a touch screen, with no hover, that left the
    // switcher unreachable and a tap reloading the app mid-edit.
    const name = page.getByText('Universal Video', { exact: true }).first()
    await expect(name).toBeVisible()
    expect(await name.evaluate((el) => !!el.closest('a'))).toBe(false)

    await name.hover()
    await expect(page.getByRole('menu')).toBeVisible()

    // The keyboard still gets in. The home anchor used to be the only focusable
    // thing in the identity, and the switcher opens on focus.
    const handle = page.getByRole('button', { name: 'Switch product' })
    await handle.focus()
    await expect(page.getByRole('menu')).toBeVisible()

    // And the gesture that has no hover behind it: a tap, on a touch screen.
    const touch = await browser.newContext({
      hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 },
    })
    const mobile = await touch.newPage()
    let navigations = 0
    mobile.on('framenavigated', (f) => {
      if (f === mobile.mainFrame()) navigations += 1
    })
    await mobile.goto('/')
    navigations = 0

    await mobile.getByText('Universal Video', { exact: true }).first().tap()
    await expect(mobile.getByRole('menu')).toBeVisible()
    // The whole point: the menu came up and the page did not go anywhere.
    expect(navigations).toBe(0)

    await touch.close()
  })

  test('the front door is the suite’s circle, and a file let go anywhere lands in it', async ({ page }) => {
    await page.goto('/')

    // The same ring Universal PDF, Images and Compress open with. The WHOLE
    // circle is the button — `DropRing` switches pointer events off in its
    // centre so nothing there can swallow a drop, which means a nested button
    // would be dead to the mouse — so the accessible name has to carry both
    // halves of what it does.
    const ring = page.getByRole('button', { name: 'Drop a video here, or choose a file' })
    await expect(ring).toBeVisible()

    // Clicking it opens the picker exactly ONCE. The `<input>` is deliberately
    // outside the zone: inside it, the click that opens the dialog bubbles back
    // into the zone's own handler, and the only thing between that and an
    // endless loop is the browser's re-entrancy guard.
    const opened = await page.evaluate(async () => {
      const input = document.querySelector('input[type=file]') as HTMLInputElement
      let n = 0
      input.addEventListener('click', (e) => {
        n += 1
        e.preventDefault() // don't hand a headless browser a native file dialog
      })
      ;(document.querySelector('[data-unisim-dropzone]') as HTMLElement).click()
      await new Promise((r) => setTimeout(r, 100))
      return n
    })
    expect(opened).toBe(1)

    // And the circle is a target, not a wall. Let go over the footer, hundreds
    // of pixels from the ring, and the file is still taken — where a page that
    // ignored it would let the browser navigate to the file and throw the tab
    // away, which in a local-first app means throwing the work away.
    await page.evaluate(async (data) => {
      const bin = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bin], 'clip.mp4', { type: 'video/mp4' }))
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
      const footer = document.querySelector('footer') as HTMLElement
      footer.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
    }, FIXTURE_BYTES.toString('base64'))

    await expect(page.locator('[data-testid=clip]')).toHaveCount(1)
  })

  test('the front door is two columns, and every honesty row opens on click', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')

    // Two columns, the shape Compress and Converter already use: the ring on
    // the left, "what it does" on the right. Asserted GEOMETRICALLY rather than
    // by class name — the point is that they are side by side, and a class
    // assertion would pass on a grid that had silently collapsed.
    const ring = page.getByRole('button', { name: 'Drop a video here, or choose a file' })
    const box = page.getByRole('heading', { name: /What it does/ })
    const ringBox = (await ring.boundingBox())!
    const honestyBox = (await box.boundingBox())!
    expect(honestyBox.x).toBeGreaterThan(ringBox.x + ringBox.width)

    // Collapsed by default: the summary is on the page, the full reasoning is
    // not. This is the whole point of the box being succinct — nine paragraphs
    // in the narrow column buried the ring.
    const row = page.getByRole('button', { name: /^Has a ceiling/ })
    await expect(row).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText('a five-clip edit costs five sources')).toHaveCount(0)

    // ...and one click reveals it. Nothing was deleted when the box shrank.
    await row.click()
    await expect(row).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('a five-clip edit costs five sources')).toBeVisible()

    // Rows are independent — opening one does not open or close the others.
    const other = page.getByRole('button', { name: /^Reads/ })
    await expect(other).toHaveAttribute('aria-expanded', 'false')

    await row.click()
    await expect(row).toHaveAttribute('aria-expanded', 'false')

    // Every row has to be openable, not just the one sampled above.
    const rows = page.locator('section:has(h2) li button[aria-expanded]')
    await expect(rows).toHaveCount(9)
  })

  test('the two columns stack ring-first on a phone', async ({ browser }) => {
    // Below `lg` the grid collapses, and the ORDER matters: somebody on a phone
    // should meet the drop target before the spec sheet, not scroll past nine
    // rows to reach it.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    const page = await context.newPage()
    await page.goto('/')

    const ring = (await page
      .getByRole('button', { name: 'Drop a video here, or choose a file' })
      .boundingBox())!
    const honesty = (await page.getByRole('heading', { name: /What it does/ }).boundingBox())!

    expect(honesty.y).toBeGreaterThan(ring.y + ring.height)
    // Same column, not side by side — i.e. it really did stack.
    expect(Math.abs(honesty.x - ring.x)).toBeLessThan(ring.width)

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

  test('the timeline is exactly as wide as the picture, and the needle lines up with it', async ({ page }) => {
    // The owner's ask, mechanised: "match the timeline to the width of the video
    // so the player needle matches the same position in the video". At fit that
    // is not an approximation — the movie IS the width, so the needle at t is at
    // t/duration of it, and it can be asserted in pixels rather than eyeballed.
    await page.goto('/')
    await drop(page, 'clip.mp4', FIXTURE_BYTES)
    await expect(page.locator('[data-testid=clip]')).toHaveCount(1)

    const canvas = (await page.locator('[data-testid=preview]').boundingBox())!
    const surface = (await page.locator('[data-testid=timeline-surface]').boundingBox())!

    // Same width, and the same x on screen: the needle is under the picture,
    // not merely proportional to something the same shape.
    expect(Math.abs(surface.width - canvas.width)).toBeLessThan(1)
    expect(Math.abs(surface.x - canvas.x)).toBeLessThan(1)

    const duration = await page.evaluate(
      () => Number(document.querySelector('[data-testid=clip]')!.getAttribute('data-end')),
    )

    // Nothing scrolls at fit — a timeline that can scroll at fit is a timeline
    // that can stop lining up (the ruler's overhanging tick used to do exactly
    // that, which is why the ruler is clipped).
    const scroll = await page.evaluate(() => {
      const box = document.querySelector('[data-testid=timeline-surface]')!.parentElement!
      return { over: box.scrollWidth - box.clientWidth, at: box.scrollLeft }
    })
    expect(scroll.over).toBeLessThanOrEqual(2)
    expect(scroll.at).toBe(0)

    // …including at the very last frame, where the needle sits on the edge.
    for (const t of [0, 0.5, 1, 1.5, duration]) {
      await page.getByLabel('Playhead').fill(String(t))
      const needle = (await page.locator('[data-testid=playhead]').boundingBox())!
      // Where the picture would have to be scrubbed to, in page pixels.
      const expected = canvas.x + (t / duration) * canvas.width
      expect(Math.abs(needle.x - expected)).toBeLessThan(1)
    }
  })

  test('zoom makes the timeline wider without losing the playhead', async ({ page }) => {
    await page.goto('/')
    await drop(page, 'clip.mp4', FIXTURE_BYTES)
    await expect(page.locator('[data-testid=clip]')).toHaveCount(1)

    const surface = page.locator('[data-testid=timeline-surface]')
    const viewport = (await page.locator('[data-testid=timeline]').boundingBox())!
    const fitted = (await surface.boundingBox())!.width
    await expect(page.locator('[data-testid=zoom-level]')).toHaveText('Fit')
    // Nothing to zoom out to: fit is the whole movie.
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled()

    await page.getByLabel('Playhead').fill('1.5')
    await page.getByRole('button', { name: 'Zoom in' }).click()

    const zoomed = (await surface.boundingBox())!.width
    expect(zoomed).toBeGreaterThan(fitted * 1.4)
    await expect(page.locator('[data-testid=zoom-level]')).toHaveText('150%')

    // The needle is still on screen — zooming about the left edge would have
    // put 1.5 s of a 2 s clip off the right-hand side.
    const needle = (await page.locator('[data-testid=playhead]').boundingBox())!
    expect(needle.x).toBeGreaterThan(viewport.x)
    expect(needle.x).toBeLessThan(viewport.x + viewport.width)

    // Fit puts it back, exactly.
    await page.getByRole('button', { name: /^Fit/ }).click()
    await expect(page.locator('[data-testid=zoom-level]')).toHaveText('Fit')
    expect(Math.abs((await surface.boundingBox())!.width - fitted)).toBeLessThan(1)
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

  test('reframes a portrait video to 1920×1080 with black down BOTH sides', async ({ page }) => {
    // The owner's ask, mechanised: *"I want to be able to reframe a video e.g. a
    // portrait video to reframe to 1920 x 1080 — it keeps the video in the
    // centre and fills black on the sides."*
    //
    // The proof has to be a PIXEL. A 270×480 clip stretched sideways to fill
    // 1920×1080 produces a file with exactly the same dimensions as one centred
    // in it, so `videoWidth === 1920` says nothing about whether the reframe
    // letterboxed or distorted. The bar is where the difference lives.
    await page.goto('/')
    await drop(page, 'portrait.mp4', PORTRAIT_BYTES)
    await expect(page.getByText(/270×480 · 0:02 · 30 fps/)).toBeVisible()

    // Left alone, the movie is still the shape of what was dropped.
    await expect(page.getByRole('button', { name: /Compress this video/ })).toContainText('270×480')
    await expect(page.locator('[data-testid=preview]')).toHaveAttribute('data-frame', '270x480')

    await page.getByLabel('Output frame').selectOption('landscape')

    // The prediction moves the moment the frame does — before anything runs.
    await expect(page.locator('[data-testid=preview]')).toHaveAttribute('data-frame', '1920x1080')
    const button = page.getByRole('button', { name: /Export this edit|Compress this video/ })
    await expect(button).toContainText('1920×1080')
    await expect(button).toBeEnabled()

    // ── The timeline still lines up with the picture ───────────────────────
    // The frame just changed shape, and the timeline is laid out to the
    // player's frame. The needle has to still be under the frame it names.
    const canvas = (await page.locator('[data-testid=preview]').boundingBox())!
    const surface = (await page.locator('[data-testid=timeline-surface]').boundingBox())!
    expect(Math.abs(surface.width - canvas.width)).toBeLessThan(1)
    expect(Math.abs(surface.x - canvas.x)).toBeLessThan(1)
    await expect(page.locator('[data-testid=zoom-level]')).toHaveText('Fit')
    const duration = await page.evaluate(
      () => Number(document.querySelector('[data-testid=clip]')!.getAttribute('data-end')),
    )
    for (const t of [0, 1, duration]) {
      await page.getByLabel('Playhead').fill(String(t))
      const needle = (await page.locator('[data-testid=playhead]').boundingBox())!
      expect(Math.abs(needle.x - (canvas.x + (t / duration) * canvas.width))).toBeLessThan(1)
    }

    // ── The PREVIEW letterboxes, before anything is encoded ────────────────
    await page.getByLabel('Playhead').fill('1')
    await expect
      .poll(
        async () => (await previewPixels(page, [[0.5, 0.5]])).samples[0].r,
        { timeout: 15_000, message: 'the preview never showed a decoded frame' },
      )
      .toBeGreaterThan(60)
    const preview = await previewPixels(page, [[0.03, 0.5], [0.5, 0.5], [0.97, 0.5]])
    // 640 across at 16:9 — the canvas IS the output frame's shape.
    expect(preview.width / preview.height).toBeCloseTo(16 / 9, 2)
    expect(preview.samples[0].r).toBeLessThan(24) // left bar
    expect(preview.samples[2].r).toBeLessThan(24) // right bar
    expect(preview.samples[1].r).toBeGreaterThan(60) // picture

    // ── And so does the FILE ───────────────────────────────────────────────
    await page.getByRole('button', { name: /Export this edit|Compress this video/ }).click()
    await expect(page.getByRole('button', { name: /^Save / })).toBeVisible({ timeout: 180_000 })

    // A 270×480 source contained in 1920×1080 is drawn 607.5 px wide and
    // centred, so the picture runs from x≈656 to x≈1264 and everything outside
    // that is black. These four points are chosen from that arithmetic.
    const result = await readBackPixels(page, 1, [
      [64, 540], // deep in the left bar
      [600, 540], // still bar, 56 px short of the picture's edge
      [960, 540], // the middle of the picture
      [1856, 540], // deep in the right bar
    ])

    expect(result.width).toBe(1920)
    expect(result.height).toBe(1080)
    expect(result.duration).toBeGreaterThan(1.8)

    const [farLeft, nearLeft, middle, farRight] = result.samples
    const lit = (s: { r: number; g: number; b: number }) => Math.max(s.r, s.g, s.b)
    // Black at the sides. If the picture had been stretched to fill the frame
    // instead of centred in it, every one of these would be red.
    expect(lit(farLeft)).toBeLessThan(24)
    expect(lit(nearLeft)).toBeLessThan(24)
    expect(lit(farRight)).toBeLessThan(24)
    // …and the picture really is in the middle, not merely absent everywhere.
    expect(middle.r).toBeGreaterThan(120)
    expect(middle.r).toBeGreaterThan(middle.g + 40)
  })

  test('a custom frame cannot be given an odd edge', async ({ page }) => {
    // The renderer refuses an odd width or height up front — H.264 codes in
    // 16×16 macroblocks — so the control must not be able to reach that
    // refusal. Typing an odd number is the obvious way to try.
    await page.goto('/')
    await drop(page, 'clip.mp4', FIXTURE_BYTES)

    await page.getByLabel('Output frame').selectOption('custom')
    await page.getByLabel('Frame width').fill('1281')
    await page.getByLabel('Frame height').fill('719')
    await page.getByLabel('Frame height').blur()

    await expect(page.getByLabel('Frame width')).toHaveValue('1282')
    await expect(page.getByLabel('Frame height')).toHaveValue('720')
    await expect(page.locator('[data-testid=preview]')).toHaveAttribute('data-frame', '1282x720')

    // Too small lands on the floor rather than on the renderer…
    await page.getByLabel('Frame width').fill('3')
    await page.getByLabel('Frame width').blur()
    await expect(page.getByLabel('Frame width')).toHaveValue('16')

    // …and clearing the box to retype it puts back what was there, rather than
    // silently reframing the movie to nothing.
    await page.getByLabel('Frame width').fill('')
    await page.getByLabel('Frame width').blur()
    await expect(page.getByLabel('Frame width')).toHaveValue('16')

    // The prediction — and therefore the memory refusal — follows the frame.
    await page.getByLabel('Frame width').fill('3840')
    await page.getByLabel('Frame height').fill('2160')
    await page.getByLabel('Frame height').blur()
    await expect(page.getByRole('button', { name: /Export this edit|Compress this video/ }))
      .toContainText('3840×2160')
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
