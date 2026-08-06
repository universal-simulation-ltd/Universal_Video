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

/** Above this share of the budget, warn. Above 1.0, refuse. Same as the package. */
const TIGHT_AT = 0.6
const ALTERNATIVE_AT = 0.9

export interface TimelinePlanAlternative {
  settings: VideoSettings
  estimate: OutputEstimate
  label: string
}

export interface TimelinePlan {
  estimate: OutputEstimate
  /** Bytes of source files held resident while the export runs. */
  sourceBytes: number
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
export function estimateTimelineOutput(timeline: Timeline, settings: VideoSettings): OutputEstimate {
  const seconds = timelineDuration(timeline)
  const size = outputFrame(timeline, settings)
  const fps = timeline.fps > 0 ? timeline.fps : 30
  const video = videoBitrate(size.width, size.height, fps, settings.quality)
  const anyAudible = timeline.clips.some((c) => c.audio.enabled)
  const audio = settings.keepAudio && anyAudible ? settings.audioBitrateKbps * 1000 : 0
  // Same overhead model as the package: ~8 bytes of sample table per frame plus
  // a few kilobytes of fixed boxes.
  const overhead = Math.round(seconds * fps * 8) + 4096
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

/** Every source is resident at once, plus two copies of the output being assembled. */
export function peakBytesForTimeline(sourceBytes: number, estimate: OutputEstimate): number {
  return sourceBytes + estimate.bytes * 2
}

export function planTimelineExport(
  timeline: Timeline,
  sourceBytes: number,
  settings: VideoSettings,
  budget: MemoryBudget = memoryBudget(),
): TimelinePlan {
  const estimate = estimateTimelineOutput(timeline, settings)
  const peak = peakBytesForTimeline(sourceBytes, estimate)
  const share = peak / budget.totalBytes
  const verdict: Verdict = share > 1 ? 'refuse' : share > TIGHT_AT ? 'tight' : 'ok'
  const headline =
    `About ${formatBytes(estimate.bytes)} · ${estimate.width}×${estimate.height} · ` +
    formatDuration(estimate.seconds)

  if (verdict === 'ok') {
    return { estimate, sourceBytes, peakBytes: peak, budget, verdict, headline, detail: '', alternative: null }
  }

  const alternative = findAlternative(timeline, sourceBytes, settings, budget)

  if (verdict === 'tight') {
    return {
      estimate,
      sourceBytes,
      peakBytes: peak,
      budget,
      verdict,
      headline,
      detail:
        `That is a lot for one browser tab to hold at once — the clips on the timeline stay in memory while it renders. ` +
        (alternative
          ? `${alternative.label} would produce about ${formatBytes(alternative.estimate.bytes)} and has room to spare.`
          : `Removing a clip, or trimming the ones you have, is the surest way to bring it down.`),
      alternative,
    }
  }

  // A refusal that only says no is a bug with a polite tone. Each branch ends in
  // something the user can actually do.
  const sourcesAlone = sourceBytes > budget.totalBytes
  const detail = sourcesAlone
    ? `The clips on this timeline are ${formatBytes(sourceBytes)} of source between them, and every one has to be read into memory before its frames can be found — which is more than this device will hold. No output setting can fix that: take a clip off the timeline, or edit in shorter pieces.`
    : alternative
      ? `This would produce about ${formatBytes(estimate.bytes)}, which this browser can't hold in one piece alongside the ${formatBytes(sourceBytes)} of source it is cut from. ${alternative.label} produces about ${formatBytes(alternative.estimate.bytes)} — that fits.`
      : `This would produce about ${formatBytes(estimate.bytes)} on top of ${formatBytes(sourceBytes)} of source, which this browser can't hold in one piece, and no quality setting brings an edit this long far enough down. Export it in shorter pieces.`

  return { estimate, sourceBytes, peakBytes: peak, budget, verdict: 'refuse', headline, detail, alternative }
}

/**
 * The best-looking setting that still fits, searched down from the user's own
 * choice — the smallest concession that works rather than the safest one.
 */
function findAlternative(
  timeline: Timeline,
  sourceBytes: number,
  settings: VideoSettings,
  budget: MemoryBudget,
): TimelinePlanAlternative | null {
  const currentIndex = MAX_HEIGHTS.indexOf(settings.maxHeight)
  const heights = MAX_HEIGHTS.slice(currentIndex < 0 ? 0 : currentIndex + 1)
  for (const maxHeight of heights) {
    for (const quality of qualitiesFrom(settings.quality)) {
      const candidate: VideoSettings = { ...settings, maxHeight, quality }
      const estimate = estimateTimelineOutput(timeline, candidate)
      if (peakBytesForTimeline(sourceBytes, estimate) <= budget.totalBytes * ALTERNATIVE_AT) {
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
