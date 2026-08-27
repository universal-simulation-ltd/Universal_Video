import Honesty from './Honesty'
import { hrefFor, navigate } from '../lib/route'

/**
 * `/more-info` — the spec sheet, on a page of its own.
 *
 * It used to sit under the editor, where ten facts about what the app *cannot*
 * do were the last thing on a screen somebody had come to cut a video on. The
 * owner moved it here (2026-08-27) and put the way in on the actions dropdown.
 *
 * ⚠️ **Getting here must not reload the tab.** The sources on the timeline are
 * `File` handles held in this tab and there is nowhere else they could come
 * from, so a full navigation would silently throw away the user's edit for the
 * crime of reading the small print. The links are real `<a href>`s — for
 * middle-click, "open in new tab" and crawlers — whose ordinary click is
 * intercepted and turned into a `pushState`. See `lib/route.ts`.
 *
 * The page is deliberately NOT a modal. It is linkable, it is in the sitemap,
 * and the back button works, none of which a dialog gives you.
 */
export default function MoreInfo() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <BackLink />

      <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl dark:text-slate-100">
        More about Universal Video
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">
        Everything below is either a limit of the browser or a decision we made
        on purpose, and each one has a reason you can check. Nothing here is a
        roadmap: it is what the app does and does not do today.
      </p>

      <div className="mt-6">
        <Honesty />
      </div>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-[13px] leading-relaxed dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
          Where the work happens
        </h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Your file is opened, decoded, composited and re-encoded by your own
          browser, in this tab. There is no server in the picture because there
          is no picture of a server — nothing is fetched to make it work, so
          there is nothing to intercept and nothing to take our word for. Open
          your browser’s network tab and watch.
        </p>
        <p className="mt-3 text-slate-600 dark:text-slate-400">
          The codecs are the browser’s own, through WebCodecs. Reading and
          writing the MP4 container is ours, and it is open source:{' '}
          <a
            href="https://github.com/universal-simulation-ltd/Universal_Video"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-orange-700 underline underline-offset-2 hover:text-orange-800 dark:text-orange-400"
          >
            the app
          </a>{' '}
          and{' '}
          <a
            href="https://www.npmjs.com/package/@unisim/media"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-orange-700 underline underline-offset-2 hover:text-orange-800 dark:text-orange-400"
          >
            @unisim/media
          </a>
          , the package it shares with{' '}
          <a
            href="https://opensource.unisim.co.uk/converter"
            className="font-medium text-orange-700 underline underline-offset-2 hover:text-orange-800 dark:text-orange-400"
          >
            Universal Converter
          </a>
          .
        </p>
      </section>

      <div className="mt-6">
        <BackLink />
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <a
      href={hrefFor('editor')}
      onClick={(e) => {
        // Modified clicks are the user asking the BROWSER to do something —
        // a new tab, a new window, a download. Intercepting those is taking
        // away a gesture that has meant the same thing for thirty years.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        navigate('editor')
      }}
      className="inline-flex items-center gap-1.5 rounded text-[13px] font-semibold text-orange-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:text-orange-400"
    >
      <span aria-hidden>←</span> Back to the editor
    </a>
  )
}
