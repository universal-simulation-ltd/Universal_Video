import { formatBytes } from '@unisim/media'
import { selectRoute, useEditorStore } from '../stores/editorStore'

export default function ResultCard() {
  const result = useEditorStore((s) => s.result)
  const plan = useEditorStore((s) => s.plan)
  const download = useEditorStore((s) => s.download)
  const reset = useEditorStore((s) => s.reset)
  const route = useEditorStore(selectRoute)
  if (!result) return null

  const size = result.blob.size
  const sourceBytes = plan?.sourceBytes ?? 0
  // "% smaller" is only an honest comparison when there was ONE thing to
  // compare with. Against a five-clip edit it would be arithmetic about nothing.
  const comparable = route === 'compress' && sourceBytes > 0
  const saving = comparable ? 1 - size / sourceBytes : 0
  const predicted = plan?.estimate.bytes ?? 0

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
      <p className="text-[15px] font-semibold text-emerald-900 dark:text-emerald-100">
        {!comparable
          ? 'Done — your edit is written'
          : saving > 0.02
            ? `Done — ${Math.round(saving * 100)}% smaller`
            : saving < -0.02
              ? `Done — but ${Math.round(-saving * 100)}% bigger than the original`
              : 'Done — about the same size'}
      </p>
      <p className="mt-1 text-[12px] tabular-nums text-emerald-800 dark:text-emerald-200">
        {comparable ? `${formatBytes(sourceBytes)} → ` : ''}
        {formatBytes(size)}
        {predicted > 0 && ` (predicted ${formatBytes(predicted)})`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={download}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-800"
        >
          Save {result.name}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-emerald-900 hover:bg-emerald-100 dark:bg-slate-900 dark:text-emerald-100 dark:hover:bg-slate-800"
        >
          Start something else
        </button>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-emerald-800/80 dark:text-emerald-200/70">
        The file is held in this tab until you save it or leave. Closing the tab
        is the delete button — there is nowhere else it could have gone.
      </p>
    </div>
  )
}
