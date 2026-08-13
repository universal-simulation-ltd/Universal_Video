import { useEffect } from 'react'
import { DropRing, UniversalAppsNavBar, UpdateNotice } from '@unisim/sdk'
import UsageTracker from './UsageTracker'
import AppMenu from './components/Header/AppMenu'
import ProductLogo from './components/Header/ProductLogo'
import DropZone from './components/DropZone'
import SourceBin from './components/SourceBin'
import Player from './components/Player'
import Toolbar from './components/Toolbar'
import TimelineView from './components/TimelineView'
import Inspector from './components/Inspector'
import ExportPanel from './components/ExportPanel'
import Progress from './components/Progress'
import ResultCard from './components/ResultCard'
import Honesty from './components/Honesty'
import { useEditorStore } from './stores/editorStore'

// The single page container. The navbar (via the SDK's `contentClassName`), the
// page body and the footer all share it, so the suite switcher lines up with
// the left edge of the page content — and the profile/changelog cluster with
// its right edge — at every breakpoint.
//
// Without this the navbar falls back to the SDK's standalone default: a fixed
// 1280px row with the profile cluster pinned 12px off the VIEWPORT edge. At
// 1440px that put the bar at 80–1360 over content at 208–1232, overhanging it
// by ~128px on each side. Universal PDF and Images are the pattern this copies.
export const CONTAINER = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8'

const REPO_URL = 'https://github.com/universal-simulation-ltd/Universal_Video'

/**
 * One screen. The editor IS the app.
 *
 * There is no "compress mode" and no "edit mode" to choose between: a dropped
 * file becomes a clip on a timeline, and making it smaller is exporting a
 * timeline with one clip on it. That is why the fast path stayed fast — one
 * drag, one click.
 *
 * The COPY was re-pointed on 2026-08-13 (owner): clipping, cutting and changing
 * the frame is what this is for, and compressing is something it also does. The
 * old headline — "Compress a video without uploading it" — was the search
 * phrase the app was founded on and now lives in the meta description instead;
 * see the comment in `index.html` before putting it back at the top.
 */
/**
 * The product mark, made focusable so the suite switcher still has a keyboard
 * way in.
 *
 * The home `<a>` this replaces was the ONLY focusable thing in the identity
 * cluster, and `SuiteSwitcher` opens on `onFocusCapture` — so dropping the link
 * without this would have fixed the tap and quietly taken the Tab key away.
 *
 * ⚠️ `role="button"` on a span rather than a real `<button>`, which is the one
 * thing here that looks like a mistake and isn't: the switcher's wrapper bails
 * out of its toggle on `target.closest('a, button')`, a selector matching the
 * TAG, not the role. A real button would be swallowed by the same rule that
 * swallowed the anchor. The key handler re-dispatches as a click for the same
 * reason — that is the event the wrapper is listening for.
 */
function SwitcherHandle() {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-haspopup="true"
      aria-label="Switch product"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.currentTarget.click()
        }
      }}
      className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
    >
      <ProductLogo />
    </span>
  )
}

/**
 * The one genuinely indeterminate wait in this app.
 *
 * It used to be a bare sentence; the ring is the suite's shared one (SDK
 * `DropRing`), small and in `busy`, so "something is happening" looks the same
 * here as it does in Universal Compress.
 *
 * Takes `show` rather than being called conditionally because it appears in
 * BOTH branches of the front-door/editor split below — reading a header happens
 * on arrival and again every time a clip is added mid-edit.
 */
function Reading({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-[13px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      <DropRing size={34} motion="busy" aria-hidden />
      <span>Reading the file’s header…</span>
    </div>
  )
}

export default function App() {
  const status = useEditorStore((s) => s.status)
  const error = useEditorStore((s) => s.error)
  const clips = useEditorStore((s) => s.timeline.clips.length)
  const checkSupport = useEditorStore((s) => s.checkSupport)
  const cut = useEditorStore((s) => s.cut)
  const removeSelected = useEditorStore((s) => s.removeSelected)
  const setPlaying = useEditorStore((s) => s.setPlaying)
  const playing = useEditorStore((s) => s.playing)

  // Probe H.264 encode support once, on arrival, so a Firefox visitor is told
  // before they pick a file rather than after waiting through one.
  useEffect(() => {
    void checkSupport()
  }, [checkSupport])

  // The three keys every editor has. Deliberately ignored while the focus is in
  // a field, or typing "3" into the out-point box would delete a clip.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return
      if (e.key === 'c' || e.key === 'C') cut()
      if (e.key === 'Delete' || e.key === 'Backspace') removeSelected()
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying(!playing)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cut, removeSelected, setPlaying, playing])

  const editing = clips > 0

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 dark:bg-slate-950">
      {/* No `productHomeHref`, deliberately — see SwitcherHandle below. With it
          set, the SDK wraps the logo and the product name in one home `<a>`,
          and `SuiteSwitcher`'s wrapper skips any click landing on an `<a>` or a
          `<button>` so a child link can still navigate. The result was that the
          app name opened the switcher on HOVER and navigated on CLICK — which
          on a touch screen, where there is no hover at all, meant the switcher
          could not be reached from the identity by any gesture, and a tap
          reloaded the page instead. Mid-edit that reload takes the timeline
          with it, and this app is one screen, so "home" was never anywhere
          else. Without the prop the identity is a plain span: hover opens it on
          the desktop and a tap toggles it on a phone. */}
      <UniversalAppsNavBar
        contentClassName={CONTAINER}
        product="video"
        productLogo={<SwitcherHandle />}
        actions={<AppMenu />}
        actionsLabel="Video"
        suiteSwitcherIconSrc={`${import.meta.env.BASE_URL}unisim-icon.png`}
      />

      {/* Renders nothing until this tab is genuinely running superseded code.
          See the SDK's useAppUpdate: an autoUpdate PWA hands the new worker
          control but leaves the running page on its old JavaScript. */}
      <div className={`${CONTAINER} pt-4`}>
        <UpdateNotice />
      </div>

      <UsageTracker />

      <main className={`${CONTAINER} flex-1 py-8`}>
        <header className="mb-8">
          {/* What the app is FOR, in the order it is for it: clip, cut, resize
              — and smaller as one of the things that happens on the way out.
              The old headline was the search phrase verbatim and has moved to
              the meta description; see index.html before reordering these. */}
          <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl dark:text-slate-100">
            Clip, cut and resize a video without uploading it
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Drop an MP4, M4V or MOV and it is opened right here, in this tab, by
            your own browser — with a player and a timeline. Trim it, cut it,
            stack clips, add an intro or an outro, and choose the size and shape
            it comes out at. Make it smaller too, if that is all you came for.
            No upload, no account, no size cap, no watermark and no queue.
          </p>
        </header>

        <div className="space-y-4">
          {error && (
            <div role="alert" className="rounded-2xl bg-red-50 px-5 py-4 text-[12.5px] leading-relaxed text-red-900 dark:bg-red-950/40 dark:text-red-200">
              <p className="font-semibold">That didn’t work</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {/* The front door is two columns, the shape Universal Compress and
              Universal Converter already use: the thing you came to do on the
              left, what the app is on the right. Before this, `Honesty`'s nine
              paragraphs sat UNDER the ring at full width and pushed everything
              else off the first screen — the drop target was competing with an
              essay for the same column. Beside it, and collapsed to one line a
              row, it reads as a spec sheet next to the tool.

              Both columns collapse to one below `lg`, ring first, which is the
              right order on a phone: the target, then the reading. */}
          {!editing ? (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 sm:px-8 dark:border-slate-800 dark:bg-slate-900">
                  <DropZone />
                </div>
                <Reading show={status === 'reading'} />
              </div>

              <Honesty />
            </div>
          ) : (
            <>
              <Reading show={status === 'reading'} />
              <Player />
              <Toolbar />
              <TimelineView />
              <div className="grid gap-4 lg:grid-cols-2">
                <Inspector />
                <div className="space-y-4">
                  <SourceBin />
                  {status === 'exporting' ? <Progress /> : status === 'done' ? <ResultCard /> : <ExportPanel />}
                </div>
              </div>
              <Honesty />
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className={`${CONTAINER} flex flex-row items-center gap-3 py-4 text-xs text-slate-500 sm:gap-4 dark:text-slate-400`}>
          <span>
            100% free — every feature, no paywalls. Your video never leaves this
            device. Hosted by{' '}
            <a
              href="https://www.unisim.co.uk"
              target="_blank"
              rel="noreferrer"
              className="text-slate-700 underline-offset-2 hover:text-orange-700 hover:underline dark:text-slate-300 dark:hover:text-orange-400"
            >
              UNI SIM
            </a>
          </span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Universal Video on GitHub"
            title="View source on GitHub"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d="M12 .5C5.65.5.5 5.65.5 12.02c0 5.09 3.29 9.4 7.86 10.92.57.1.78-.25.78-.55 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.18 1.82 1.18 3.08 0 4.42-2.69 5.39-5.26 5.68.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.21.66.79.55 4.57-1.52 7.86-5.83 7.86-10.92C23.5 5.65 18.35.5 12 .5z" />
            </svg>
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </footer>
    </div>
  )
}
