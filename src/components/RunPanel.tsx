import { formatBytes, formatDuration } from '@unisim/media'
import { useVideoStore } from '../stores/videoStore'

/**
 * The button, the prediction written on it, and the refusal when there is one.
 *
 * This is the "refuse before, never crash after" rule made visible (§10.4). An
 * out-of-memory kill fires no `onerror` and rejects no promise — there is no
 * recovery path and no graceful degradation, so the only defence that exists is
 * deciding *before* the button is pressed. Hence: the estimate is on the button,
 * the verdict is decided up front, and a refusal always names a setting that
 * works rather than just saying no.
 */
export default function RunPanel() {
  const plan = useVideoStore((s) => s.plan)
  const probe = useVideoStore((s) => s.probe)
  const supported = useVideoStore((s) => s.supported)
  const convert = useVideoStore((s) => s.convert)
  const accept = useVideoStore((s) => s.acceptAlternative)
  if (!plan || !probe) return null

  const refused = plan.verdict === 'refuse'
  const blocked = refused || supported === false
  const saving = probe.size > 0 ? 1 - plan.estimate.bytes / probe.size : 0

  return (
    <div className="space-y-3">
      {plan.verdict !== 'ok' && (
        <div
          role={refused ? 'alert' : 'status'}
          className={`rounded-2xl px-5 py-4 text-[12.5px] leading-relaxed ${
            refused
              ? 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200'
              : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
          }`}
        >
          <p className="font-semibold">
            {refused ? 'This one won’t fit in a browser tab' : 'This is close to what a browser tab can hold'}
          </p>
          <p className="mt-1">{plan.detail}</p>
          {plan.alternative && (
            <button
              type="button"
              onClick={accept}
              className={`mt-3 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white ${
                refused ? 'bg-red-700 hover:bg-red-800' : 'bg-amber-700 hover:bg-amber-800'
              }`}
            >
              Use {plan.alternative.label.toLowerCase()}
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void convert()}
        disabled={blocked}
        className="w-full rounded-2xl bg-orange-600 px-5 py-4 text-left text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
      >
        <span className="block text-[15px] font-semibold">
          {blocked ? 'Can’t compress this here' : 'Compress this video'}
        </span>
        <span className="mt-0.5 block text-[12px] tabular-nums opacity-90">
          {/* The estimate lives ON the button, because a number the user has to
              go and find is a number they press past. */}
          About {formatBytes(plan.estimate.bytes)} · {plan.estimate.width}×{plan.estimate.height} ·{' '}
          {formatDuration(plan.estimate.seconds)}
          {!blocked && saving > 0.02 && ` · ${Math.round(saving * 100)}% smaller`}
          {!blocked && saving < -0.02 && ` · ${Math.round(-saving * 100)}% BIGGER than the original`}
        </span>
      </button>

      {saving < -0.02 && !blocked && (
        <p className="px-1 text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">
          Re-encoding an already-compressed video at a higher quality than it was
          saved at makes it <em>bigger</em>, not better — the detail it lost is
          gone. Pick “Smaller”, or a lower resolution, if the point is a smaller file.
        </p>
      )}
    </div>
  )
}
