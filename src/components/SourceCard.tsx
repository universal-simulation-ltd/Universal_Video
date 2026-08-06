import { formatBytes, formatDuration } from '@unisim/media'
import { useVideoStore } from '../stores/videoStore'

// What we know about the file, read from its header in milliseconds. Shown
// because the estimate below it is only trustworthy if the facts it is built
// from are visible too.
export default function SourceCard() {
  const file = useVideoStore((s) => s.file)
  const probe = useVideoStore((s) => s.probe)
  const reset = useVideoStore((s) => s.reset)
  const running = useVideoStore((s) => s.phase === 'running')
  if (!file || !probe) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100" title={file.name}>
          {file.name}
        </p>
        <p className="mt-0.5 text-[11.5px] tabular-nums text-slate-500 dark:text-slate-400">
          {formatBytes(probe.size)} · {probe.width}×{probe.height} · {formatDuration(probe.duration)} ·{' '}
          {Math.round(probe.fps)} fps · {probe.hasAudio ? 'with sound' : 'no sound'}
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        disabled={running}
        className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Choose another
      </button>
    </div>
  )
}
