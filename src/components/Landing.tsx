import { useEffect, useRef, useState } from 'react'
import { PrivacyNote } from '@unisim/sdk'
import { formatBytes, formatDuration } from '@unisim/media'
import DropZone from './DropZone'
import VideoIllustration from './VideoIllustration'
import { EDITOR_ACCEPT, useEditorStore } from '../stores/editorStore'
import { MAX_FILE_BYTES, MAX_RECENTS } from '../lib/recents'
import { useThemeStore } from '../stores/themeStore'

/**
 * The front door.
 *
 * The shape is Universal PDF's, deliberately and down to the type scale: a
 * drawing of what the app does on the left, and on the right a headline, one
 * line of lead, and ONE card read top to bottom — drop circle, recent files,
 * "or", the one-click path, then More options. Somebody arriving from PDF or
 * Images should recognise this page before they read it.
 *
 * ⚠️ **The `<h1>` is no longer the search phrase.** It said *"Clip, cut and
 * resize a video without uploading it"* — the sentence §12 of the handover
 * fought to put there — and it now says *"Videos that just work."* to match the
 * rest of the suite (owner, 2026-08-24). The phrase was NOT deleted: it is
 * still the `<title>`, the og:title and the first line of the lead below, and
 * the spec still asserts all three. Read §12 before moving it again.
 *
 * ⚠️ **"What it does, and what it deliberately doesn't" is not on this page any
 * more** (owner, same ask). `Honesty` still renders under the editor, so
 * nothing was deleted — but the front door is now the drawing, the circle and
 * the four ways in, and a nine-row spec sheet was the thing standing in front
 * of them.
 */

/** The pill every button in the card wears — PDF's, so the two cards match. */
const PILL =
  'w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors'
const PILL_IDLE =
  'border-slate-300 hover:border-orange-400 hover:bg-orange-50/40 text-slate-700 dark:border-slate-700 dark:text-slate-200 dark:hover:border-orange-500 dark:hover:bg-orange-950/30'

export default function Landing() {
  const theme = useThemeStore((s) => s.effective)
  const addFiles = useEditorStore((s) => s.addFiles)
  const compressNow = useEditorStore((s) => s.compressNow)
  const recents = useEditorStore((s) => s.recents)
  const loadRecents = useEditorStore((s) => s.loadRecents)
  const openRecent = useEditorStore((s) => s.openRecent)
  const forgetRecent = useEditorStore((s) => s.forgetRecent)
  const setIntent = useEditorStore((s) => s.setIntent)
  const supported = useEditorStore((s) => s.supported)

  const compressInputRef = useRef<HTMLInputElement>(null)
  const convertInputRef = useRef<HTMLInputElement>(null)
  const joinInputRef = useRef<HTMLInputElement>(null)
  const [loadingExample, setLoadingExample] = useState(false)
  const [dragOverCompress, setDragOverCompress] = useState(false)

  useEffect(() => {
    void loadRecents()
  }, [loadRecents])

  async function loadExample() {
    if (loadingExample) return
    setLoadingExample(true)
    try {
      const url = `${import.meta.env.BASE_URL}Example_Video.mp4`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Couldn’t load the example video (${res.status})`)
      const blob = await res.blob()
      // ⚠️ Check what came back, not just the status. Under `/video/` the app is
      // served by rewrite rules (`public/_redirects`), and a missing rule for
      // this file makes the SPA fallback answer with index.html — status 200,
      // content-type text/html, and a "file" the decoder then reports as a
      // corrupt MP4. That shipped once. If it happens again, this says which of
      // the two things is actually wrong.
      if (!blob.type.startsWith('video/') && !blob.type.startsWith('application/octet-stream')) {
        throw new Error(
          `The example video isn’t being served properly — the site returned ${blob.type || 'no type'} instead of a video. Nothing is wrong with your browser; drop a file of your own and it will work.`,
        )
      }
      await addFiles([
        new File([blob], 'Example_Video.mp4', { type: blob.type || 'video/mp4' }),
      ])
    } catch (err) {
      // The one fetch this app makes, and it is for a file it ships itself. If
      // it fails there is nothing to fall back to, so say so plainly.
      useEditorStore.setState({ error: (err as Error).message })
    } finally {
      setLoadingExample(false)
    }
  }

  // ⚠️ ONE file. Dropping several on the CIRCLE joins them into one movie,
  // which is the app's whole point — but "compress" plainly means "this one,
  // smaller", and quietly welding a stack of clips together under that label
  // would be the wrong answer to the question asked.
  function compressOne(list: FileList | File[] | null) {
    const files = Array.from(list ?? [])
    if (!files.length) return
    if (files.length > 1) {
      useEditorStore.setState({
        error:
          'Compress takes one video at a time — the first one was opened. Drop several on the circle instead and they line up one after another.',
      })
    }
    void compressNow([files[0]])
  }

  const exampleButton = (
    <button
      type="button"
      onClick={loadExample}
      disabled={loadingExample}
      className={`${PILL} ${PILL_IDLE} disabled:opacity-60 disabled:cursor-wait`}
    >
      <span aria-hidden="true">🧪</span>
      {loadingExample ? 'Opening example…' : 'Try with an example video'}
    </button>
  )

  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      {/* Below `lg` the columns stack ILLUSTRATION LAST (`order-2`): on a phone
          the headline and the circle are what somebody came for, and the
          drawing is what they look at afterwards if they look at all. */}
      <div className="order-2 flex justify-center lg:order-1">
        <VideoIllustration />
      </div>

      {/* ⚠️ `min-w-0` is load-bearing, not tidying — the same trap Universal PDF
          hit on an iPhone. A grid item defaults to `min-width: auto`, so its
          MIN-CONTENT width becomes a floor the column cannot go below, and
          `truncate` does not reduce that contribution; it only clips once a
          width is settled. One recent video with a long unbreakable name would
          otherwise set the width of this whole column and lay the headline out
          off-screen. */}
      <div className="order-1 min-w-0 lg:order-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-slate-100">
          Videos that <span className="text-orange-600 dark:text-orange-400">just work</span>.
        </h1>
        <p className="mt-3 max-w-md text-slate-600 dark:text-slate-400">
          Trim it, cut it, stack it, intro or outro it, and choose the size and
          shape it comes out at.
        </p>

        {/* One box, read top to bottom: open → recent → compress → more
            options. Universal PDF's card, in the same order, so the two apps
            teach each other. */}
        <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <DropZone />

          {/* The same slot either way — "Recent videos" once there are some,
              "Try with an example video" until then. A first-time visitor has
              nothing to be recent, so an empty list would be a dead end;
              somebody with history rarely wants the sample again, so it moves
              inside the list rather than sitting above it. */}
          {recents.length > 0 ? (
            <details className="group mt-5">
              <summary
                className={`${PILL} ${PILL_IDLE} cursor-pointer select-none list-none`}
              >
                <span aria-hidden="true">🕘</span>
                Recent videos
                <span
                  className="text-base text-slate-400 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                >
                  ⌄
                </span>
              </summary>
              <div className="mt-3">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recents.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => void openRecent(r.id)}
                        className="min-w-0 flex-1 rounded px-1 py-1 text-left hover:bg-orange-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:hover:bg-orange-950/30"
                      >
                        <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-slate-200">
                          {r.name}
                        </span>
                        <span className="block text-[11.5px] text-slate-500 dark:text-slate-400">
                          {r.durationSec > 0 && `${formatDuration(r.durationSec)} · `}
                          {r.width > 0 && `${r.width}×${r.height} · `}
                          {formatBytes(r.size)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void forgetRecent(r.id)}
                        aria-label={`Forget ${r.name}`}
                        className="shrink-0 rounded px-2 py-1 text-slate-400 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                      >
                        {/* ⚠️ An SVG, not `✕` — U+2715 has no glyph in iOS's
                            system font and WebKit does not fall back even
                            though the stack ends in `sans-serif`, so the only
                            way to forget a recent file drew as a hollow ▯?▯
                            box on the phone. See the suite landmines. */}
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                          <path d="m4 4 8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
                {/* Said out loud, because a recents list that silently loses
                    the file you cared about is worse than not having one. */}
                <p className="mt-2 px-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-500">
                  Kept in this browser — the last {MAX_RECENTS}, and nothing over{' '}
                  {formatBytes(MAX_FILE_BYTES)}. Nothing was uploaded to make this list.
                </p>
                <div className="mt-3">{exampleButton}</div>
              </div>
            </details>
          ) : (
            <div className="mt-5">{exampleButton}</div>
          )}

          <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
            <span>or</span>
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
          </div>

          {/* 1 Click Compress — open it and export it, with no stop in between.
              `data-unisim-dropzone` says out loud what this already is: a drop
              target with its own meaning, on a page whose circle is page-wide.
              It is how the SDK's hook recognises a drop another target has
              claimed, so a file let go here does not ALSO land in the circle. */}
          <button
            type="button"
            data-unisim-dropzone=""
            onClick={() => compressInputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOverCompress(true)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!dragOverCompress) setDragOverCompress(true)
            }}
            onDragLeave={(e) => {
              e.stopPropagation()
              setDragOverCompress(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOverCompress(false)
              compressOne(e.dataTransfer.files)
            }}
            className={[
              PILL,
              'mt-3',
              dragOverCompress
                ? 'border-amber-500 border-dashed bg-amber-50 text-amber-900'
                : PILL_IDLE,
            ].join(' ')}
          >
            <span aria-hidden="true">⬇</span>
            {dragOverCompress ? 'Drop to compress' : '1 Click Compress — one video, straight to smaller'}
          </button>
          <input
            ref={compressInputRef}
            data-testid="compress-input"
            type="file"
            accept={EDITOR_ACCEPT}
            hidden
            onChange={(e) => {
              compressOne(e.target.files)
              e.target.value = ''
            }}
          />

          <details
            className="group mt-3"
            onToggle={(e) => {
              if (!e.currentTarget.open) return
              const el = e.currentTarget
              requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'end' }))
            }}
          >
            <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-1 py-1 text-xs font-medium uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-300">
              <span>More options</span>
              <span
                className="ml-auto text-base text-slate-400 transition-transform group-open:rotate-180"
                aria-hidden="true"
              >
                ⌄
              </span>
            </summary>

            {/* Both of these are the SAME `addFiles` the circle calls — what
                differs is what the app does once it opens. Convert sets an
                intent the export panel reads; Join takes several files, which
                is a thing the circle does too but nobody discovers by dropping
                a stack on it. */}
            <button
              type="button"
              onClick={() => {
                setIntent('convert')
                convertInputRef.current?.click()
              }}
              className={`${PILL} ${PILL_IDLE} mt-3`}
            >
              <span aria-hidden="true">⇄</span>
              Convert — pick the size, shape and quality
            </button>
            <input
              ref={convertInputRef}
              data-testid="convert-input"
              type="file"
              accept={EDITOR_ACCEPT}
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                e.target.value = ''
                // Cancelling the dialog must not leave the intent set, or the
                // NEXT file opened would arrive with the export panel shouting.
                if (!files.length) setIntent(null)
                else void addFiles(files)
              }}
            />

            <button
              type="button"
              onClick={() => joinInputRef.current?.click()}
              className={`${PILL} ${PILL_IDLE} mt-3`}
            >
              <span aria-hidden="true">⧉</span>
              Join videos — several, one after another
            </button>
            <input
              ref={joinInputRef}
              data-testid="join-input"
              type="file"
              accept={EDITOR_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                e.target.value = ''
                if (files.length) void addFiles(files)
              }}
            />
          </details>

          {/* Last in the card, because it is the one thing here that is about
              this BROWSER rather than about the file. Probed on arrival, so a
              Firefox visitor reads it before choosing anything rather than
              after waiting through an export that cannot finish. */}
          {supported === false && (
            <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-left text-xs leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <strong className="font-semibold">This browser can’t do the encoding.</strong>{' '}
              Writing the MP4 back out needs a WebCodecs H.264 <em>encoder</em>, and this
              browser doesn’t have one — Firefox is the usual case. Chrome, Edge and
              Safari 16.4+ do. You can still open a video and edit it here, but the
              export will not run.
            </p>
          )}
        </div>

        {/* Under the card, outside the box — the suite's placement. ⚠️ `theme`
            is not optional here: the note is inline-styled, so it cannot answer
            the `.dark` class the rest of this page uses, and the RESOLVED theme
            is what it needs ('system' has already become light or dark by the
            time it reaches `effective`). */}
        <PrivacyNote
          className="mt-4"
          theme={theme}
          repo="https://github.com/universal-simulation-ltd/Universal_Video"
          proof="https://github.com/universal-simulation-ltd/Universal_Video/blob/main/PRIVACY.md"
          subject="Your video"
        />
      </div>
    </div>
  )
}
