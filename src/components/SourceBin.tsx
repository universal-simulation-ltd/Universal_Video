import { formatBytes, formatDuration } from '@unisim/media'
import { useEditorStore } from '../stores/editorStore'

/**
 * What we know about each file on the timeline, read from its header in
 * milliseconds.
 *
 * It is here for the same reason it was in v1: the estimate on the Export
 * button is only trustworthy if the facts it is built from are visible too. It
 * also lists sources that are in the bin but not on the timeline, so a clip you
 * deleted can be put back without opening the file again.
 */
export default function SourceBin() {
  const timeline = useEditorStore((s) => s.timeline)
  const assets = useEditorStore((s) => s.assets)
  const reset = useEditorStore((s) => s.reset)
  const busy = useEditorStore((s) => s.status === 'exporting')

  if (!timeline.sources.length) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-4">
        <ul className="min-w-0 flex-1 space-y-2">
          {timeline.sources.map((source) => {
            const asset = assets[source.id]
            const used = timeline.clips.filter((c) => c.sourceId === source.id).length
            return (
              <li key={source.id} className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100" title={source.name}>
                  {source.name}
                </p>
                <p className="mt-0.5 text-[11.5px] tabular-nums text-slate-500 dark:text-slate-400">
                  {asset ? `${formatBytes(asset.file.size)} · ` : ''}
                  {source.width}×{source.height} · {formatDuration(source.durationSec)}
                  {asset?.probe ? ` · ${Math.round(asset.probe.fps)} fps` : ' · still image'} ·{' '}
                  {source.hasAudio ? 'with sound' : 'no sound'}
                  {used === 0 ? ' · not on the timeline' : used > 1 ? ` · ${used} clips` : ''}
                </p>
              </li>
            )
          })}
        </ul>
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Start again
        </button>
      </div>
    </div>
  )
}
