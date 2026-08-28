import { createContext, useContext, useId, useMemo, useState } from 'react'
import { summarise } from '../lib/summary'

// What this app deliberately cannot do, on the site rather than only in the
// README. Every row is either a browser limit or a decision, and each one has a
// reason a user can check.
//
// ⚠️ **This no longer renders on the editor page** (owner, 2026-08-27). It sat
// under the timeline, where ten facts about what the app *cannot* do were the
// last thing on screen after a working editor — and where nobody editing a
// video was reading them. It lives on `/more-info` now, reached from the
// actions dropdown, which is also why the rows can be opened all at once: on a
// page of its own there is room to read, and a reader who navigated HERE wants
// the detail rather than a scannable column.
//
// ⚠️ The rule this list used to be drawn from — "one input, one output, no time
// axis; a feature needing a second input is an editor and this is not one" — is
// no longer true, and the row that said so has been rewritten rather than
// quietly left up. It IS an editor now: a timeline, several sources, cuts,
// stacked tracks and transitions. What has NOT changed is everything below
// about uploading, the memory ceiling and the browsers this works in, and the
// new rows say where the editing stops.
//
// **Every row is collapsed to a sentence and opens on click** (2026-08-12).
// This box moved into the right-hand column of a two-column front door, next to
// the drop ring, and nine paragraphs in a ~330px column made the page a wall of
// text — the ring is what somebody arrives to use, and it was losing. So each
// row now leads with a written `summary` (one sentence, two lines at that
// width) and keeps its full text behind a disclosure. Nothing was deleted;
// every word below is still on the page, one click away.
//
// Two things worth knowing before you edit a row:
//  • The summary is WRITTEN, not sliced off the front of the full text — the
//    full text is rich (bold, a link, `<em>`) and a character count through JSX
//    would cut a tag in half. `summarise()` still caps it, as a guard against a
//    summary growing past its line; see `lib/summary.ts` for why it is a guard
//    and not the mechanism.
//  • The whole line is the button, not the ellipsis. An ellipsis is a ~10px
//    target and reads as nothing to a screen reader; the row carries a real
//    `aria-expanded` and its accessible name is the summary.
//
// ⚠️ This was a `<dl>` of `<dt>`/`<dd>` pairs and can't go back to being one.
// A disclosure needs a `<button>` next to the term, and inside a `<dl>` the
// only permitted children are `<dt>`, `<dd>` and a `<div>` wrapping them — a
// button is not valid there. It is a `<ul>` of eleven facts instead.
/**
 * Whether a row is open, held for all of them at once so "Open all" can exist.
 *
 * ⚠️ It is a DEFAULT plus a set of exceptions, not a list of open rows, and
 * that is deliberate: a list would have to be kept in step with the ten `<Row>`
 * elements below by hand, and the failure mode of that drifting is an "Open
 * all" that silently misses a row somebody later added. `openByDefault XOR
 * flipped.has(term)` needs no list at all, so there is nothing to keep in step.
 */
interface RowState {
  isOpen(term: string): boolean
  toggle(term: string): void
}

const Rows = createContext<RowState | null>(null)

export default function Honesty() {
  const [openByDefault, setOpenByDefault] = useState(false)
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set())

  const state = useMemo<RowState>(
    () => ({
      isOpen: (term) => openByDefault !== flipped.has(term),
      toggle: (term) =>
        setFlipped((current) => {
          const next = new Set(current)
          if (!next.delete(term)) next.add(term)
          return next
        }),
    }),
    [openByDefault, flipped],
  )

  const setAll = (open: boolean) => {
    setOpenByDefault(open)
    setFlipped(new Set())
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 text-[13px] leading-relaxed dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
          What it does, and what it deliberately doesn’t
        </h2>
        <button
          type="button"
          onClick={() => setAll(!openByDefault)}
          className="rounded text-[12px] font-semibold text-orange-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:text-orange-400"
        >
          {openByDefault ? 'Close all' : 'Open all'}
        </button>
      </div>
      <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-500">
        Eleven straight answers. Open one for the reasoning.
      </p>

      <Rows.Provider value={state}>
      <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
        {/* Edits and Reframes lead, because they are what the app is for — the
            formats it reads and writes matter, but they are the small print of
            a tool, not its purpose (owner, 2026-08-13). */}
        <Row
          term="Edits"
          summary="A timeline: trim, cut, slide, snap, stack tracks, intro and outro cards, crossfades."
        >
          A timeline: trim either end of a clip, cut at the playhead, delete,
          slide clips around, stack them on more than one track, put an image or
          a video on the front or the end, and crossfade or fade to black
          between them. A clip carries its own sound, so cutting the picture
          cuts the sound at the same instant — they cannot come apart. Dragging
          a clip <strong className="font-semibold">snaps</strong> it to the
          clips beside it, to the playhead and to the start of the movie, so two
          clips join cleanly instead of overlapping by a pixel; hold{' '}
          <kbd className="rounded border border-slate-300 px-1 text-[11px] dark:border-slate-600">Alt</kbd>{' '}
          to place one freely, or use the arrow keys, which never snap.
        </Row>

        <Row
          term="Splits into files"
          summary="Every cut can come out as its own MP4, the whole set in one zip."
        >
          Cut the video wherever you want it split, then ask for{' '}
          <strong className="font-semibold">separate files</strong>: each piece
          is written as its own MP4 and they come down together as one .zip,
          numbered so they sort back into the order you cut them. The settings
          below apply to every piece — there is nothing to set up per file.{' '}
          <strong className="font-semibold">A crossfade goes in the piece it
          starts in</strong>, so the piece you were watching ends with the
          dissolve and the next one begins after it — play them back to back
          and you get the edit, with no second written twice. What is still
          refused is a clip stacked on a second track: that really does play at
          the same moment as another, and no order of files reproduces it.{' '}
          <strong className="font-semibold">On Chrome and Edge you are asked
          where to put the .zip first</strong>, and each piece is written into
          it as it finishes rather than waiting in this tab for the rest — so
          the batch can be as long as you like, even though no single piece can
          be. Other browsers build it here, where it counts against the same
          ceiling as everything else. Either way, if one piece fails the ones
          before it are kept and the missing ones are named.
        </Row>

        <Row
          term="Reframes"
          summary="Pick the output shape; anything else is centred in it, the rest filled black."
        >
          Pick the shape the movie is written at — the size it was filmed,
          1920×1080, 1080×1920, square, or a size you type. Anything that isn’t
          that shape is <strong className="font-semibold">centred in it and the
          rest filled black</strong>: an upright phone clip in a 1920×1080 frame
          keeps all of its picture and gains a black bar down each side.
        </Row>

        <Row
          term="Doesn’t edit"
          summary="No filters, colour, text, speed ramps or keyframes — and reframing never crops."
        >
          No filters or colour, no text, titles or watermarks, no speed ramps, no
          keyframes, and no detaching a clip’s audio from its picture. Transitions
          are crossfade and fade to black — the two that are honestly renderable
          here — and there is no library of wipes behind them. Reframing
          letterboxes and never crops: there is no zoom-to-fill, and no moving or
          scaling a clip inside the frame.
        </Row>

        <Row term="Reads" summary="MP4, M4V and MOV — not MKV, WebM, AVI or WMV.">
          MP4, M4V and MOV. <strong className="font-semibold">Not MKV, WebM, AVI or WMV</strong>, and
          not fragmented MP4. MKV needs a different container reader; AVI and WMV
          need one <em>and</em> a codec the browser doesn’t have, so a reader would
          buy a different error message rather than a working conversion.
        </Row>

        <Row
          term="Writes"
          summary="MP4 — H.264 with AAC sound, at whichever of three sizes you pick."
        >
          MP4 — H.264 video with AAC sound, which plays on everything. One output
          format, because it is the one that always works. How hard it is squeezed
          is yours to choose: three quality settings, and the size the file will
          come out at is worked out and shown on the button{' '}
          <em>before</em> you press it. Dropping one video and pressing that
          button is the whole “make this smaller” job.
        </Row>

        <Row term="Doesn’t record" summary="Screen and webcam capture is Universal Recorder’s job.">
          Screen and webcam capture is{' '}
          <a
            href="https://opensource.unisim.co.uk/recorder"
            className="font-medium text-orange-700 underline underline-offset-2 hover:text-orange-800 dark:text-orange-400"
          >
            Universal Recorder
          </a>
          . Adjacent products shouldn’t grow into each other.
        </Row>

        <Row
          term="Doesn’t upload — ever"
          summary="No server fallback for the big ones, and there never will be."
        >
          There is no “we’ll do the big ones on our server” fallback, and there
          will not be one. It is the whole claim; one exception would make every
          other sentence here false. Open your browser’s network tab and watch:
          nothing goes out.
        </Row>

        <Row
          term="Skips what you can’t see"
          summary="A clip hidden behind another isn’t drawn — and if it’s silent too, it isn’t decoded at all."
        >
          Two clips stacked on separate tracks are two videos being decoded at
          once, which is what makes a preview stutter on a modest machine. So a
          clip completely hidden behind another is not drawn, and if it is
          silent as well as invisible it is stopped altogether. It has to be{' '}
          <em>completely</em> hidden to count: a clip of a different shape sits
          in the middle of the frame with black down the sides, and that black
          is not black — it is whatever is underneath — so it hides nothing.
          Neither does a clip part-way through a crossfade, because you can see
          through it. And a hidden clip you can still <em>hear</em> keeps
          playing: putting a shot over a running voiceover is an edit, not a
          mistake.
        </Row>

        <Row
          term="Has a ceiling"
          summary="Every clip is held in memory, so an edit that won’t fit is refused up front."
        >
          Every clip on the timeline is read into memory in full, and the
          finished file is assembled there too — so a five-clip edit costs five
          sources plus the output, not one. That is a real limit, roughly a
          gigabyte or so of <em>output</em> on a desktop and less on a phone. It
          is why the size is worked out and shown before you press anything, and
          why an edit that won’t fit is refused up front rather than half way
          through. The one way past it is{' '}
          <strong className="font-semibold">separate files on Chrome or
          Edge</strong>: those go straight into a file you pick, so only one
          piece is ever held and the batch itself has no length limit.
        </Row>

        <Row
          term="Needs the right browser"
          summary="Chrome and Edge. Firefox has no H.264 encoder; Safari 16.4+ untested."
        >
          Chrome and Edge, which is where this is tested. Safari 16.4+ has
          WebCodecs and ought to work, but we have not run it there and would
          rather say so than let you find out. Firefox has no WebCodecs H.264
          <em> encoder</em> yet, so it is told plainly on arrival rather than at
          the end of a long wait — and whatever browser you bring, support is
          probed before anything runs.
        </Row>
      </ul>
      </Rows.Provider>
    </section>
  )
}

function Row({
  term,
  summary,
  children,
}: {
  term: string
  summary: string
  children: React.ReactNode
}) {
  // Read from the provider rather than taken as props, so the ten call sites
  // below did not each have to grow two more attributes to gain "Open all".
  const rows = useContext(Rows)
  const open = rows?.isOpen(term) ?? false
  const line = summarise(summary)
  const panelId = useId()

  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <button
        type="button"
        onClick={() => rows?.toggle(term)}
        aria-expanded={open}
        aria-controls={panelId}
        className="group flex w-full items-start gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
      >
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-slate-800 dark:text-slate-200">{term}</span>
          <span className="text-slate-400 dark:text-slate-600"> — </span>
          <span className="text-slate-600 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-200">
            {line.text}
          </span>
        </span>
        {/* Rotates rather than swapping glyph, so the control doesn't reflow
            the row when it opens. */}
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className={`mt-1 h-3 w-3 shrink-0 text-slate-400 transition-transform group-hover:text-orange-600 ${open ? 'rotate-90' : ''}`}
        >
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div id={panelId} className="mt-1.5 text-slate-600 dark:text-slate-400">
          {children}
        </div>
      )}
    </li>
  )
}
