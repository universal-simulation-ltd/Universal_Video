// What this app deliberately cannot do, on the page rather than only in the
// README. Every row is either a browser limit or a decision, and each one has a
// reason a user can check.
//
// The rule these are drawn from: one input file, one output file, one setting
// applied to the whole file, and no time axis beyond a single in/out pair. A
// feature needing a second input, a second region of time, or a canvas the user
// draws on is an editor, and this is not one.
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
        <Row term="Doesn’t edit">
          No timeline, no joining clips, no filters, no text or watermarks, no
          speed ramps. This app answers “make this file smaller or different”. It
          does not answer “make this a different video”.
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
          The finished file is assembled in memory before you save it, so there
          is a real limit — roughly a gigabyte or so of <em>output</em> on a
          desktop, less on a phone. That is why the size is worked out and shown
          before you press anything, and why a file that won’t fit is refused
          up front rather than half way through.
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
