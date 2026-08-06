import { useRef } from 'react'
import { clipsAt } from '../lib/edit'
import { EDITOR_ACCEPT, useEditorStore, type Placement } from '../stores/editorStore'

/**
 * The verbs. Everything here is one call into a pure function in `lib/edit.ts`
 * — the toolbar knows nothing about how a cut works, which is why the cut is
 * testable without it.
 */
export default function Toolbar() {
  const timeline = useEditorStore((s) => s.timeline)
  const playheadSec = useEditorStore((s) => s.playheadSec)
  const selectedClipId = useEditorStore((s) => s.selectedClipId)
  const cut = useEditorStore((s) => s.cut)
  const removeSelected = useEditorStore((s) => s.removeSelected)
  const pxPerSec = useEditorStore((s) => s.pxPerSec)
  const zoom = useEditorStore((s) => s.zoom)
  const addFiles = useEditorStore((s) => s.addFiles)
  const busy = useEditorStore((s) => s.status === 'exporting')

  const inputs = {
    append: useRef<HTMLInputElement>(null),
    intro: useRef<HTMLInputElement>(null),
    outro: useRef<HTMLInputElement>(null),
  }

  const underPlayhead = clipsAt(timeline, playheadSec).length

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      <Action onClick={cut} disabled={busy || underPlayhead === 0} title="Split every clip under the playhead">
        Cut at playhead
      </Action>
      <Action onClick={removeSelected} disabled={busy || !selectedClipId}>
        Delete clip
      </Action>

      <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

      {(['intro', 'append', 'outro'] as Placement[]).map((placement) => (
        <span key={placement}>
          <input
            ref={inputs[placement]}
            type="file"
            accept={EDITOR_ACCEPT}
            multiple={placement === 'append'}
            className="sr-only"
            aria-label={LABELS[placement]}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (files.length) void addFiles(files, placement)
            }}
          />
          <Action onClick={() => inputs[placement].current?.click()} disabled={busy}>
            {LABELS[placement]}
          </Action>
        </span>
      ))}

      <span className="ml-auto flex items-center gap-1.5">
        <Action onClick={() => zoom(pxPerSec / 1.6)} disabled={busy} title="Zoom out">
          −
        </Action>
        <span className="w-16 text-center text-[11px] tabular-nums text-slate-500">
          {Math.round(pxPerSec)} px/s
        </span>
        <Action onClick={() => zoom(pxPerSec * 1.6)} disabled={busy} title="Zoom in">
          +
        </Action>
      </span>
    </div>
  )
}

const LABELS: Record<Placement, string> = {
  intro: 'Add intro…',
  append: 'Add clips…',
  outro: 'Add outro…',
}

function Action({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-lg bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  )
}
