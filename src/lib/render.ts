/**
 * The one place this app turns a `Timeline` into a file.
 *
 * `renderTimeline()` landed in `@unisim/media` 0.3.0 and this adapter calls it.
 * It was written against a throwing shim first, deliberately: inventing a second
 * timeline shape to work around the gap, or stubbing a renderer that appeared to
 * work, would have produced the wrong file silently. Both halves were built
 * against the same `timeline.ts` and met here, and the bridge turned out to be
 * small — which is the point of having fixed the contract first.
 *
 * One real difference: the renderer returns a bare `Blob`, because an edit has
 * no input file to take a name from. **Naming the download is this file's job.**
 *
 * ── The one route that DOES work today ───────────────────────────────────────
 *
 * A timeline holding a single whole-source video clip, starting at zero, with
 * no transitions and untouched audio, is exactly what `convertVideo()` has
 * shipped and been proven against since v1: one file in, one trimmed and
 * re-encoded file out. That is not a workaround — it is the owner's own framing
 * that "compress is just exporting a timeline with one clip on it", and it
 * keeps the one-drag-one-click path as fast and as proven as it was before the
 * editor existed. `exportRoute()` decides, and it is unit-tested, because the
 * dangerous mistake here would be taking this route for an edit it cannot
 * express (a clip starting at 2 s means two seconds of black at the head, and
 * `convertVideo` has no way to write that).
 */

import * as media from '@unisim/media'
import {
  clipDuration,
  convertVideo,
  type Clip,
  type ConvertedFile,
  type SourceId,
  type Timeline,
  type VideoProgress,
  type VideoSettings,
} from '@unisim/media'
import { evenEdge, outputFrame } from './frame'

/**
 * Everything the renderer needs that the `Timeline` itself does not carry.
 *
 * **The contract has no handle on the bytes.** `TimelineSource` describes a
 * source — id, kind, name, duration, size, whether it has sound — but nothing
 * in it can be decoded, which is right (a `File` is a browser object and the
 * document should stay serialisable) but means every call has to be handed the
 * files separately, keyed by source id. If the renderer wants a different
 * pairing, this is the type to change.
 */
export interface TimelineRenderInput {
  timeline: Timeline
  files: Record<SourceId, File>
  settings: VideoSettings
}

/** Is the timeline renderer present in the installed package? */
export function rendererAvailable(): boolean {
  return typeof media.renderTimeline === 'function'
}

export type ExportRoute = 'compress' | 'render'

/**
 * Which of the two paths this timeline can take.
 *
 * Every condition below is something `convertVideo()` genuinely cannot express,
 * so relaxing one of them does not make the export better — it makes it wrong
 * and silent.
 */
export function exportRoute(timeline: Timeline): ExportRoute {
  if (timeline.clips.length !== 1) return 'render'
  const clip = timeline.clips[0]
  const source = timeline.sources.find((s) => s.id === clip.sourceId)
  if (!source || source.kind !== 'video') return 'render'
  if (clip.track !== 0) return 'render'
  if (clip.startSec > 0.001) return 'render' // leading black is not a trim
  if (clip.transitionIn || clip.transitionOut) return 'render'
  if (clip.audio.gain !== 1) return 'render' // convertVideo has no gain control
  // ⚠️ A REFRAME IS A LETTERBOX, AND `convertVideo()` CANNOT LETTERBOX. It
  // scales the source's own frame to a height and writes that, so asking it for
  // a 1920×1080 output from a portrait clip produces a portrait file with the
  // reframe silently dropped — the exact failure this feature invites. Only the
  // timeline renderer composites onto a frame of its own. The comparison is
  // against the CLIP's source rather than the timeline's first video, because a
  // single clip cut from the second file has its own shape.
  if (evenEdge(source.width) !== timeline.width || evenEdge(source.height) !== timeline.height) {
    return 'render'
  }
  return 'compress'
}

export async function exportTimeline(
  input: TimelineRenderInput,
  onDetail?: (progress: VideoProgress) => void,
): Promise<ConvertedFile> {
  if (input.timeline.clips.length === 0) {
    throw new Error('There is nothing on the timeline to export yet.')
  }

  if (exportRoute(input.timeline) === 'compress') {
    return compressSingleClip(input, onDetail)
  }

  return renderWholeTimeline(input, onDetail)
}

/**
 * The multi-clip path: hand the whole edit to `@unisim/media` and name what
 * comes back. The files go separately, keyed by source id — the contract
 * deliberately carries no handle on the bytes so the document stays
 * serialisable, and a `File` is a browser object.
 *
 * ⚠️ The frame is resolved HERE, and it has to be. `renderTimeline()` encodes at
 * exactly `timeline.width × height` and takes `TimelineRenderSettings`, which
 * carries quality and audio bitrate but **no `maxHeight`** — the resolution cap
 * lives in `VideoSettings`, which this route never passes on. So the cap is
 * applied to the frame by the same `outputFrame()` the estimate on the button
 * and the memory refusal are computed from. Without this, picking "720p" on a
 * multi-clip edit changed the prediction and not the file. See the handover:
 * this is the one thing about a reframe that arguably belongs in the package.
 */
async function renderWholeTimeline(
  { timeline, files, settings }: TimelineRenderInput,
  onDetail?: (progress: VideoProgress) => void,
): Promise<ConvertedFile> {
  const frame = outputFrame(timeline, settings)
  const blob = await media.renderTimeline(
    { ...timeline, width: frame.width, height: frame.height },
    files,
    { quality: settings.quality, audioBitrateKbps: settings.audioBitrateKbps },
    undefined,
    onDetail,
  )
  return { blob, name: exportName(timeline) }
}

/**
 * What the finished edit is called.
 *
 * The first video source lends its stem, because it is the closest thing the
 * document has to "what this is". A timeline of nothing but image cards falls
 * back to a plain name rather than dressing a movie in a still's filename.
 */
export function exportName(timeline: Timeline): string {
  const firstVideo = timeline.sources.find((s) => s.kind === 'video')
  if (!firstVideo) return 'edit.mp4'
  const stem = firstVideo.name.replace(/\.[^.]+$/, '') || 'edit'
  return stem + '-edit.mp4'
}

/** The v1 path, unchanged: one source file, trimmed to the clip, re-encoded. */
async function compressSingleClip(
  { timeline, files, settings }: TimelineRenderInput,
  onDetail?: (progress: VideoProgress) => void,
): Promise<ConvertedFile> {
  const clip = timeline.clips[0]
  const source = timeline.sources.find((s) => s.id === clip.sourceId)
  const file = files[clip.sourceId]
  if (!source || !file) throw new Error('That clip’s file is no longer open in this tab.')

  return convertVideo(
    file,
    {
      ...settings,
      // The clip IS the trim. A clip covering the whole source turns the trim
      // off rather than asking for a window identical to the file, which keeps
      // the keyframe-alignment path out of a job that doesn't need it.
      trim: trimForClip(clip, source.durationSec),
      // A muted clip is a silent export. The clip's own audio flag decides,
      // because the clip is the thing carrying the audio.
      keepAudio: settings.keepAudio && clip.audio.enabled && source.hasAudio,
    },
    undefined,
    onDetail,
  )
}

export function trimForClip(clip: Clip, sourceDurationSec: number): VideoSettings['trim'] {
  const wholeFile = clip.inSec <= 0.001 && clipDuration(clip) >= sourceDurationSec - 0.001
  if (wholeFile) return { enabled: false, startSec: 0, endSec: null }
  return {
    enabled: true,
    startSec: Math.max(0, clip.inSec),
    endSec: Math.min(clip.outSec, sourceDurationSec),
  }
}

