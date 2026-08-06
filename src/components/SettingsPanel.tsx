import { useEffect, useState } from 'react'
import { formatDuration, parseClock, type MaxHeight, type VideoQuality } from '@unisim/media'
import { useVideoStore } from '../stores/videoStore'

const HEIGHTS: { value: MaxHeight; label: string }[] = [
  { value: 'source', label: 'Keep original size' },
  { value: 2160, label: '4K — 2160p' },
  { value: 1440, label: '1440p' },
  { value: 1080, label: 'Full HD — 1080p' },
  { value: 720, label: 'HD — 720p' },
  { value: 480, label: '480p' },
]

const QUALITIES: { value: VideoQuality; label: string; hint: string }[] = [
  { value: 'small', label: 'Smaller', hint: 'The most shrink. Fine for sending and for the web.' },
  { value: 'balanced', label: 'Balanced', hint: 'The default. Noticeably smaller, still looks like the original.' },
  { value: 'high', label: 'Best', hint: 'Keeps the most detail. The biggest file of the three.' },
]

const AUDIO_BITRATES = [96, 128, 192, 256]

export default function SettingsPanel() {
  const settings = useVideoStore((s) => s.settings)
  const update = useVideoStore((s) => s.updateSettings)
  const running = useVideoStore((s) => s.phase === 'running')
  const probe = useVideoStore((s) => s.probe)

  const quality = QUALITIES.find((q) => q.value === settings.quality)

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <Field label="How small">
        <div className="grid grid-cols-3 gap-1.5">
          {QUALITIES.map((q) => (
            <button
              key={q.value}
              type="button"
              disabled={running}
              onClick={() => update({ quality: q.value })}
              className={`rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                settings.quality === q.value
                  ? 'bg-orange-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>
        <p className="text-[11.5px] text-slate-500 dark:text-slate-400">{quality?.hint}</p>
      </Field>

      <Field label="Resolution">
        <select
          value={String(settings.maxHeight)}
          disabled={running}
          onChange={(e) => {
            const raw = e.target.value
            update({ maxHeight: (raw === 'source' ? 'source' : Number(raw)) as MaxHeight })
          }}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        >
          {HEIGHTS.map((h) => (
            <option key={String(h.value)} value={String(h.value)}>{h.label}</option>
          ))}
        </select>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Names the shorter edge, so a clip filmed upright stays upright. Never scaled up.
        </p>
      </Field>

      <Divider />

      <Toggle
        label="Keep the sound"
        hint={
          probe?.hasAudio === false
            ? 'This file has no audio track, so there is nothing to keep.'
            : 'Re-encoded to AAC alongside the picture. Off writes a silent file — smaller, and sometimes the point.'
        }
        on={settings.keepAudio && probe?.hasAudio !== false}
        disabled={running || probe?.hasAudio === false}
        onChange={(keepAudio) => update({ keepAudio })}
      />

      {settings.keepAudio && probe?.hasAudio !== false && (
        <Field label="Sound quality (kbps)">
          <div className="grid grid-cols-4 gap-1.5">
            {AUDIO_BITRATES.map((b) => (
              <button
                key={b}
                type="button"
                disabled={running}
                onClick={() => update({ audioBitrateKbps: b })}
                className={`rounded-lg px-2 py-1.5 text-[12px] font-semibold tabular-nums transition-colors disabled:opacity-50 ${
                  settings.audioBitrateKbps === b
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Divider />

      <Toggle
        label="Trim"
        hint="Keep only part of the clip. Cuts begin at the nearest keyframe at or before the start time."
        on={settings.trim.enabled}
        disabled={running}
        onChange={(enabled) => update({ trim: { ...settings.trim, enabled } })}
      />

      {settings.trim.enabled && <TrimFields />}
    </div>
  )
}

// Same strictness as Universal Converter's trim fields: an unparseable field
// says so and holds the last good value rather than silently trimming from zero.
function TrimFields() {
  const trim = useVideoStore((s) => s.settings.trim)
  const update = useVideoStore((s) => s.updateSettings)
  const running = useVideoStore((s) => s.phase === 'running')
  const duration = useVideoStore((s) => s.probe?.duration ?? 0)

  const [startText, setStartText] = useState(trim.startSec ? formatDuration(trim.startSec) : '0:00')
  const [endText, setEndText] = useState(trim.endSec == null ? '' : formatDuration(trim.endSec))

  // The panel is rebuilt when a new file is chosen; reflect a reset trim.
  useEffect(() => {
    if (!trim.enabled) {
      setStartText('0:00')
      setEndText('')
    }
  }, [trim.enabled])

  const startBad = startText.trim() !== '' && parseClock(startText) === null
  const endBad = endText.trim() !== '' && parseClock(endText) === null

  const field =
    'w-full rounded-lg border px-3 py-2 text-[12px] tabular-nums focus:outline-none focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-50'

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">Start</span>
          <input
            value={startText}
            disabled={running}
            onChange={(e) => {
              setStartText(e.target.value)
              const seconds = e.target.value.trim() === '' ? 0 : parseClock(e.target.value)
              if (seconds !== null) update({ trim: { ...trim, startSec: seconds } })
            }}
            placeholder="0:00"
            inputMode="numeric"
            aria-invalid={startBad}
            className={`${field} ${startBad ? 'border-red-400 text-red-700' : 'border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">End</span>
          <input
            value={endText}
            disabled={running}
            onChange={(e) => {
              setEndText(e.target.value)
              if (e.target.value.trim() === '') {
                update({ trim: { ...trim, endSec: null } })
                return
              }
              const seconds = parseClock(e.target.value)
              if (seconds !== null) update({ trim: { ...trim, endSec: seconds } })
            }}
            placeholder={duration ? formatDuration(duration) : 'end of file'}
            inputMode="numeric"
            aria-invalid={endBad}
            className={`${field} ${endBad ? 'border-red-400 text-red-700' : 'border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}
          />
        </label>
      </div>
      <p className={`text-[10.5px] ${startBad || endBad ? 'text-red-700' : 'text-slate-400 dark:text-slate-500'}`}>
        {startBad || endBad
          ? 'Use mm:ss, h:mm:ss, or a number of seconds.'
          : 'Leave the end blank to run to the end of the clip.'}
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">{label}</span>
      {children}
    </div>
  )
}

function Divider() {
  return <hr className="border-slate-100 dark:border-slate-800" />
}

function Toggle({
  label, hint, on, disabled, onChange,
}: {
  label: string
  hint: string
  on: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-orange-600 disabled:opacity-50"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-200">{label}</span>
        <span className="block text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
    </label>
  )
}
