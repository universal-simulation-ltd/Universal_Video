/**
 * The OUTPUT FRAME — the shape of the finished movie.
 *
 * Until this file existed the frame was whatever the first video happened to be,
 * so a clip filmed upright could only ever produce an upright movie. The owner's
 * ask, verbatim: *"I want to be able to reframe a video e.g. a portrait video to
 * reframe to 1920 x 1080 — it keeps the video in the centre and fills black on
 * the sides."*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HARD PART WAS ALREADY DONE, AND THAT IS WHY THIS FILE IS SMALL
 *
 * `renderTimeline()` has always letterboxed a source whose aspect differs from
 * `Timeline.width × height` — *contain*, not *cover*, deliberately, so nothing
 * is ever cropped away. `Timeline` has always carried the frame. What was
 * missing was the CONTROL: nothing let the user set the frame independently of
 * the source. So this file is the choice, the arithmetic that turns it into two
 * even numbers, and nothing else. It does not draw and it does not encode.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **This is letterbox/pillarbox only.** The picture is centred and the rest is
 * filled black. There is no crop, no zoom-to-fill and no per-clip position —
 * `UNISIM_Compare`'s entry for this app states in print that there is no
 * per-clip transform, so adding one quietly would make a published claim false.
 *
 * ⚠️ **Both edges must be EVEN.** `checkTimeline()` in `@unisim/media` refuses an
 * odd width or height up front — H.264 codes in 16×16 macroblocks and 4:2:0
 * chroma is subsampled by two — and a refusal the UI can walk the user into is a
 * bug in the UI. Every number that leaves this file has been through
 * `evenEdge()` or `targetFrameSize()`, both of which round to even, so the
 * renderer's refusal is unreachable from the control.
 */

import { targetFrameSize, type Timeline, type VideoSettings } from '@unisim/media'
import { fitInside } from './compose'

export interface FrameSize {
  width: number
  height: number
}

export type FramePresetId = 'source' | 'landscape' | 'portrait' | 'square' | 'custom'

export interface FramePreset {
  id: FramePresetId
  label: string
  /** Null for the two presets whose size is not fixed: `source` and `custom`. */
  size: FrameSize | null
}

/**
 * The frame the user picked.
 *
 * The custom size is kept even while a preset is selected, so switching to
 * Custom… and back does not lose what was typed.
 */
export interface FrameChoice {
  preset: FramePresetId
  custom: FrameSize
}

/** The largest edge the custom fields will take. 8K wide; past that no browser encoder will configure. */
export const MAX_FRAME_EDGE = 7680

/**
 * The smallest edge the custom fields will take.
 *
 * The renderer's own floor is 2, but a 2-pixel-wide movie is a typo rather than
 * a request, and 16 is one macroblock — the smallest frame H.264 codes without
 * padding.
 */
export const MIN_CUSTOM_EDGE = 16

export const DEFAULT_FRAME: FrameChoice = {
  preset: 'source',
  custom: { width: 1920, height: 1080 },
}

export const FRAME_PRESETS: FramePreset[] = [
  { id: 'source', label: 'Match the source', size: null },
  { id: 'landscape', label: 'Landscape — 1920 × 1080', size: { width: 1920, height: 1080 } },
  { id: 'portrait', label: 'Portrait — 1080 × 1920', size: { width: 1080, height: 1920 } },
  { id: 'square', label: 'Square — 1080 × 1080', size: { width: 1080, height: 1080 } },
  { id: 'custom', label: 'Custom…', size: null },
]

/**
 * The nearest even number, never below 2 and never above `MAX_FRAME_EDGE`.
 *
 * 2 rather than `MIN_CUSTOM_EDGE`, because this also evens a SOURCE's own
 * dimensions — a tiny intro card is a legitimate frame and clamping it up to 16
 * would change a movie nobody asked to change.
 */
export function evenEdge(value: number): number {
  if (!Number.isFinite(value)) return 2
  const clamped = Math.min(MAX_FRAME_EDGE, Math.max(2, Math.round(value)))
  return Math.max(2, Math.min(MAX_FRAME_EDGE, Math.round(clamped / 2) * 2))
}

/** What a custom field is allowed to hold: even, and at least one macroblock. */
export function customEdge(value: number): number {
  if (!Number.isFinite(value)) return MIN_CUSTOM_EDGE
  return Math.max(MIN_CUSTOM_EDGE, evenEdge(value))
}

/**
 * The frame the timeline would have if the user had never touched this control:
 * the first VIDEO source's shape.
 *
 * A still deciding the movie's frame would mean a 400 px logo dropped as an
 * intro card resizing the whole export, which is why the contract says the
 * default comes from the first video and why an image is only consulted when
 * there is nothing else at all.
 */
export function naturalFrame(timeline: Timeline): FrameSize {
  const first = timeline.sources.find((s) => s.kind === 'video') ?? timeline.sources[0]
  if (!first || first.width <= 0 || first.height <= 0) return { width: 0, height: 0 }
  return { width: evenEdge(first.width), height: evenEdge(first.height) }
}

/** The frame a choice asks for, on this timeline. `{0, 0}` only while empty. */
export function frameFor(choice: FrameChoice, timeline: Timeline): FrameSize {
  if (choice.preset === 'custom') {
    return { width: customEdge(choice.custom.width), height: customEdge(choice.custom.height) }
  }
  const preset = FRAME_PRESETS.find((p) => p.id === choice.preset)
  if (preset?.size) return { width: evenEdge(preset.size.width), height: evenEdge(preset.size.height) }
  return naturalFrame(timeline)
}

/**
 * Write the chosen frame onto the timeline.
 *
 * `addSource()` still adopts the first video's shape, which is right — it is
 * what "match the source" means, and it keeps the timeline valid before this
 * control has been touched. This runs after every edit (see the store's
 * `reflow`) so a later drop cannot quietly move the frame back.
 */
export function applyFrame(timeline: Timeline, choice: FrameChoice): Timeline {
  const frame = frameFor(choice, timeline)
  if (frame.width === timeline.width && frame.height === timeline.height) return timeline
  return { ...timeline, width: frame.width, height: frame.height }
}

/**
 * **The one definition of the exported frame size**, read by the preview, by the
 * estimate on the button, by the memory refusal and by the renderer adapter.
 *
 * There are two settings in play and they compose: the chosen frame is the
 * SHAPE, and `maxHeight` scales that shape down ("1080p" names the short edge,
 * so a 9:16 frame at 1080p is 1080 × 1920 and not 608 × 1080). Keeping both in
 * one function is the whole reason the preview cannot drift from the file —
 * `Player` sizes its canvas from this and `render.ts` hands this to
 * `renderTimeline()`.
 */
export function outputFrame(timeline: Timeline, settings: Pick<VideoSettings, 'maxHeight'>): FrameSize {
  // The fallback is only reached before the first file lands, where nothing can
  // be exported anyway; it exists so the preview has an aspect to draw.
  const width = timeline.width > 0 ? timeline.width : 1920
  const height = timeline.height > 0 ? timeline.height : 1080
  return targetFrameSize(width, height, settings.maxHeight)
}

export interface Letterbox {
  /** Where the picture lands inside the frame, and how big it is drawn. */
  x: number
  y: number
  width: number
  height: number
  /** Total black across both sides — pillarbox. 0 when the aspects match. */
  sideBars: number
  /** Total black across the top and bottom — letterbox. */
  topBars: number
}

/**
 * Where a source lands inside the output frame, and how much black is left.
 *
 * Built on the same `fitInside()` the player draws with, which is *contain* —
 * the same decision `renderTimeline()`'s `drawContained()` makes for the file.
 * The bars are returned as totals so a test can say "equal bars left and right
 * adding up to the right width" without re-deriving the halves.
 */
export function letterbox(sourceWidth: number, sourceHeight: number, frame: FrameSize): Letterbox {
  const box = fitInside(sourceWidth, sourceHeight, frame.width, frame.height)
  return {
    ...box,
    sideBars: Math.max(0, frame.width - box.width),
    topBars: Math.max(0, frame.height - box.height),
  }
}

/** "1920 × 1080" — the frame in the form the UI says it out loud. */
export function describeFrame(frame: FrameSize): string {
  return `${frame.width} × ${frame.height}`
}
