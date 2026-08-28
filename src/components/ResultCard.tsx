import { formatBytes } from '@unisim/media'
import { selectRoute, useEditorStore } from '../stores/editorStore'

/**
 * What came out, and where it went.
 *
 * There are three endings now rather than one, and the card has to be honest
 * about which it is showing:
 *
 *   1. **A file in the tab** — one movie, or a zip built in memory. The Save
 *      button hands it to the browser. This is what the card has always been.
 *   2. **A file on disk** — a batch streamed straight into a handle the user
 *      picked, so it is already saved and there is nothing left to offer. The
 *      pieces are listed by name and size, but not individually savable: they
 *      were released as they were written, which is the entire reason a batch
 *      too big for the tab is possible at all.
 *   3. **A partial batch** — an encode failed part-way and the archive holds
 *      the pieces that did land. Amber rather than green, with the missing ones
 *      named. The old behaviour here was to throw the whole batch away, which
 *      is a poor answer when four of five pieces are perfectly good files.
 */
export default function ResultCard() {
  const result = useEditorStore((s) => s.result)
  const savedTo = useEditorStore((s) => s.savedTo)
  const partial = useEditorStore((s) => s.partial)
  const pieces = useEditorStore((s) => s.pieces)
  const plan = useEditorStore((s) => s.plan)
  const download = useEditorStore((s) => s.download)
  const downloadPiece = useEditorStore((s) => s.downloadPiece)
  const reset = useEditorStore((s) => s.reset)
  const route = useEditorStore(selectRoute)
  // ⚠️ Two things to check, not one. A streamed batch finishes with no `result`
  // at all — the bytes went to the file as they were made — so an early return
  // on `!result` alone would show nothing at the end of a successful export.
  if (!result && !savedTo) return null

  const size = result?.blob.size ?? savedTo?.bytes ?? 0
  const sourceBytes = plan?.sourceBytes ?? 0
  // "% smaller" is only an honest comparison when there was ONE thing to
  // compare with. Against a five-clip edit — or a zip of five files — it would
  // be arithmetic about nothing.
  const comparable = !pieces && route === 'compress' && sourceBytes > 0
  const saving = comparable ? 1 - size / sourceBytes : 0
  const predicted = plan?.estimate.bytes ?? 0
  // Whether a piece can be saved on its own. False for a streamed batch, where
  // the blob is gone by design — see `BatchPiece.file`.
  const piecesInTab = pieces?.some((piece) => piece.file !== null) ?? false

  const tone = partial
    ? {
        card: 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
        title: 'text-amber-900 dark:text-amber-100',
        body: 'text-amber-800 dark:text-amber-200',
        list: 'divide-amber-200 border-amber-200 dark:divide-amber-900 dark:border-amber-900',
        action: 'bg-amber-700 hover:bg-amber-800',
        quiet: 'text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-slate-800',
        footer: 'text-amber-800/80 dark:text-amber-200/70',
      }
    : {
        card: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30',
        title: 'text-emerald-900 dark:text-emerald-100',
        body: 'text-emerald-800 dark:text-emerald-200',
        list: 'divide-emerald-200 border-emerald-200 dark:divide-emerald-900 dark:border-emerald-900',
        action: 'bg-emerald-700 hover:bg-emerald-800',
        quiet: 'text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-slate-800',
        footer: 'text-emerald-800/80 dark:text-emerald-200/70',
      }

  return (
    <div className={`rounded-2xl border p-5 ${tone.card}`}>
      <p className={`text-[15px] font-semibold ${tone.title}`}>
        {partial
          ? `Stopped after ${partial.written} of ${partial.total} — the ${partial.written} that finished are saved`
          : pieces
            ? `Done — ${pieces.length} separate videos`
            : !comparable
              ? 'Done — your edit is written'
              : saving > 0.02
                ? `Done — ${Math.round(saving * 100)}% smaller`
                : saving < -0.02
                  ? `Done — but ${Math.round(-saving * 100)}% bigger than the original`
                  : 'Done — about the same size'}
      </p>
      <p className={`mt-1 text-[12px] tabular-nums ${tone.body}`}>
        {comparable ? `${formatBytes(sourceBytes)} → ` : ''}
        {formatBytes(size)}
        {pieces && ' zipped'}
        {predicted > 0 && !partial && ` (predicted ${formatBytes(predicted)})`}
      </p>

      {/* Why it stopped, and what is not in the archive. A partial result that
          does not name the gap is worse than no result: the zip opens, four
          files are in it, and nothing says the fifth was ever meant to exist. */}
      {partial && (
        <div className={`mt-3 rounded-xl bg-white/70 px-3 py-2.5 text-[12px] leading-relaxed dark:bg-slate-900/60 ${tone.body}`}>
          <p>
            Piece {partial.written + 1} of {partial.total} could not be written — {partial.reason}
          </p>
          <p className="mt-1.5">
            {partial.missing.length === 1
              ? 'This piece is missing:'
              : `These ${partial.missing.length} pieces are missing:`}{' '}
            <span className="font-medium">{partial.missing.join(', ')}</span>. Everything before it is
            in the archive and is a complete file. Trimming or re-cutting the piece that stopped, then
            exporting again, is usually enough — the pieces you already have are unaffected.
          </p>
        </div>
      )}

      {/* The pieces, listed because a zip cannot answer "what is in it, and is
          it what I cut?" on its own. Where they are still in the tab each one
          saves individually too — wanting exactly one piece out of five is a
          normal thing to want, and "unzip it" is a poor answer when the file is
          right here. A streamed batch lists the same names without the button:
          those bytes went to the file and were let go. */}
      {pieces && pieces.length > 0 && (
        <ul className={`mt-4 divide-y rounded-xl border bg-white dark:bg-slate-900 ${tone.list}`}>
          {pieces.map((piece, index) => (
            <li key={piece.name} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[12px] text-slate-700 dark:text-slate-200" title={piece.name}>
                {piece.name}
              </span>
              <span className="shrink-0 text-[11.5px] tabular-nums text-slate-500 dark:text-slate-400">
                {formatBytes(piece.bytes)}
              </span>
              {piece.file && (
                <button
                  type="button"
                  onClick={() => downloadPiece(index)}
                  className={`shrink-0 rounded-md px-2 py-1 text-[11.5px] font-semibold ${tone.quiet}`}
                >
                  Save
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {result && (
          <button
            type="button"
            onClick={download}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold text-white ${tone.action}`}
          >
            {pieces ? `Save all ${pieces.length} as ${result.name}` : `Save ${result.name}`}
          </button>
        )}
        <button
          type="button"
          onClick={reset}
          className={`rounded-lg bg-white px-4 py-2 text-[13px] font-semibold hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 ${tone.title}`}
        >
          Start something else
        </button>
      </div>

      <p className={`mt-4 text-[11px] leading-relaxed ${tone.footer}`}>
        {savedTo ? (
          <>
            Saved as <span className="font-medium">{savedTo.name}</span>, where you chose to put it —
            each piece was written into it as it finished, so nothing was ever held in this tab
            waiting for the rest. Nothing left this device to get there.
          </>
        ) : piecesInTab || result ? (
          <>
            The file is held in this tab until you save it or leave. Closing the tab is the delete
            button — there is nowhere else it could have gone.
          </>
        ) : null}
      </p>
    </div>
  )
}
