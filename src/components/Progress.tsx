import { formatBytes, formatDuration } from '@unisim/media'
import { isOverrunning, projectedBytes } from '../lib/eta'
import { useEditorStore } from '../stores/editorStore'

/**
 * §10.4, point 5: "make trouble visible at 20%, not at 100%".
 *
 * A percentage bar cannot do that. A run drifting past its predicted size looks
 * exactly like one that isn't, right up until the tab dies. So this shows three
 * things a bar doesn't: frames done against frames total, the bytes produced so
 * far *against the prediction*, and a remaining time measured from this
 * device's real encoding speed rather than a lookup table.
 *
 * Nobody should wait ten minutes to find out.
 */
export default function Progress() {
  const progress = useEditorStore((s) => s.progress)
  const plan = useEditorStore((s) => s.plan)
  if (!progress) return null

  const pct = Math.round(progress.fraction * 100)
  const batch = progress.piece.total > 1
  const predicted = plan?.estimate.bytes ?? 0
  const projected = projectedBytes(progress.bytesOut, progress.framesDone, progress.framesTotal)
  const overrunning = isOverrunning(projected, predicted)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-baseline justify-between gap-4">
        {/* The bar spans the WHOLE batch (see `batchProgress`), so this line
            carries the only thing it cannot show: which piece is under the
            encoder right now. Without it a five-piece export is a bar that
            crawls for four minutes with nothing to say it is working through a
            list. */}
        <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
          {batch ? `Writing piece ${progress.piece.index} of ${progress.piece.total}…` : 'Writing the file…'}
        </p>
        <p className="text-[12px] tabular-nums text-slate-500 dark:text-slate-400">
          {progress.secondsLeft === null
            ? 'measuring this device…'
            : `about ${formatDuration(progress.secondsLeft)} left`}
        </p>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-orange-600 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      {batch && (
        <p className="mt-2 truncate text-[11.5px] text-slate-500 dark:text-slate-400" title={progress.piece.name}>
          {progress.piece.name}
        </p>
      )}

      <p className="mt-3 text-[11.5px] tabular-nums text-slate-500 dark:text-slate-400">
        {progress.framesDone.toLocaleString('en-GB')} of{' '}
        {progress.framesTotal.toLocaleString('en-GB')} frames · {formatBytes(progress.bytesOut)} written{batch && ' in all'}
        {predicted > 0 && ` · predicted ${formatBytes(predicted)}`}
      </p>

      {overrunning && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          This is running bigger than predicted — on course for about{' '}
          {formatBytes(projected ?? 0)}. Very busy footage compresses worse than the
          estimate assumes. Reload the tab to stop it if that is too big.
        </p>
      )}

      <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
        Keep this tab open and in front — browsers throttle background tabs, which
        makes the encode crawl rather than fail.
      </p>
    </div>
  )
}
