import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// Universal Video is served at opensource.unisim.co.uk/video in production.
// `base` + PWA scope derive from Vite's `mode`; local dev stays `/`.
//
// ⚠️ Do NOT add cross-origin isolation headers here or in the portal Worker.
// `Cross-Origin-Embedder-Policy: require-corp` blocks the SDK navbar's org
// branding logos (plain <img> loads from Supabase Storage, no CORP header we
// control), so the visible symptom is a paying customer's logo silently
// vanishing. There is nothing here that wants SharedArrayBuffer: the WebCodecs
// pipeline is already off the main thread and hardware-accelerated. §10.3.
//
// ⚠️ And do NOT add ffmpeg.wasm. The only published core is GPL-2.0-or-later
// (it bundles libx264) and its .wasm is 30.7 MiB — past Cloudflare Pages' 25 MiB
// per-file limit, so it cannot even be self-hosted here. Loading it from a CDN
// instead would put a 10 MB third-party request in the network tab of a page
// whose entire claim is that nothing leaves the device. §10.1, §10.2.
export default defineConfig(({ mode }) => {
  const BASE_PATH = mode === 'production' ? '/video/' : '/'
  return {
    base: BASE_PATH,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    resolve: {
      // Force a single React instance so @unisim/sdk's hooks share the same
      // dispatcher as the host app (see Universal QR for the rationale).
      dedupe: ['react', 'react-dom']
    },
    optimizeDeps: {
      exclude: ['@unisim/sdk']
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'unisim-icon.png', 'icon-180.png', 'icon-192.png', 'icon-512.png'],
        manifest: {
          name: 'Universal Video',
          short_name: 'UniVideo',
          description: 'Compress a video without uploading it — trim, resize and shrink MP4 in your browser',
          theme_color: '#0f172a',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: BASE_PATH,
          scope: BASE_PATH,
          icons: [
            { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'unisim-icon.png', sizes: '128x128', type: 'image/png', purpose: 'any' }
          ]
        },
        workbox: {
          navigateFallback: `${BASE_PATH}index.html`,
          // Nothing here is a wasm engine, and nothing should become one. The
          // codecs are the browser's; @unisim/media is kilobytes of container
          // code and belongs in the ordinary precache with everything else.
          //
          // The example clip is out too, and for a different reason: it is half
          // a megabyte that only someone who clicks "Try with an example video"
          // ever needs, and precaching it would make every install pay for it.
          // It is fetched on demand and works offline only if it has been used
          // before — which is the right way round for a sample.
          globIgnores: ['**/*.wasm', '**/Example_Video.mp4'],
        },
        devOptions: { enabled: false }
      })
    ]
  }
})
