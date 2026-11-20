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
    // A record of facts read from each file: the suite's Key box (BRANDING.md
    // → Boxes, C), its tab saying what the list is.
    <div className="u-box u-box--key bg-white px-5 pb-4 pt-6 dark:bg-slate-900">
      <span className="u-box__key">{timeline.sources.length === 1 ? 'Source file' : 'Source files'}</span>
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
          className="u-btn u-btn--quiet u-btn--sm shrink-0"
        >
          Start again
        </button>
      </div>
    </div>
  )
}
