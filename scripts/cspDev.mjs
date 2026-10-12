// ── Content-Security-Policy in dev ───────────────────────────────────────────
// The production policy lives in `public/_headers` (Cloudflare Pages applies
// it), and nothing else serves it — so without this the dev server, and every
// e2e that runs against it, would never meet the policy at all. This reads the
// policy out of `_headers` (one source of truth) and serves it, Report-Only,
// on every page the dev server answers, plus what dev alone needs: Vite's
// inline react-refresh preamble and its HMR websocket. Violations are POSTed
// to `/__csp-report` and appended, one JSON line each, to $CSP_REPORT_LOG when
// it is set.
//
// Plain JavaScript (typed by cspDev.d.mts) because this repo's config is
// type-checked without Node's type definitions.
import { appendFileSync, readFileSync } from 'node:fs'

export function cspDev() {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
  const line = headers.split('\n').find((l) => /^\s*Content-Security-Policy(-Report-Only)?:/.test(l) && /default-src/.test(l))
  const policy = line ? line.slice(line.indexOf(':') + 1).trim() : ''
  const dev = policy
    // Report-Only can't carry frame-ancestors (the browser warns and ignores it).
    .replace(/;\s*frame-ancestors[^;]*/, '')
    .replace(/script-src ([^;]*)/, "script-src $1 'unsafe-inline'")
    .replace(/connect-src ([^;]*)/, 'connect-src $1 ws: wss:')
  return {
    name: 'csp-dev',
    apply: 'serve',
    configureServer(server) {
      if (!policy) return
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/__csp-report')) {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', () => {
            const log = process.env.CSP_REPORT_LOG
            if (log) appendFileSync(log, body.replace(/\n/g, ' ') + '\n')
            res.statusCode = 204
            res.end()
          })
          return
        }
        res.setHeader('Content-Security-Policy-Report-Only', `${dev}; report-uri /__csp-report`)
        next()
      })
    },
  }
}
