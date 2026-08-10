import { useEffect } from 'react'
import { DropRing, UniversalAppsNavBar } from '@unisim/sdk'
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

const REPO_URL = 'https://github.com/universal-simulation-ltd/Universal_Video'

/**
 * One screen. The editor IS the app.
 *
 * There is no "compress mode" and no "edit mode" to choose between: a dropped
 * file becomes a clip on a timeline, and compressing it is exporting a timeline
 * with one clip on it. That is why the fast path stayed fast — one drag, one
 * click, and the button still says "Compress this video" when that is what it
 * is about to do.
 */
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
      <UniversalAppsNavBar
        product="video"
        productLogo={<ProductLogo />}
        productHomeHref={import.meta.env.BASE_URL}
        actions={<AppMenu />}
        actionsLabel="Video"
        suiteSwitcherIconSrc={`${import.meta.env.BASE_URL}unisim-icon.png`}
      />

      <UsageTracker />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          {/* This exact sentence is the reason the app exists as its own front
              door rather than a tab in Universal Converter — see index.html.
              Don't reword it for style; it is the search intent verbatim. */}
          <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl dark:text-slate-100">
            Compress a video without uploading it
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Drop an MP4, M4V or MOV and it is opened right here, in this tab, by
            your own browser — with a player and a timeline. Shrink it, trim it,
            cut it, stack clips, add an intro or an outro. No upload, no account,
            no size cap, no watermark and no queue.
          </p>
        </header>

        <div className="space-y-4">
          {error && (
            <div role="alert" className="rounded-2xl bg-red-50 px-5 py-4 text-[12.5px] leading-relaxed text-red-900 dark:bg-red-950/40 dark:text-red-200">
              <p className="font-semibold">That didn’t work</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {!editing && <DropZone />}

          {/* The one genuinely indeterminate wait in this app. It used to be a
              bare sentence; the ring is the suite's shared one (SDK
              `DropRing`), small and in `busy`, so "something is happening"
              looks the same here as it does in Universal Compress. */}
          {status === 'reading' && (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-[13px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <DropRing size={34} motion="busy" aria-hidden />
              <span>Reading the file’s header…</span>
            </div>
          )}

          {editing && (
            <>
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
            </>
          )}

          <Honesty />
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex w-full max-w-5xl flex-row items-center gap-3 px-4 py-4 text-xs text-slate-500 sm:gap-4 sm:px-6 lg:px-8 dark:text-slate-400">
          <span>
            100% free — every feature, no paywalls. Your video never leaves this
            device. Hosted by{' '}
            <a
              href="https://www.unisim.co.uk"
              target="_blank"
              rel="noreferrer"
              className="text-slate-700 underline-offset-2 hover:text-orange-600 hover:underline dark:text-slate-300"
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
