// What this app deliberately cannot do, on the page rather than only in the
// README. Every row is either a browser limit or a decision, and each one has a
// reason a user can check.
//
// ⚠️ The rule this list used to be drawn from — "one input, one output, no time
// axis; a feature needing a second input is an editor and this is not one" — is
// no longer true, and the row that said so has been rewritten rather than
// quietly left up. It IS an editor now: a timeline, several sources, cuts,
// stacked tracks and transitions. What has NOT changed is everything below
// about uploading, the memory ceiling and the browsers this works in, and the
// new rows say where the editing stops.
export default function Honesty() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 text-[12.5px] leading-relaxed dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
        What it does, and what it deliberately doesn’t
      </h2>

      <dl className="mt-3 space-y-2.5 text-slate-600 dark:text-slate-400">
        <Row term="Reads">
          MP4, M4V and MOV. <strong className="font-semibold">Not MKV, WebM, AVI or WMV</strong>, and
          not fragmented MP4. MKV needs a different container reader; AVI and WMV
          need one <em>and</em> a codec the browser doesn’t have, so a reader would
          buy a different error message rather than a working conversion.
        </Row>
        <Row term="Writes">
          MP4 — H.264 video with AAC sound, which plays on everything. One output
          format, because it is the one that always works.
        </Row>
        <Row term="Edits">
          A timeline: trim either end of a clip, cut at the playhead, delete,
          slide clips around, stack them on more than one track, put an image or
          a video on the front or the end, and crossfade or fade to black
          between them. A clip carries its own sound, so cutting the picture
          cuts the sound at the same instant — they cannot come apart.
        </Row>
        <Row term="Doesn’t edit">
          No filters or colour, no text, titles or watermarks, no speed ramps, no
          keyframes, and no detaching a clip’s audio from its picture. Transitions
          are crossfade and fade to black — the two that are honestly renderable
          here — and there is no library of wipes behind them.
        </Row>
        <Row term="Doesn’t record">
          Screen and webcam capture is{' '}
          <a
            href="https://opensource.unisim.co.uk/recorder"
            className="font-medium text-orange-700 underline underline-offset-2 hover:text-orange-800 dark:text-orange-400"
          >
            Universal Recorder
          </a>
          . Adjacent products shouldn’t grow into each other.
        </Row>
        <Row term="Doesn’t upload — ever">
          There is no “we’ll do the big ones on our server” fallback, and there
          will not be one. It is the whole claim; one exception would make every
          other sentence here false. Open your browser’s network tab and watch:
          nothing goes out.
        </Row>
        <Row term="Has a ceiling">
          Every clip on the timeline is read into memory in full, and the
          finished file is assembled there too — so a five-clip edit costs five
          sources plus the output, not one. That is a real limit, roughly a
          gigabyte or so of <em>output</em> on a desktop and less on a phone. It
          is why the size is worked out and shown before you press anything, and
          why an edit that won’t fit is refused up front rather than half way
          through.
        </Row>
        <Row term="Needs the right browser">
          Chrome, Edge and Safari 16.4+. Firefox has no WebCodecs H.264
          <em> encoder</em> yet, so it is told plainly on arrival rather than at
          the end of a long wait.
        </Row>
      </dl>
    </section>
  )
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="sm:flex sm:gap-3">
      <dt className="shrink-0 font-semibold text-slate-800 sm:w-40 dark:text-slate-200">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}
