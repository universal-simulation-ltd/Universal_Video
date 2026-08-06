import { defineConfig, devices } from '@playwright/test'

const PORT = 5199
const BASE_URL = `http://localhost:${PORT}`

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
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
