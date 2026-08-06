import { clipDuration, clipSpan, type TransitionKind } from '@unisim/media'
import { DEFAULT_TRANSITION_SEC, sourceById } from '../lib/edit'
import { timecode } from '../lib/timecode'
import { selectSelectedClip, useEditorStore } from '../stores/editorStore'

/**
 * The selected clip, in numbers.
 *
 * Dragging is how you edit; typing is how you edit *exactly*, and it is also
 * the only way any of this is reachable without a mouse. The fields write
 * through the same pure functions the handles do — there is no second code path
 * that could round differently.
 */
export default function Inspector() {
  const timeline = useEditorStore((s) => s.timeline)
  const clip = useEditorStore(selectSelectedClip)
  const trim = useEditorStore((s) => s.trim)
  const drag = useEditorStore((s) => s.drag)
  const audio = useEditorStore((s) => s.audio)
  const transition = useEditorStore((s) => s.transition)
  const cardDuration = useEditorStore((s) => s.cardDuration)
  const removeSelected = useEditorStore((s) => s.removeSelected)

  if (!clip) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-[12.5px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Pick a clip on the timeline to trim it, mute it, or give it a transition.
      </p>
    )
  }

  const source = sourceById(timeline, clip.sourceId)
  const span = clipSpan(clip)

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{source?.name}</h2>
        <p className="text-[11.5px] tabular-nums text-slate-500 dark:text-slate-400">
          on V{clip.track + 1} · {timecode(span.start)}–{timecode(span.end)} ·{' '}
          {timecode(clipDuration(clip))} long
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label="Starts at"
          hint="seconds on the timeline"
          value={clip.startSec}
          onChange={(v) => drag(clip.id, v, clip.track)}
        />
        <NumberField
          label="In point"
          hint="seconds into the file"
          value={clip.inSec}
          onChange={(v) => trim(clip.id, 'in', clip.startSec + (v - clip.inSec))}
        />
        <NumberField
          label="Out point"
          hint="seconds into the file"
          value={clip.outSec}
          onChange={(v) => trim(clip.id, 'out', clip.startSec + (v - clip.inSec))}
        />
      </div>

      {source?.kind === 'image' && (
        <NumberField
          label="Card length"
          hint="how long this still stays on screen"
          value={source.durationSec}
          onChange={(v) => cardDuration(source.id, v)}
        />
      )}

      <hr className="border-slate-100 dark:border-slate-800" />

      {/* The audio belongs to the clip, so it is edited here rather than on a
          lane of its own — there is nothing to select separately. */}
      <div className="space-y-2">
        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={clip.audio.enabled}
            disabled={source?.hasAudio === false}
            onChange={(e) => audio(clip.id, { enabled: e.target.checked })}
            className="h-4 w-4 accent-orange-600 disabled:opacity-40"
          />
          <span className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">
            Keep this clip’s sound
          </span>
        </label>
        {source?.hasAudio === false ? (
          <p className="text-[11px] text-slate-400">This file has no audio track, so there is nothing to keep.</p>
        ) : (
          <label className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">
              Volume
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={clip.audio.gain}
              aria-label="Volume of this clip"
              disabled={!clip.audio.enabled}
              onChange={(e) => audio(clip.id, { gain: Number(e.target.value) })}
              className="min-w-0 flex-1 accent-orange-600 disabled:opacity-40"
            />
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
              {Math.round(clip.audio.gain * 100)}%
            </span>
          </label>
        )}
      </div>

      <hr className="border-slate-100 dark:border-slate-800" />

      <div className="grid gap-3 sm:grid-cols-2">
        <TransitionField
          label="Coming in"
          kind={clip.transitionIn?.kind ?? null}
          durationSec={clip.transitionIn?.durationSec ?? DEFAULT_TRANSITION_SEC}
          onChange={(kind, seconds) => transition(clip.id, 'in', kind, seconds)}
        />
        <TransitionField
          label="Going out"
          kind={clip.transitionOut?.kind ?? null}
          durationSec={clip.transitionOut?.durationSec ?? DEFAULT_TRANSITION_SEC}
          onChange={(kind, seconds) => transition(clip.id, 'out', kind, seconds)}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        A crossfade coming in slides this clip back over the one before it, because a dissolve needs
        two pictures at once — the clips after it move with it, so the join doesn’t spring a gap. A
        fade needs nothing behind it; it goes to and from black.
      </p>

      <button
        type="button"
        onClick={removeSelected}
        className="rounded-lg bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-red-800 hover:bg-red-100 dark:bg-slate-800 dark:text-red-300 dark:hover:bg-red-950/50"
      >
        Delete this clip
      </button>
    </div>
  )
}

function TransitionField({
  label,
  kind,
  durationSec,
  onChange,
}: {
  label: string
  kind: TransitionKind | null
  durationSec: number
  onChange: (kind: TransitionKind | null, seconds: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">{label}</span>
      <div className="flex gap-2">
        <select
          value={kind ?? 'none'}
          aria-label={`${label} transition`}
          onChange={(e) => {
            const next = e.target.value
            onChange(next === 'none' ? null : (next as TransitionKind), durationSec)
          }}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        >
          <option value="none">Straight cut</option>
          <option value="crossfade">Crossfade</option>
          <option value="fade">Fade to/from black</option>
        </select>
        <input
          type="number"
          min={0.1}
          max={10}
          step={0.1}
          value={round(durationSec)}
          aria-label={`${label} transition length in seconds`}
          disabled={kind === null}
          onChange={(e) => onChange(kind, Number(e.target.value))}
          className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] tabular-nums text-slate-900 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </div>
    </div>
  )
}

function NumberField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">{label}</span>
      <input
        type="number"
        step={0.1}
        min={0}
        value={round(value)}
        aria-label={label}
        onChange={(e) => {
          const next = window.Number(e.target.value)
          if (window.Number.isFinite(next)) onChange(next)
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
      <span className="text-[10px] text-slate-400">{hint}</span>
    </label>
  )
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
