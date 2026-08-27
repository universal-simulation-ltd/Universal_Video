import { useFileDrop } from '@unisim/sdk'
import { clipsAt } from '../lib/edit'
import { timecode } from '../lib/timecode'
import { FIT, ZOOM_STEP } from '../lib/zoom'
import { EDITOR_ACCEPT, selectMaxZoom, useEditorStore, type Placement } from '../stores/editorStore'

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
  const zoomFactor = useEditorStore((s) => s.zoomFactor)
  const maxZoom = useEditorStore(selectMaxZoom)
  const zoom = useEditorStore((s) => s.zoom)
  const zoomBy = useEditorStore((s) => s.zoomBy)
  const addFiles = useEditorStore((s) => s.addFiles)
  const busy = useEditorStore((s) => s.status === 'exporting')

  // Disabled at the ends rather than silently doing nothing — a + that stops
  // responding without saying so reads as a bug.
  const atFit = zoomFactor <= FIT
  const canZoomOut = zoomFactor > FIT
  const canZoomIn = zoomFactor < maxZoom - 1e-6

  // Three separate pickers because the file goes somewhere different in each
  // case, and only "Add clips…" takes more than one. Same SDK mechanics as the
  // editor's drop zone — buttons here, so no drop target and no click wrapper.
  // Hooks can't be called from a map, hence three calls into one record.
  const pickers: Record<Placement, ReturnType<typeof useFileDrop>> = {
    intro: useFileDrop({ onFiles: (files) => void addFiles(files, 'intro'), accept: EDITOR_ACCEPT, multiple: false, clickToBrowse: false, disabled: busy }),
    append: useFileDrop({ onFiles: (files) => void addFiles(files, 'append'), accept: EDITOR_ACCEPT, clickToBrowse: false, disabled: busy }),
    outro: useFileDrop({ onFiles: (files) => void addFiles(files, 'outro'), accept: EDITOR_ACCEPT, multiple: false, clickToBrowse: false, disabled: busy }),
  }

  const underPlayhead = clipsAt(timeline, playheadSec).length

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      {/* The button names the INSTANT it will cut at, not the control that
          decides it (owner, 2026-08-27). "Cut at playhead" described the
          mechanism to someone who already knew where their playhead was;
          "Cut at 0:12.4" is a readout of what pressing it does, so the number
          on the button and the needle on the timeline can be checked against
          each other before committing to a split.

          `timecode()` and not `formatDuration()`: one decimal place, because a
          readout that cannot tell 12.0 from 12.4 cannot be used to place a cut,
          which is the one thing this readout is for.

          The accessible name changes with the playhead, which is right — it is
          what the button will do — but it means every locator has to match on
          the prefix. `aria-keyshortcuts` carries the "c" that used to have
          nowhere to be announced. */}
      <Action
        onClick={cut}
        disabled={busy || underPlayhead === 0}
        title={
          underPlayhead === 0
            ? 'Move the playhead over a clip to cut it'
            : `Split every clip at ${timecode(playheadSec)}`
        }
        keyShortcut="c"
      >
        Cut at {timecode(playheadSec)}
      </Action>
      <Action onClick={removeSelected} disabled={busy || !selectedClipId}>
        Delete clip
      </Action>

      <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

      {(['intro', 'append', 'outro'] as Placement[]).map((placement) => (
        <span key={placement}>
          <input {...pickers[placement].inputProps} className="sr-only" aria-label={LABELS[placement]} />
          <Action onClick={pickers[placement].open} disabled={busy}>
            {LABELS[placement]}
          </Action>
        </span>
      ))}

      {/* Zoom. `Fit` is the default and the way back: at fit the whole movie is
          exactly as wide as the picture above it, so the needle names the frame
          it is under. Zooming in is for placing a cut finer than the fitted
          width allows — it never goes the other way, because there is nothing
          outside the movie to look at. */}
      <span role="group" aria-label="Timeline zoom" className="ml-auto flex items-center gap-1.5">
        <Action
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          disabled={busy || !canZoomOut}
          title="Zoom out"
          label="Zoom out"
        >
          −
        </Action>
        <span
          data-testid="zoom-level"
          aria-live="polite"
          className="w-16 text-center text-[11px] tabular-nums text-slate-500"
        >
          {atFit ? 'Fit' : `${Math.round(zoomFactor * 100)}%`}
        </span>
        <Action
          onClick={() => zoomBy(ZOOM_STEP)}
          disabled={busy || !canZoomIn}
          title="Zoom in"
          label="Zoom in"
        >
          +
        </Action>
        <Action
          onClick={() => zoom(FIT)}
          disabled={busy || atFit}
          title="Fit the whole movie to the width of the picture"
          label="Fit the timeline to the width of the video"
        >
          Fit
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
  label,
  keyShortcut,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title?: string
  /** For the buttons whose face is a symbol — "−" is not a name a screen reader can read out. */
  label?: string
  /** The key that does the same thing, announced rather than only documented. */
  keyShortcut?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      aria-keyshortcuts={keyShortcut}
      className="rounded-lg bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  )
}
