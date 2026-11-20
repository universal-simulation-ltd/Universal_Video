import { test, expect, type Browser, type Page, type Route, type Request } from '@playwright/test'

// Tune this app's own switch follows the account (James, 2026-10-30: "mobile
// app and web app settings in tune this app should be saved and synced to
// their account … Global rule"; @unisim/sdk 0.232.0 createSyncedSettings,
// src/stores/prefsStore.ts).
//
// Supabase is mocked at the network: every /auth/v1, /rest/v1 and
// /functions/v1 request is answered here, and `user_app_prefs` is ONE table in
// this file, so two browser contexts signed in as the same person are two
// devices on one account. A signed-in context carries a made-up session in
// localStorage ('universal-suite-auth'), so the SDK's real sync runs.
//
// Chromium only: it is about the app and the SDK, not the engine.

type Row = { user_id: string; app: string; data: { at: number; values: Record<string, unknown> } & Record<string, unknown> }

const ROW = 'tune-app:video'
const STORE_KEY = 'unisim-video-prefs'
let table: Record<string, Record<string, unknown>> = {}
let upserts: Row[] = []
const rowUps = () => upserts.filter((u) => u.app === ROW)

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
function sessionFor(uid: string) {
  const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 3600
  const user = {
    id: uid, aud: 'authenticated', role: 'authenticated', email: `${uid}@example.invalid`,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
    created_at: '2026-01-01T00:00:00Z', is_anonymous: false,
  }
  const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp, role: 'authenticated', aal: 'aal1', email: user.email, session_id: `s-${uid}` })}.sig`
  return { access_token, refresh_token: `r-${uid}`, token_type: 'bearer', expires_in: 365 * 24 * 3600, expires_at: exp, user }
}
function uidOf(request: Request): string | null {
  const token = (request.headers().authorization ?? '').replace(/^Bearer\s+/i, '')
  try { return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()).sub ?? null } catch { return null }
}

async function answer(route: Route) {
  const req = route.request()
  const url = new URL(req.url())
  const path = url.pathname
  const uid = uidOf(req)
  const wantsObject = (req.headers().accept ?? '').includes('vnd.pgrst.object')
  if (path.startsWith('/auth/v1/user')) {
    return uid ? route.fulfill({ json: sessionFor(uid).user }) : route.fulfill({ status: 401, json: { message: 'no session' } })
  }
  if (path.startsWith('/auth/v1/')) return route.fulfill({ json: {} })
  if (path === '/rest/v1/user_app_prefs') {
    if (req.method() === 'POST') {
      for (const row of ([] as Row[]).concat(JSON.parse(req.postData() ?? '[]'))) {
        upserts.push(row)
        table[row.user_id] = { ...(table[row.user_id] ?? {}), [row.app]: row.data }
      }
      return route.fulfill({ status: 201, body: '' })
    }
    const eq = url.searchParams.get('app')
    let rows = Object.entries(uid ? (table[uid] ?? {}) : {}).map(([app, data]) => ({ app, data, user_id: uid }))
    if (eq?.startsWith('eq.')) rows = rows.filter((r) => r.app === eq.slice(3))
    if (wantsObject) return rows[0] ? route.fulfill({ json: rows[0] }) : route.fulfill({ status: 406, json: { code: 'PGRST116' } })
    return route.fulfill({ json: rows })
  }
  if (path.startsWith('/rest/v1/rpc/')) return route.fulfill({ json: null })
  if (path.startsWith('/rest/v1/')) return wantsObject ? route.fulfill({ status: 406, json: { code: 'PGRST116' } }) : route.fulfill({ json: [] })
  return route.fulfill({ json: {} })
}

async function device(browser: Browser, baseURL: string, { uid = null as string | null, seed = {} as Record<string, string> } = {}) {
  const context = await browser.newContext({ baseURL })
  await context.route(/\/(auth|rest|functions|storage)\/v1\//, answer)
  await context.route(/\/realtime\/v1\//, (r) => r.abort())
  await context.addInitScript(([session, seed]) => {
    if (sessionStorage.getItem('tune-sync:seeded')) return
    sessionStorage.setItem('tune-sync:seeded', '1')
    if (session) localStorage.setItem('universal-suite-auth', JSON.stringify(session))
    for (const [k, v] of Object.entries(seed as Record<string, string>)) localStorage.setItem(k, v)
  }, [uid ? sessionFor(uid) : null, seed] as const)
  const page = await context.newPage()
  return { page, close: () => context.close() }
}

const box = (page: Page) => page.locator('[data-testid=pref-hide-strips] input[type=checkbox]')

async function open(page: Page) {
  await page.goto('/')
  await page.waitForTimeout(1500)
}

/** The SDK's openTuneThisApp(), from outside the bundle. */
async function tune(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as Record<string, unknown>).__unisimTuneThisAppRequested = true
    window.dispatchEvent(new CustomEvent('unisim:open-tune-this-app'))
  })
  await expect(box(page)).toBeVisible()
}

async function resetDefaults(page: Page) {
  await page.locator('[data-testid="unisim-prefs-reset"] button:has-text("Reset to defaults")').first().click()
  await page.locator('[data-testid="unisim-prefs-reset"] button', { hasText: /^Reset$/ }).first().click()
  await page.waitForTimeout(600)
}

test.describe('Tune this app follows the account', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'about the app and the SDK, not the engine')
  test.beforeEach(() => { table = {}; upserts = [] })

  test('signed out: the switch persists on this device and nothing is sent', async ({ browser, baseURL }) => {
    const a = await device(browser, baseURL!)
    await open(a.page)
    await tune(a.page)
    await expect(box(a.page)).not.toBeChecked()
    await box(a.page).check()
    await expect.poll(() => a.page.evaluate((k) => localStorage.getItem(k), STORE_KEY)).toBe('{"hideStrips":true}')
    await open(a.page)
    await tune(a.page)
    await expect(box(a.page)).toBeChecked()
    expect(rowUps()).toHaveLength(0)
    await a.close()
  })

  test('a choice from before is kept, and not sent until it changes', async ({ browser, baseURL }) => {
    const a = await device(browser, baseURL!, { uid: 'u-old', seed: { [STORE_KEY]: '{"hideStrips":true}' } })
    await open(a.page)
    await tune(a.page)
    await expect(box(a.page)).toBeChecked()
    expect(rowUps()).toHaveLength(0)
    await a.close()
  })

  test('signed in: two devices converge on the newest, and Reset follows', async ({ browser, baseURL }) => {
    const a = await device(browser, baseURL!, { uid: 'u1' })
    const b = await device(browser, baseURL!, { uid: 'u1' })
    await open(a.page)
    expect(rowUps()).toHaveLength(0)
    await tune(a.page)
    await box(a.page).check()
    await expect.poll(() => rowUps().length).toBe(1)
    const first = rowUps()[0]
    expect(first.user_id).toBe('u1')
    expect(Object.keys(first.data).sort()).toEqual(['at', 'values'])
    expect(first.data.values).toEqual({ hideStrips: true })

    await open(b.page)
    await tune(b.page)
    await expect(box(b.page)).toBeChecked()
    expect(rowUps()).toHaveLength(1)
    await box(b.page).uncheck()
    await expect.poll(() => rowUps().length).toBe(2)

    await open(a.page)
    await tune(a.page)
    await expect(box(a.page)).not.toBeChecked()
    await box(a.page).check()
    await expect.poll(() => rowUps().length).toBe(3)
    await resetDefaults(a.page)
    await expect.poll(() => rowUps().at(-1)?.data.values.hideStrips).toBe(false)

    await open(b.page)
    await tune(b.page)
    await expect(box(b.page)).not.toBeChecked()
    const before = rowUps().length
    await open(a.page)
    await open(b.page)
    expect(rowUps()).toHaveLength(before)
    await a.close()
    await b.close()
  })
})
