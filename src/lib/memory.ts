/**
 * "Refuse before, never crash after" — the same rule as `plan.ts` in
 * `@unisim/media`, but for a timeline with more than one source on it.
 *
 * `planConversion()` budgets `one input + 2 × output`. That was right when the
 * app could only hold one file. An edit holds **every** source at once — the
 * pipeline reads each one into memory in full, so three dropped clips is three
 * resident files before a single frame is encoded, and the ceiling arrives
 * sooner than a v1 user would expect. If the refusal did not learn to count
 * them all, the first thing a multi-clip edit would do on a modest machine is
 * kill the tab with no error to catch and no work saved.
 *
 * The budget, the frame-size maths and the bitrate table all come from the
 * package rather than being re-derived here: this file only changes what goes
 * into the sum.
 *
 * ── The destination is part of the sum ───────────────────────────────────────
 *
 * Since the separate-files batch learned to write straight into a file the user
 * picks (`openZip` in `@unisim/media`, driven by `lib/zipTarget.ts`), the
 * arithmetic below has TWO answers and the difference is the whole point of
 * that work. Holding the archive in the tab costs `sources + 2 × Σ pieces`;
 * streaming it costs `sources + 2 × the LARGEST piece`, because each one is
 * handed to the file and released before the next starts. On a long edit cut
 * into twenty that is the difference between a refusal and an export.
 *
 * ⚠️ The plan therefore cannot be computed without knowing where the bytes are
 * going. `destination` is not decoration — a plan that assumed `'memory'` on a
 * browser that streams would refuse exports that work, and one that assumed
 * `'stream'` on Safari would promise an export that kills the tab.
 */

import {
  MAX_HEIGHTS,
  memoryBudget,
  formatBytes,
  formatDuration,
  timelineDuration,
  videoBitrate,
  type MaxHeight,
  type MemoryBudget,
  type OutputEstimate,
  type Timeline,
  type Verdict,
  type VideoQuality,
  type VideoSettings,
} from '@unisim/media'
import { outputFrame } from './frame'
import { segmentsOf, type ExportMode } from './segments'

/** Above this share of the budget, warn. Above 1.0, refuse. Same as the package. */
const TIGHT_AT = 0.6
const ALTERNATIVE_AT = 0.9

/**
 * Where a separate-files archive is being written.
 *
 * `'memory'` is every browser and the only answer for a joined movie — the zip
 * is assembled in the tab and downloaded. `'stream'` means the user has a File
 * System Access handle open and each piece goes into it as it finishes.
 */
export type ZipDestination = 'memory' | 'stream'

export interface TimelinePlanAlternative {
  settings: VideoSettings
  estimate: OutputEstimate
  label: string
}

export interface TimelinePlan {
  estimate: OutputEstimate
  /** What this plan is a plan for. `'separate'` predicts the zip, not one movie. */
  mode: ExportMode
  /** Files this export produces: 1 for a joined movie, one per piece otherwise. */
  fileCount: number
  /** Bytes of source files held resident while the export runs. */
  sourceBytes: number
  /**
   * Where this plan assumes the archive goes. Always `'memory'` for a joined
   * movie — there is no archive — and for a batch on a browser without the
   * File System Access API.
   */
  destination: ZipDestination
  /**
   * The single biggest thing in memory at once besides the sources: the whole
   * output when it is held in the tab, the largest piece when it is streamed.
   * This is the term `peakBytes` doubles.
   */
  residentOutputBytes: number
  peakBytes: number
  budget: MemoryBudget
  verdict: Verdict
  headline: string
  detail: string
  alternative: TimelinePlanAlternative | null
}

/**
 * What the finished movie will weigh.
 *
 * The length is `timelineDuration()`, deliberately — NOT the sum of the clips.
 * Clips overlap during a crossfade and can sit after a gap, so summing would be
 * wrong in both directions (the contract says so, and the same reasoning is why
 * this estimate cannot be "add up the estimates for each clip").
 *
 * The frame comes from `outputFrame()`, which is also what the player draws and
 * what the renderer is handed. That is what keeps the refusal honest across a
 * reframe: telling the user a 480×270 phone clip fits and then encoding it into
 * a 1920×1080 frame is eight times the pixels and a refusal made too late.
 */
export function estimateTimelineOutput(
  timeline: Timeline,
  settings: VideoSettings,
  mode: ExportMode = 'one',
): OutputEstimate {
  // ⚠️ THE TWO MODES MEASURE DIFFERENT LENGTHS, AND THE DIFFERENCE IS REAL.
  // A joined movie is `timelineDuration()` — the furthest any clip reaches,
  // INCLUDING any gap left by a deleted clip, which the renderer writes as
  // black. Separate files have no gaps: a gap is simply not a piece. So the
  // total is the sum of the pieces, which is why the same timeline can predict
  // 240 MB joined and 190 MB as a zip, and why the button's number has to know
  // which one it is showing.
  const pieces = mode === 'separate' ? segmentsOf(timeline) : []
  const separate = pieces.length > 0
  const seconds = separate
    ? pieces.reduce((total, piece) => total + piece.durationSec, 0)
    : timelineDuration(timeline)
  const size = outputFrame(timeline, settings)
  const fps = timeline.fps > 0 ? timeline.fps : 30
  const video = videoBitrate(size.width, size.height, fps, settings.quality)
  const anyAudible = timeline.clips.some((c) => c.audio.enabled)
  const audio = settings.keepAudio && anyAudible ? settings.audioBitrateKbps * 1000 : 0
  // Same overhead model as the package: ~8 bytes of sample table per frame plus
  // a few kilobytes of fixed boxes — once PER FILE, because five MP4s carry five
  // sets of those boxes. A few kilobytes each, so this changes no verdict; it is
  // here so the number on the button is the sum of what actually comes out
  // rather than nearly it.
  const overhead = Math.round(seconds * fps * 8) + 4096 * Math.max(1, pieces.length)
  return {
    bytes: Math.round(((video + audio) / 8) * seconds) + overhead,
    seconds,
    width: size.width,
    height: size.height,
    fps,
    videoBitrate: video,
    audioBitrate: audio,
  }
}

/**
 * Every source is resident at once, plus two copies of the biggest output being
 * assembled.
 *
 * ── Why an in-tab zip needs no different sum ─────────────────────────────────
 *
 * It looks at first as though a zip should be cheaper: only one piece is being
 * encoded at a time, so the biggest single output is small. Held in the tab it
 * is not, and the arithmetic is worth writing down because the pre-flight
 * refusal is the ONLY defence against tab death and a formula that is
 * optimistic here would be worse than no formula at all.
 *
 *   While piece k is encoding:   sources + Σ(pieces already finished) + 2 × piece k
 *   While the zip is written:    sources + Σ(all pieces) + Σ(all pieces again)
 *
 * The zip is a copy — `createZip()` reads every finished blob and concatenates
 * them into a new one — so the second line is `sources + 2 × Σ`, and Σ is what
 * `estimateTimelineOutput()` returns in separate mode. That is the same shape as
 * the joined export, and it dominates the first line (at the last piece the
 * first line is `sources + Σ + last`, which cannot exceed `sources + 2 × Σ`).
 *
 * ── And why streaming it needs a different one ───────────────────────────────
 *
 * Both lines above exist only because the finished pieces have nowhere to go.
 * Given a file handle they do: `openZip()` takes each piece, writes it, and the
 * caller drops it, so nothing accumulates and there is never a second copy of
 * the whole archive.
 *
 *   While piece k is encoding:   sources + 2 × piece k   (+ one 4 MiB chunk)
 *
 * The worst k is the longest piece, so `residentOutput` is that one piece
 * rather than the sum — which is why the same twenty-piece edit can be refused
 * on Safari and export on Chrome. The chunk the zip writer holds is a rounding
 * error against a video frame buffer and is not modelled.
 */
export function peakBytesForTimeline(
  sourceBytes: number,
  estimate: OutputEstimate,
  /**
   * The largest single output resident at once. Omit for the in-tab paths,
   * where that is the whole of `estimate.bytes`.
   */
  residentOutputBytes: number = estimate.bytes,
): number {
  return sourceBytes + residentOutputBytes * 2
}

/**
 * The biggest single piece a streamed batch ever holds.
 *
 * Every piece is encoded at the same frame, rate and quality, so bytes are
 * proportional to seconds and the longest piece is the heaviest — no need to
 * re-run the bitrate table per piece. The per-file overhead `estimate.bytes`
 * carries for the OTHER pieces is left in, which makes this a hair
 * conservative, and conservative is the right direction for a refusal.
 *
 * Falls back to the whole estimate when there are no pieces to speak of, so a
 * caller that gets this wrong is refused rather than over-promised.
 */
export function largestPieceBytes(timeline: Timeline, estimate: OutputEstimate): number {
  const pieces = segmentsOf(timeline)
  if (pieces.length === 0 || estimate.seconds <= 0) return estimate.bytes
  const longest = pieces.reduce((most, piece) => Math.max(most, piece.durationSec), 0)
  return Math.round((estimate.bytes / estimate.seconds) * longest)
}

export function planTimelineExport(
  timeline: Timeline,
  sourceBytes: number,
  settings: VideoSettings,
  mode: ExportMode = 'one',
  budget: MemoryBudget = memoryBudget(),
  /**
   * Last, and defaulted, so every existing call still means what it did. Only
   * a separate-files batch on a browser with `showSaveFilePicker()` passes
   * `'stream'` — see `lib/zipTarget.ts` for who decides.
   */
  destination: ZipDestination = 'memory',
): TimelinePlan {
  const estimate = estimateTimelineOutput(timeline, settings, mode)
  const pieces = mode === 'separate' ? segmentsOf(timeline) : []
  const fileCount = mode === 'separate' ? Math.max(1, pieces.length) : 1
  // ⚠️ Streaming only changes the sum for a batch of MORE THAN ONE piece. One
  // piece IS the whole archive, so there is nothing to release and the two
  // destinations cost exactly the same — claiming otherwise would under-count.
  const streamed = destination === 'stream' && mode === 'separate' && fileCount > 1
  const residentOutput = streamed ? largestPieceBytes(timeline, estimate) : estimate.bytes
  const peak = peakBytesForTimeline(sourceBytes, estimate, residentOutput)
  const share = peak / budget.totalBytes
  const verdict: Verdict = share > 1 ? 'refuse' : share > TIGHT_AT ? 'tight' : 'ok'
  const headline =
    `About ${formatBytes(estimate.bytes)} · ${estimate.width}×${estimate.height} · ` +
    formatDuration(estimate.seconds)
  const base = {
    estimate,
    mode,
    fileCount,
    sourceBytes,
    destination: streamed ? ('stream' as const) : ('memory' as const),
    residentOutputBytes: residentOutput,
    peakBytes: peak,
    budget,
  }
  // The one thing separate files change about the REFUSAL: it is not obvious
  // that an in-tab zip costs the same as one movie (a reader who has just been
  // told "one piece at a time" will assume it costs less), so the sentence says
  // where the bytes are. Streamed, the intuition is finally correct and the
  // sentence says THAT instead — because a reader told the pieces go straight
  // into a file and then refused on their total would rightly not believe it.
  // See `peakBytesForTimeline` for both.
  const because = streamed
    ? `each piece goes into your file and is let go, so what binds is the longest single piece — about ${formatBytes(residentOutput)} of the ${formatBytes(estimate.bytes)} total`
    : mode === 'separate' && fileCount > 1
      ? `the zip holds all ${fileCount} finished pieces at once, so what binds is still their total`
      : 'the clips on the timeline stay in memory while it renders'

  if (verdict === 'ok') {
    return { ...base, verdict, headline, detail: '', alternative: null }
  }

  const alternative = findAlternative(timeline, sourceBytes, settings, mode, budget, destination)

  if (verdict === 'tight') {
    return {
      ...base,
      verdict,
      headline,
      detail:
        `That is a lot for one browser tab to hold at once — ${because}. ` +
        (alternative
          ? `${alternative.label} would produce about ${formatBytes(alternative.estimate.bytes)} and has room to spare.`
          : `Removing a clip, or trimming the ones you have, is the surest way to bring it down.`),
      alternative,
    }
  }

  // A refusal that only says no is a bug with a polite tone. Each branch ends in
  // something the user can actually do.
  const sourcesAlone = sourceBytes > budget.totalBytes
  // ⚠️ "In one piece" is the wrong phrase for a zip — it is precisely NOT in one
  // piece, and telling someone who has just asked for five files that the
  // problem is one file reads as the app not knowing what it was asked to do.
  // Same verdict, same arithmetic, different sentence.
  const asZip = mode === 'separate' && fileCount > 1
  const size = `about ${formatBytes(estimate.bytes)}${asZip ? ` across ${fileCount} files` : ''}`
  const cantHold = asZip
    ? `which this browser can't hold at once — ${because}`
    : `which this browser can't hold in one piece`
  // ⚠️ "Export the rest in a second batch" is the wrong advice once the pieces
  // are being streamed: splitting the batch does not lower the peak, because
  // the peak is ONE piece either way. The only thing that helps then is a
  // shorter longest piece — another cut through it.
  const lastResort = streamed
    ? 'Cutting the longest piece in two is what brings this down — the batch can be any length, but no single piece can be.'
    : asZip
      ? 'Take some clips off the timeline and export the rest in a second batch.'
      : 'Export it in shorter pieces.'
  const detail = sourcesAlone
    ? `The clips on this timeline are ${formatBytes(sourceBytes)} of source between them, and every one has to be read into memory before its frames can be found — which is more than this device will hold. No output setting can fix that: take a clip off the timeline, or edit in shorter pieces.`
    : alternative
      ? `This would produce ${size}, ${cantHold} alongside the ${formatBytes(sourceBytes)} of source it is cut from. ${alternative.label} produces about ${formatBytes(alternative.estimate.bytes)} — that fits.`
      : `This would produce ${size} on top of ${formatBytes(sourceBytes)} of source, ${cantHold}, and no quality setting brings an edit this long far enough down. ${lastResort}`

  return { ...base, verdict: 'refuse', headline, detail, alternative }
}

/**
 * The best-looking setting that still fits, searched down from the user's own
 * choice — the smallest concession that works rather than the safest one.
 */
function findAlternative(
  timeline: Timeline,
  sourceBytes: number,
  settings: VideoSettings,
  mode: ExportMode,
  budget: MemoryBudget,
  destination: ZipDestination,
): TimelinePlanAlternative | null {
  const currentIndex = MAX_HEIGHTS.indexOf(settings.maxHeight)
  const heights = MAX_HEIGHTS.slice(currentIndex < 0 ? 0 : currentIndex + 1)
  for (const maxHeight of heights) {
    for (const quality of qualitiesFrom(settings.quality)) {
      const candidate: VideoSettings = { ...settings, maxHeight, quality }
      const estimate = estimateTimelineOutput(timeline, candidate, mode)
      // ⚠️ The candidate has to be measured the way the real export will be
      // measured. Sizing a smaller setting against the in-tab sum while the
      // export streams would offer 480p to someone whose 1080p already fits.
      const resident =
        destination === 'stream' && mode === 'separate'
          ? largestPieceBytes(timeline, estimate)
          : estimate.bytes
      if (peakBytesForTimeline(sourceBytes, estimate, resident) <= budget.totalBytes * ALTERNATIVE_AT) {
        return { settings: candidate, estimate, label: labelFor(maxHeight, quality) }
      }
    }
  }
  return null
}

function qualitiesFrom(quality: VideoQuality): VideoQuality[] {
  if (quality === 'high') return ['high', 'balanced', 'small']
  if (quality === 'balanced') return ['balanced', 'small']
  return ['small']
}

function labelFor(maxHeight: MaxHeight, quality: VideoQuality): string {
  const size = maxHeight === 'source' ? 'The original size' : `${maxHeight}p`
  const q = quality === 'high' ? 'Best' : quality === 'balanced' ? 'Balanced' : 'Smaller'
  return `${size} at ${q} quality`
}
