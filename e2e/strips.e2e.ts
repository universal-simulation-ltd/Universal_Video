import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Thumbnails and the sound wave on the timeline's clips.
//
// `fixtures/colours-320x180.mp4` is four seconds of solid colour — red, green,
// blue, yellow, one second each — with a white square moving along the bottom,
// H.264 WITH B-frames (decode order is not presentation order, which is the
// part of a thumbnail decoder that goes wrong) and a mono AAC tone at half
// scale that is SILENT for the third second. So every assertion here can be made by colour:
// the frame under 1.5 s must be green, and the wave over 2.5 s must be flat.
// Made with ffmpeg; 30 KB.

const HERE = dirname(fileURLToPath(import.meta.url))
const COLOURS = readFileSync(join(HERE, 'fixtures', 'colours-320x180.mp4'))

type Rgb = [number, number, number]

async function drop(page: Page, name: string, buffer: Buffer) {
  await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'video/mp4', buffer })
}

/** Every strip on the page has every frame it wants. */
async function stripsSettled(page: Page) {
  await expect
    .poll(
      () =>
        page.locator('[data-testid=filmstrip]').evaluateAll((nodes) =>
          nodes.length > 0 &&
          nodes.every((n) => Number(n.getAttribute('data-wanted')) > 0 && n.getAttribute('data-ready') === n.getAttribute('data-wanted')),
        ),
      { timeout: 20_000, message: 'the filmstrip never filled in' },
    )
    .toBe(true)
}

/**
 * The colour the filmstrip shows at timeline second `sec`, read out of the
 * canvas the user sees — sampled in the upper half, away from the moving square.
 */
async function stripColourAt(page: Page, sec: number, clip = 0): Promise<Rgb> {
  return page.evaluate(
    ([sec, clip]) => {
      const surface = document.querySelector('[data-testid=timeline-surface]') as HTMLElement
      const pps = Number(surface.dataset.pxPerSec)
      const x = surface.getBoundingClientRect().left + sec * pps
      const canvas = document.querySelectorAll('[data-testid=clip]')[clip].querySelector('[data-testid=filmstrip]') as HTMLCanvasElement
      const rect = canvas.getBoundingClientRect()
      const cx = Math.round((x - rect.left) * (canvas.width / rect.width))
      const cy = Math.round(canvas.height * 0.3)
      const d = canvas.getContext('2d')!.getImageData(cx, cy, 1, 1).data
      return [d[0], d[1], d[2]] as [number, number, number]
    },
    [sec, clip] as const,
  )
}

function named([r, g, b]: Rgb): string {
  if (r > 160 && g > 160 && b < 100) return 'yellow'
  if (r > 160 && g < 100 && b < 100) return 'red'
  if (g > 160 && r < 100 && b < 100) return 'green'
  if (b > 160 && r < 100 && g < 100) return 'blue'
  return `rgb(${r},${g},${b})`
}

/** How much of the audio lane's height the wave covers at timeline second `sec` (0–1). */
async function waveAt(page: Page, sec: number): Promise<number> {
  return page.evaluate((sec) => {
    const surface = document.querySelector('[data-testid=timeline-surface]') as HTMLElement
    const pps = Number(surface.dataset.pxPerSec)
    const x = surface.getBoundingClientRect().left + sec * pps
    const canvas = document.querySelector('[data-testid=waveform]') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const cx = Math.round((x - rect.left) * (canvas.width / rect.width))
    const { data } = canvas.getContext('2d')!.getImageData(cx, 0, 1, canvas.height)
    let inked = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 40) inked++
    return inked / canvas.height
  }, sec)
}

async function stats(page: Page) {
  return page.evaluate(
    () => (window as unknown as { __uvStripStats: () => Record<string, number> }).__uvStripStats(),
  )
}

async function openTuneThisApp(page: Page) {
  const trigger = page.locator('button[aria-haspopup="true"][aria-expanded]').first()
  await trigger.evaluate((el: HTMLElement) => el.click())
  const tune = page.locator('[role=menuitem]', { hasText: /Tune this app/ }).first()
  await expect(tune).toBeVisible()
  await tune.evaluate((el: HTMLElement) => el.click())
  await expect(page.locator('[data-unisim-preferences=app]')).toBeVisible()
}

test.describe('timeline thumbnails and waveforms', () => {
  test('a clip fills in with the right frames and its sound wave', async ({ page }, info) => {
    await page.goto('/')
    await drop(page, 'colours.mp4', COLOURS)
    await expect(page.locator('[data-testid=clip]')).toHaveCount(1)
    await stripsSettled(page)

    // Each second is its own colour, so a wrong frame — the classic B-frame
    // mistake is a frame from the wrong side of a reorder — is a wrong colour.
    expect(named(await stripColourAt(page, 0.5))).toBe('red')
    expect(named(await stripColourAt(page, 1.5))).toBe('green')
    expect(named(await stripColourAt(page, 2.5))).toBe('blue')
    expect(named(await stripColourAt(page, 3.5))).toBe('yellow')

    // WebCodecs in the worker, wherever the browser has it. Chromium does.
    const path = await page.locator('[data-testid=filmstrip]').getAttribute('data-path')
    if (info.project.name === 'chromium') expect(path).toBe('decoder')
    else expect(['decoder', 'element']).toContain(path)

    // The wave: a tone, then nothing for the third second, then the tone again.
    await expect(page.locator('[data-testid=waveform]')).toHaveAttribute('data-state', 'done', { timeout: 20_000 })
    expect(await waveAt(page, 0.5)).toBeGreaterThan(0.35)
    expect(await waveAt(page, 2.5)).toBeLessThan(0.15)
    expect(await waveAt(page, 3.5)).toBeGreaterThan(0.35)

    // The words are still there, over the wave.
    await expect(page.locator('[data-testid=audio-lane]')).toContainText('sound ·')
  })

  test('trimming the start shows the part of the strip that is left', async ({ page }) => {
    await page.goto('/')
    await drop(page, 'colours.mp4', COLOURS)
    await stripsSettled(page)
    // Shift+→ on the head handle trims a whole second off the front.
    await page.locator('[data-testid=trim-in]').focus()
    await page.keyboard.press('Shift+ArrowRight')
    await expect(page.locator('[data-testid=clip]')).toHaveAttribute('data-in', '1.000')
    await stripsSettled(page)

    // The clip now STARTS on green — the first second is gone, not squeezed —
    // and every other second is exactly where it was.
    expect(named(await stripColourAt(page, 1.1))).toBe('green')
    expect(named(await stripColourAt(page, 2.5))).toBe('blue')
    expect(named(await stripColourAt(page, 3.5))).toBe('yellow')
  })

  test('zooming in keeps the strip right and fills in the finer frames', async ({ page }) => {
    await page.goto('/')
    await drop(page, 'colours.mp4', COLOURS)
    await stripsSettled(page)
    const before = Number(await page.locator('[data-testid=filmstrip]').getAttribute('data-bucket'))
    await page.getByLabel('Playhead').fill('1.5')
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect
      .poll(async () => Number(await page.locator('[data-testid=filmstrip]').getAttribute('data-bucket')))
      .toBeLessThan(before)
    await stripsSettled(page)
    expect(named(await stripColourAt(page, 1.5))).toBe('green')
  })

  test('without WebCodecs, a hidden <video> draws the same frames and the sound still shows', async ({ page }) => {
    // The fallback path, forced: what Safari before WebCodecs, and any codec
    // the decoder refuses, would take.
    await page.addInitScript(() => {
      ;(window as unknown as { __uvStrips: unknown }).__uvStrips = { video: 'element', audio: 'fallback' }
    })
    await page.goto('/')
    await drop(page, 'colours.mp4', COLOURS)
    await stripsSettled(page)
    await expect(page.locator('[data-testid=filmstrip]')).toHaveAttribute('data-path', 'element')
    expect(named(await stripColourAt(page, 0.5))).toBe('red')
    expect(named(await stripColourAt(page, 1.5))).toBe('green')
    expect(named(await stripColourAt(page, 2.5))).toBe('blue')
    expect(named(await stripColourAt(page, 3.5))).toBe('yellow')

    await expect(page.locator('[data-testid=waveform]')).toHaveAttribute('data-state', 'done', { timeout: 20_000 })
    expect(await waveAt(page, 0.5)).toBeGreaterThan(0.35)
    expect(await waveAt(page, 2.5)).toBeLessThan(0.15)

    // The fallback's object URL is revoked when its run ends.
    await expect.poll(async () => (await stats(page)).urlsOpen).toBe(0)
  })

  test('removing a clip, or starting again, closes every thumbnail', async ({ page }) => {
    await page.goto('/')
    await drop(page, 'colours.mp4', COLOURS)
    await stripsSettled(page)
    expect((await stats(page)).bitmapsOpen).toBeGreaterThan(0)

    // A cut leaves two clips of one file: they share its frames.
    await page.getByLabel('Playhead').fill('2')
    await page.getByRole('button', { name: /^Cut at / }).click()
    await expect(page.locator('[data-testid=clip]')).toHaveCount(2)
    await stripsSettled(page)
    expect(named(await stripColourAt(page, 2.5, 1))).toBe('blue')

    // Deleting one keeps the file (the other clip still uses it)…
    await page.locator('[data-testid=clip]').nth(1).locator('[data-clip]').click()
    await page.keyboard.press('Delete')
    await expect(page.locator('[data-testid=clip]')).toHaveCount(1)
    expect((await stats(page)).bitmapsOpen).toBeGreaterThan(0)

    // …deleting the last gives every bitmap back.
    await page.locator('[data-testid=clip]').first().locator('[data-clip]').click()
    await page.keyboard.press('Delete')
    await expect.poll(async () => (await stats(page)).bitmapsOpen).toBe(0)
    expect((await stats(page)).urlsOpen).toBe(0)
  })

  test('Hide timeline thumbnails, in Tune this app, takes them away and gives the memory back', async ({ page }) => {
    await page.goto('/')
    await drop(page, 'colours.mp4', COLOURS)
    await stripsSettled(page)

    await openTuneThisApp(page)
    const box = page.locator('[data-testid=pref-hide-strips] input[type=checkbox]')
    // Suite rule: every tick box starts unticked — here, unticked is "shown".
    await expect(box).not.toBeChecked()
    await expect(page.locator('[data-testid=pref-hide-strips]')).toContainText('Hide timeline thumbnails')
    await box.check()

    await expect(page.locator('[data-testid=filmstrip]')).toHaveCount(0)
    await expect(page.locator('[data-testid=waveform]')).toHaveCount(0)
    await expect.poll(async () => (await stats(page)).bitmapsOpen).toBe(0)
    // The plain block is the editor as it was: name and sound words intact.
    await expect(page.locator('[data-testid=video-lane]')).toContainText('colours.mp4')
    await expect(page.locator('[data-testid=audio-lane]')).toContainText('sound ·')

    // It survives a reload (it is a preference), and unticking brings them back.
    await page.reload()
    await drop(page, 'colours.mp4', COLOURS)
    await expect(page.locator('[data-testid=clip]')).toHaveCount(1)
    await expect(page.locator('[data-testid=filmstrip]')).toHaveCount(0)
    await openTuneThisApp(page)
    await page.locator('[data-testid=pref-hide-strips] input[type=checkbox]').uncheck()
    await stripsSettled(page)
  })
})
