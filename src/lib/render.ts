/**
 * The one place this app turns a `Timeline` into a file.
 *
 * ⚠️ **`renderTimeline()` does not exist in `@unisim/media` yet.** It is being
 * written against the same `timeline.ts` contract this editor is written
 * against. Rather than invent a second timeline shape to work around the gap,
 * or stub a renderer that appears to work and silently produces the wrong file,
 * this adapter looks the function up at run time and, when it isn't there, says
 * so in a sentence a user can understand. When the package ships it, the only
 * thing that should need changing here is the `RenderTimelineFn` signature —
 * and if it needs more than that, this file is the diff to read.
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

type RenderTimelineFn = (
  input: TimelineRenderInput,
  onDetail?: (progress: VideoProgress) => void,
) => Promise<ConvertedFile>

/** Thrown when a multi-clip export is asked for and the renderer isn't in the package yet. */
export class RendererUnavailableError extends Error {
  constructor() {
    super(
      'Exporting an edit with more than one clip needs the timeline renderer, and the ' +
        'copy of @unisim/media installed here does not have it yet. Everything on the ' +
        'timeline is saved in this tab and nothing has been lost — a single clip on its ' +
        'own still exports today.',
    )
    this.name = 'RendererUnavailableError'
  }
}

/** Is the timeline renderer present in the installed package? */
export function rendererAvailable(): boolean {
  return typeof lookupRenderTimeline() === 'function'
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

  const render = lookupRenderTimeline()
  if (!render) throw new RendererUnavailableError()
  return render(input, onDetail)
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

function lookupRenderTimeline(): RenderTimelineFn | undefined {
  // A run-time lookup, on purpose: the export is typed against the contract, but
  // the symbol is genuinely absent from the installed package, and a compile-time
  // import of a missing export would take the whole app down at load rather than
  // at the moment somebody presses Export.
  const withRenderer = media as unknown as { renderTimeline?: RenderTimelineFn }
  return typeof withRenderer.renderTimeline === 'function' ? withRenderer.renderTimeline : undefined
}
