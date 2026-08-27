/**
 * The app's two pages, without a router.
 *
 * Universal Video has one screen and has never needed routing. It needs exactly
 * one more page now — the spec sheet, which used to sit under the editor and is
 * too long to live there — so this is a path check and a `pushState`, not a
 * dependency.
 *
 * ── Why a real path and not a hash ───────────────────────────────────────────
 *
 * `public/_redirects` already ends in an SPA fallback (`/video/* → /index.html
 * 200`), so `/video/more-info` serves the shell and this file reads the
 * pathname off it. That makes the page linkable, crawlable and sitemap-able,
 * which `#more-info` would not be.
 *
 * ⚠️ **Navigation must NOT reload the page.** A reload takes the timeline with
 * it — the sources are `File` handles held in this tab and there is nowhere
 * else they could come from — so somebody who opens "More info" mid-edit and
 * comes back must find their cuts still there. Hence `pushState` and a
 * re-render, never an `<a href>` the browser follows. The link still carries a
 * real `href` for middle-click, "open in new tab" and crawlers; `navigate()`
 * calls `preventDefault()` on the ordinary click.
 *
 * ⚠️ **`BASE_URL` is not `/`.** Vite serves this app at `/video/` in production
 * and `/` in dev, so every path here is derived from `import.meta.env.BASE_URL`
 * rather than written down. Hard-coding `/video/` breaks every dev preview and
 * every Playwright run.
 */

export type Route = 'editor' | 'more-info'

/** The one path segment that is not the editor. */
const MORE_INFO = 'more-info'

/** Fired after `navigate()`, because `pushState` does not fire `popstate`. */
export const NAVIGATED = 'unisim:navigated'

function withSlash(base: string): string {
  return base.endsWith('/') ? base : base + '/'
}

/** Which page a pathname asks for. Anything unrecognised is the editor. */
export function routeFor(pathname: string, base: string): Route {
  const root = withSlash(base)
  const rest = pathname.startsWith(root) ? pathname.slice(root.length) : pathname.replace(/^\//, '')
  // Tolerant of a trailing slash: `/video/more-info` and `/video/more-info/`
  // are the same page, and a link written either way must not silently land on
  // the editor.
  return rest.replace(/\/+$/, '') === MORE_INFO ? 'more-info' : 'editor'
}

/** The path a route lives at. */
export function pathFor(route: Route, base: string): string {
  const root = withSlash(base)
  return route === 'more-info' ? root + MORE_INFO : root
}

export function currentRoute(base: string = import.meta.env.BASE_URL): Route {
  return routeFor(window.location.pathname, base)
}

export function hrefFor(route: Route, base: string = import.meta.env.BASE_URL): string {
  return pathFor(route, base)
}

/**
 * Go to a page without reloading — see the warning at the top of this file.
 *
 * The scroll reset is deliberate: `pushState` leaves the viewport where it was,
 * so opening a page from a menu at the top of a long editor would otherwise
 * land halfway down the new page with no visible heading.
 */
export function navigate(route: Route, base: string = import.meta.env.BASE_URL): void {
  const path = pathFor(route, base)
  if (window.location.pathname !== path) {
    window.history.pushState({ route }, '', path)
  }
  window.dispatchEvent(new CustomEvent(NAVIGATED))
  window.scrollTo({ top: 0 })
}
