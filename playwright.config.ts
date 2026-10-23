import { defineConfig, devices } from '@playwright/test'

// Overridable so a second checkout (or a parallel session) can run its own.
const PORT = Number(process.env.PW_PORT) || 5199
const BASE_URL = `http://localhost:${PORT}`

// Left out on Linux (the CI runner), each with its reason. They all pass on a
// Mac; what fails is the Linux browser builds, not the app. Found on the first
// CI run (2026-10-23). Take a line out once it passes there.
const LINUX = process.platform === 'linux'
const LINUX_SKIP_CHROMIUM = [
  // Playwright's Linux Chromium has no AAC decoder (no proprietary codecs), so
  // decodeAudioData on the exported MP4 finds 0 s of sound / throws.
  /compresses a real video, and the browser reads the result back/,
  /exports a two-clip edit, and the audio ends where the picture ends/,
]
// Linux WebKit: the page closes ~18 s after load, before the file input is
// there, in every strips spec (both tries). The iPhone engine is covered on a
// Mac only until that is looked at.
const LINUX_SKIP_WEBKIT = LINUX
if (LINUX && !process.env.TEST_WORKER_INDEX) {
  for (const re of LINUX_SKIP_CHROMIUM) console.log(`skip on Linux [chromium] ${re.source}: no AAC decoder`)
  console.log('skip on Linux [webkit] strips.e2e.ts: the page closes before the file input appears')
}

// These specs drive the REAL app in a REAL Chromium and put a REAL MP4 through
// it — encoded by the browser's own H.264 encoder, muxed by our own container
// code, then read back by the browser's own demuxer. Nothing is mocked, because
// a compressor that only compiles proves nothing at all.
//
// No internet needed: there is no engine to download and no file to upload.
// Chromium only — Firefox has no WebCodecs H.264 encoder, which the app itself
// reports rather than failing at.
export default defineConfig({
  testDir: './e2e',
  // `.e2e.ts`, not `.spec.ts`, on purpose: Vitest's default include pattern is
  // `**/*.{test,spec}.*`, so a spec-named file here would be collected by
  // `npm test` and fail to even import. The extension is the boundary between
  // the two runners.
  testMatch: /.*\.e2e\.ts$/,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      grepInvert: LINUX ? LINUX_SKIP_CHROMIUM : undefined,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    // Safari's engine, for the timeline strips only: they are the one feature
    // here with a fallback path built FOR it (a seeked <video> where WebCodecs
    // is missing). The editor's export specs stay Chromium-only — see above.
    ...(LINUX_SKIP_WEBKIT
      ? []
      : [
          {
            name: 'webkit',
            testMatch: /strips\.e2e\.ts$/,
            use: {
              ...devices['Desktop Safari'],
            },
          },
        ]),
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
