import { useEffect, useRef, useState } from 'react'
import { formatBytes, formatDuration, type MaxHeight, type VideoQuality } from '@unisim/media'
import {
  FRAME_PRESETS,
  MAX_FRAME_EDGE,
  MIN_CUSTOM_EDGE,
  customEdge,
  describeFrame,
  naturalFrame,
} from '../lib/frame'
import {
  selectFrameHeight,
  selectFrameWidth,
  selectRoute,
  selectSegmentCount,
  selectSeparateBlock,
  useEditorStore,
} from '../stores/editorStore'

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

/**
 * The output settings, the prediction, and the button.
 *
 * §10.4 made visible, now for a timeline rather than a file: an out-of-memory
 * kill fires no `onerror` and rejects no promise, so the only defence is
 * deciding BEFORE the button is pressed. An edit is heavier than one file — the
 * exporter holds every source on the timeline at once — so the refusal counts
 * all of them (see `lib/memory.ts`) and the estimate is on the button.
 *
 * The button's own words change with what is on the timeline: one clip is
 * "Export this video", several is "Export this edit — N clips". It used to say
 * "Compress this video" for the single-clip case; it doesn't now, because
 * compressing is one of the things an export does (and the "% smaller" on the
 * second line says so when it applies) rather than what the button is for.
 */
export default function ExportPanel() {
  const settings = useEditorStore((s) => s.settings)
  const update = useEditorStore((s) => s.updateSettings)
  const plan = useEditorStore((s) => s.plan)
  const accept = useEditorStore((s) => s.acceptAlternative)
  const supported = useEditorStore((s) => s.supported)
  const exportEdit = useEditorStore((s) => s.exportEdit)
  const blocked = useEditorStore((s) => s.blocked)
  const busy = useEditorStore((s) => s.status === 'exporting')
  const route = useEditorStore(selectRoute)
  const clips = useEditorStore((s) => s.timeline.clips.length)
  const sourceBytes = useEditorStore((s) => s.plan?.sourceBytes ?? 0)
  const mode = useEditorStore((s) => s.mode)
  const setMode = useEditorStore((s) => s.setMode)
  const separateBlock = useEditorStore(selectSeparateBlock)
  const pieceCount = useEditorStore(selectSegmentCount)
  const frame = useEditorStore((s) => s.frame)
  const setFramePreset = useEditorStore((s) => s.setFramePreset)
  const setCustomFrame = useEditorStore((s) => s.setCustomFrame)
  // Derived outside the selector: `naturalFrame` builds a fresh object, and a
  // selector with no stable identity re-renders on every store touch.
  const timeline = useEditorStore((s) => s.timeline)
  const natural = naturalFrame(timeline)
  const frameWidth = useEditorStore(selectFrameWidth)
  const frameHeight = useEditorStore(selectFrameHeight)

  // Somebody who came in through the front door's Convert pill asked for THIS
  // panel, not for the editor in general — so it scrolls itself into view and
  // says so for a moment. The intent is cleared as soon as it has been
  // honoured: it answers "how did this file get opened", once, and a second
  // file opened later did not come in that way.
  //
  // ⚠️ The hooks are above the `if (!plan)` return on purpose. React counts
  // hooks per render, and this panel returns null before the timeline has been
  // planned — moving them below is a hooks-order crash on the first frame.
  const intent = useEditorStore((s) => s.intent)
  const setIntent = useEditorStore((s) => s.setIntent)
  const panelRef = useRef<HTMLDivElement>(null)
  const [announcing, setAnnouncing] = useState(false)
  useEffect(() => {
    if (intent !== 'convert') return
    setAnnouncing(true)
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setIntent(null)
  }, [intent, setIntent])
  // ⚠️ The beat is a SECOND effect, and it has to be. Put the `setTimeout` in
  // the one above and it cancels itself: clearing the intent changes that
  // effect's own dependency, React runs the cleanup, the pending timer dies,
  // and the re-run returns early because the intent is gone — leaving the panel
  // lit up for good.
  useEffect(() => {
    if (!announcing) return
    const t = setTimeout(() => setAnnouncing(false), 2600)
    return () => clearTimeout(t)
  }, [announcing])

  if (!plan) return null

  const quality = QUALITIES.find((q) => q.value === settings.quality)
  const refused = plan.verdict === 'refuse'
  const stopped = refused || supported === false || busy
  // "% smaller" only means something when there is one source to compare with —
  // and one file to compare it against. A zip of five pieces is not "38% of the
  // original" in any sense a reader would take the right meaning from.
  const saving =
    mode === 'one' && route === 'compress' && sourceBytes > 0 ? 1 - plan.estimate.bytes / sourceBytes : 0

  return (
    <div className="space-y-3" ref={panelRef}>
      <div
        className={`space-y-5 rounded-2xl border bg-white p-5 transition-shadow dark:bg-slate-900 ${
          announcing
            ? 'border-orange-400 shadow-[0_0_0_4px_rgba(249,115,22,0.18)] dark:border-orange-500'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        {/* ── WHAT COMES OUT ──────────────────────────────────────────────────
            First, because it changes what every control under it applies to and
            what the button at the bottom means.

            This is the ENTIRE "export each cut separately" feature's UI. There
            is deliberately no split-point editor, no segment list and no second
            screen: the cuts are already on the timeline, and the timeline is
            already the list of pieces. All that was missing was somewhere to
            say "don't join them back up". Everything below this line — frame,
            quality, resolution, sound — is unchanged and applies to every
            piece, which is what keeps a five-file export as simple to set up as
            a one-file one. */}
        <Field label="What comes out">
          <div className="grid grid-cols-2 gap-1.5">
            <ModeButton
              selected={mode === 'one'}
              disabled={busy}
              onClick={() => setMode('one')}
              label="One video"
            />
            <ModeButton
              selected={mode === 'separate'}
              // Not offered until the timeline is a plain row of cuts. The
              // reason is right underneath — a control that greys out without
              // saying why is indistinguishable from a broken one.
              disabled={busy || separateBlock !== null}
              onClick={() => setMode('separate')}
              label={separateBlock ? 'Separate files' : `Separate files — ${pieceCount}`}
            />
          </div>
          <p className="text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">
            {mode === 'separate'
              ? `Every cut becomes its own MP4 — ${pieceCount} of them — and they come down together as one .zip.`
              : separateBlock
                ? separateBlock
                : `The ${clips} clips are joined into a single MP4.`}
          </p>
        </Field>

        <hr className="border-slate-100 dark:border-slate-800" />

        {/* The shape of the MOVIE, so it belongs with the output settings and
            not in the clip inspector — a frame is not a property of a clip. */}
        <Field label="Output frame">
          <select
            value={frame.preset}
            disabled={busy}
            aria-label="Output frame"
            onChange={(e) => setFramePreset(e.target.value as typeof frame.preset)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            {FRAME_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.id === 'source' && natural.width > 0
                  ? `${preset.label} — ${describeFrame(natural)}`
                  : preset.label}
              </option>
            ))}
          </select>

          {frame.preset === 'custom' && (
            <div className="flex items-center gap-2">
              <EvenSizeField
                label="Frame width"
                value={frame.custom.width}
                disabled={busy}
                onCommit={(width) => setCustomFrame({ width })}
              />
              <span className="text-[12px] text-slate-400">×</span>
              <EvenSizeField
                label="Frame height"
                value={frame.custom.height}
                disabled={busy}
                onCommit={(height) => setCustomFrame({ height })}
              />
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            The movie is written at {frameWidth}×{frameHeight}. Anything that isn’t this shape is
            centred in it and the rest filled black — nothing is cropped and nothing is stretched.
            {frame.preset === 'custom' &&
              ` Both edges are rounded to even numbers, from ${MIN_CUSTOM_EDGE} to ${MAX_FRAME_EDGE}, because H.264 codes in 16×16 macroblocks.`}
          </p>
        </Field>

        <hr className="border-slate-100 dark:border-slate-800" />

        <Field label="How small">
          <div className="grid grid-cols-3 gap-1.5">
            {QUALITIES.map((q) => (
              <button
                key={q.value}
                type="button"
                disabled={busy}
                onClick={() => update({ quality: q.value })}
                className={`rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                  settings.quality === q.value
                    ? 'bg-orange-700 text-white'
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
            disabled={busy}
            aria-label="Resolution"
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

        <hr className="border-slate-100 dark:border-slate-800" />

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={settings.keepAudio}
            disabled={busy}
            onChange={(e) => update({ keepAudio: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 accent-orange-600 disabled:opacity-50"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-200">
              Keep the sound
            </span>
            <span className="block text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">
              Off writes a silent file. Individual clips can be muted on the timeline; this switch is
              the whole export.
            </span>
          </span>
        </label>

        {settings.keepAudio && (
          <Field label="Sound quality (kbps)">
            <div className="grid grid-cols-4 gap-1.5">
              {AUDIO_BITRATES.map((b) => (
                <button
                  key={b}
                  type="button"
                  disabled={busy}
                  onClick={() => update({ audioBitrateKbps: b })}
                  className={`rounded-lg px-2 py-1.5 text-[12px] font-semibold tabular-nums transition-colors disabled:opacity-50 ${
                    settings.audioBitrateKbps === b
                      ? 'bg-orange-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </Field>
        )}
      </div>

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

      {blocked && (
        <div role="alert" className="rounded-2xl bg-amber-50 px-5 py-4 text-[12.5px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold">This edit can’t be written out yet</p>
          <p className="mt-1">{blocked}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void exportEdit()}
        disabled={stopped || (mode === 'separate' && separateBlock !== null)}
        className="w-full rounded-2xl bg-orange-700 px-5 py-4 text-left text-white transition-colors hover:bg-orange-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
      >
        <span className="block text-[15px] font-semibold">
          {refused || supported === false
            ? 'Can’t export this here'
            : mode === 'separate'
              ? `Export ${pieceCount} separate videos (.zip)`
              : route === 'compress'
                ? 'Export this video'
                // One clip can reach this now: a reframe is a letterbox, and only
                // the renderer can letterbox, so "1 clips" became reachable the
                // moment the frame control shipped.
                : `Export this edit — ${clips} clip${clips === 1 ? '' : 's'}`}
        </span>
        <span className="mt-0.5 block text-[12px] tabular-nums opacity-90">
          {/* The estimate lives ON the button, because a number the user has to
              go and find is a number they press past. */}
          {/* The DURATION comes off the plan, not off the timeline. In separate
              files a gap left by a deleted clip is not exported at all, while a
              joined movie writes it as black — so the two modes really are
              different lengths, and the plan is the one place that knows. */}
          About {formatBytes(plan.estimate.bytes)} · {plan.estimate.width}×{plan.estimate.height} ·{' '}
          {formatDuration(plan.estimate.seconds)}
          {!stopped && saving > 0.02 && ` · ${Math.round(saving * 100)}% smaller`}
          {!stopped && saving < -0.02 && ` · ${Math.round(-saving * 100)}% BIGGER than the original`}
        </span>
      </button>
    </div>
  )
}

/**
 * A width or a height for the custom frame.
 *
 * ⚠️ **An odd number must be unreachable.** `checkTimeline()` in `@unisim/media`
 * refuses an odd edge before it starts, so a field that could produce one is a
 * field that walks the user into a refusal at the moment they press Export.
 * Rounding is done on COMMIT rather than per keystroke, though: rounding as you
 * type turns "1" — the first character of 1920 — into "2" and makes the box
 * impossible to type into. So the draft is free text, blur or Enter commits it
 * through `customEdge()`, and the box then shows the even number that was
 * actually taken rather than what was typed.
 */
function EvenSizeField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string
  value: number
  disabled: boolean
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))

  // The store is the truth: a value changed anywhere else (a reset, a preset
  // switch, or the rounding above) has to show up here.
  useEffect(() => setDraft(String(value)), [value])

  const commit = () => {
    const parsed = Number(draft)
    // An empty box, or something that isn't a positive number, puts the last
    // good value back rather than clamping — clearing a field to retype it is
    // the commonest thing anyone does to one, and answering that with "16" is
    // an edit the user did not ask for. Everything else goes through
    // `customEdge()`, which is where the even-number guarantee lives.
    const next = draft.trim() !== '' && Number.isFinite(parsed) && parsed > 0 ? customEdge(parsed) : value
    setDraft(String(next))
    onCommit(next)
  }

  return (
    <input
      type="number"
      min={MIN_CUSTOM_EDGE}
      max={MAX_FRAME_EDGE}
      step={2}
      value={draft}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
      className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] tabular-nums text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
    />
  )
}

/** One of the two "what comes out" pills. */
function ModeButton({
  selected,
  disabled,
  onClick,
  label,
}: {
  selected: boolean
  disabled: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? 'bg-orange-700 text-white'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
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
