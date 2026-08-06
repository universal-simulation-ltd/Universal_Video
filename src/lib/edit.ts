/**
 * Every edit, as a pure function from one `Timeline` to the next.
 *
 * Nothing in here touches React, the DOM, a `<video>` element or the store. A
 * cut is `cutClip(timeline, id, atSec) -> Timeline`, which means the thing that
 * has to be *right* — where the boundaries land — is testable without a browser
 * and without a render. `edit.test.ts` is the actual specification.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE THIS FILE EXISTS TO KEEP
 *
 * **A clip carries its own audio** (see `timeline.ts` in `@unisim/media`). There
 * is no parallel array of audio clips here and there must never be one. The
 * timeline UI draws a video lane and an audio lane for each clip, but that is
 * two rectangles for one object: `cutClip` splits ONE `Clip` into two, so the
 * sound is cut at the same instant as the picture *by construction* rather than
 * by two code paths agreeing to. If you ever find yourself writing
 * `audioClips.map(...)`, stop — picture and sound have just started drifting.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  clipDuration,
  clipSpan,
  clipsOverlap,
  timelineDuration,
  type Clip,
  type ClipId,
  type Timeline,
  type TimelineSource,
  type Transition,
  type TransitionKind,
  type SourceId,
} from '@unisim/media'

/**
 * The shortest a clip may become. Trimming to zero produces a clip that cannot
 * be grabbed again, so the handle stops here rather than letting the user
 * delete something by accident and with no undo.
 */
export const MIN_CLIP_SEC = 0.05

/** An intro/outro card's length when the user hasn't said otherwise. */
export const DEFAULT_IMAGE_SEC = 3

/** A transition's length when the user picks a kind and nothing else. */
export const DEFAULT_TRANSITION_SEC = 0.5

/** Fallback output frame rate, used until a video source says otherwise. */
export const DEFAULT_FPS = 30

let seq = 0
function newId(prefix: string): string {
  seq += 1
  return `${prefix}${seq}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyTimeline(): Timeline {
  return { width: 0, height: 0, fps: DEFAULT_FPS, sources: [], clips: [] }
}

export function sourceById(timeline: Timeline, id: SourceId): TimelineSource | undefined {
  return timeline.sources.find((s) => s.id === id)
}

export function clipById(timeline: Timeline, id: ClipId): Clip | undefined {
  return timeline.clips.find((c) => c.id === id)
}

export function sourceOf(timeline: Timeline, clip: Clip): TimelineSource | undefined {
  return sourceById(timeline, clip.sourceId)
}

/** One past the highest track in use — i.e. the index of the next empty track. */
export function trackCount(timeline: Timeline): number {
  return timeline.clips.reduce((max, c) => Math.max(max, c.track + 1), 1)
}

export function clipsOnTrack(timeline: Timeline, track: number): Clip[] {
  return timeline.clips.filter((c) => c.track === track).sort((a, b) => a.startSec - b.startSec)
}

/** The clips playing at `atSec`, bottom track first. Used by the player and by the ruler. */
export function clipsAt(timeline: Timeline, atSec: number): Clip[] {
  return timeline.clips
    .filter((c) => {
      const { start, end } = clipSpan(c)
      return atSec >= start && atSec < end
    })
    .sort((a, b) => a.track - b.track || a.startSec - b.startSec)
}

// ─── building blocks ────────────────────────────────────────────────────────

export function describeSource(
  id: SourceId,
  kind: 'video' | 'image',
  name: string,
  durationSec: number,
  width: number,
  height: number,
  hasAudio: boolean,
): TimelineSource {
  return { id, kind, name, durationSec, width, height, hasAudio }
}

export function newSourceId(): SourceId {
  return newId('s')
}

/**
 * A whole-source clip. `audio` is always present — the audio lane needs
 * something to draw even for a silent source, which is why `enabled` is a flag
 * rather than the field being absent (see `ClipAudio` in the contract).
 */
export function makeClip(
  source: TimelineSource,
  opts: { startSec?: number; track?: number } = {},
): Clip {
  return {
    id: newId('c'),
    sourceId: source.id,
    inSec: 0,
    outSec: source.durationSec,
    startSec: Math.max(0, opts.startSec ?? 0),
    track: Math.max(0, opts.track ?? 0),
    audio: { enabled: source.hasAudio, gain: 1 },
  }
}

/**
 * Register a source, and adopt its shape as the output shape if the timeline
 * hasn't got one yet. The contract says the output defaults to the first VIDEO
 * source's dimensions — an intro card should not decide the movie's frame size,
 * so an image only sets it when there is nothing else at all.
 */
export function addSource(timeline: Timeline, source: TimelineSource, fps?: number): Timeline {
  if (sourceById(timeline, source.id)) return timeline
  const sources = [...timeline.sources, source]
  const firstVideo = timeline.sources.some((s) => s.kind === 'video')
  const adoptShape = timeline.width === 0 || (!firstVideo && source.kind === 'video')
  return {
    ...timeline,
    sources,
    width: adoptShape ? source.width : timeline.width,
    height: adoptShape ? source.height : timeline.height,
    fps: adoptShape && fps && fps > 0 ? Math.round(fps) : timeline.fps,
  }
}

// ─── placing ────────────────────────────────────────────────────────────────

/** Butt-join a whole source onto the end of the movie, on the bottom track. */
export function appendClip(timeline: Timeline, sourceId: SourceId): Timeline {
  const source = sourceById(timeline, sourceId)
  if (!source) return timeline
  const clip = makeClip(source, { startSec: timelineDuration(timeline), track: 0 })
  return { ...timeline, clips: [...timeline.clips, clip] }
}

/**
 * Put a source in front of everything, pushing the whole movie later by its
 * length. An intro is a clip like any other after this — it trims, moves and
 * takes a transition exactly as footage does, which is the reason the contract
 * models an image as a source rather than as a special case.
 */
export function insertIntro(timeline: Timeline, sourceId: SourceId): Timeline {
  const source = sourceById(timeline, sourceId)
  if (!source) return timeline
  const shift = source.durationSec
  const shifted = timeline.clips.map((c) => ({ ...c, startSec: c.startSec + shift }))
  const clip = makeClip(source, { startSec: 0, track: 0 })
  return { ...timeline, clips: [clip, ...shifted] }
}

/** Put a source after everything, on the bottom track. */
export function appendOutro(timeline: Timeline, sourceId: SourceId): Timeline {
  return appendClip(timeline, sourceId)
}

// ─── the five operations the owner asked for ────────────────────────────────

/**
 * Drag either end of a clip. `timelineSec` is where the handle was dropped, in
 * timeline seconds.
 *
 * Trimming the head keeps the frame under the cursor still: `inSec` and
 * `startSec` move together, so the material does not slide sideways as you drag.
 * Both ends are clamped to the source's real bounds and to `MIN_CLIP_SEC` —
 * there is no trim that invents footage a file does not contain, and none that
 * produces a clip of zero length.
 */
export function trimClip(
  timeline: Timeline,
  clipId: ClipId,
  edge: 'in' | 'out',
  timelineSec: number,
): Timeline {
  const clip = clipById(timeline, clipId)
  if (!clip) return timeline
  const source = sourceOf(timeline, clip)
  if (!source) return timeline

  let next: Clip
  if (edge === 'in') {
    const wanted = clip.inSec + (timelineSec - clip.startSec)
    const inSec = clamp(wanted, 0, clip.outSec - MIN_CLIP_SEC)
    next = { ...clip, inSec, startSec: Math.max(0, clip.startSec + (inSec - clip.inSec)) }
  } else {
    const wanted = clip.inSec + (timelineSec - clip.startSec)
    const outSec = clamp(wanted, clip.inSec + MIN_CLIP_SEC, source.durationSec)
    next = { ...clip, outSec }
  }
  return replaceClip(timeline, next)
}

/**
 * Split one clip at the playhead.
 *
 * The two halves are the same object with different `inSec`/`outSec`, so the
 * left half's audio ends exactly where the right half's audio begins — not
 * because anything here lines them up, but because there is only one thing to
 * cut. That is the whole reason the contract has no separate audio clip, and
 * `edit.test.ts` asserts it explicitly.
 *
 * The transitions go with the material: a fade-IN belongs to the head of the
 * first half, a fade-OUT to the tail of the second. Neither is duplicated onto
 * the new seam, because a cut is not a transition.
 */
export function cutClip(timeline: Timeline, clipId: ClipId, atSec: number): Timeline {
  const clip = clipById(timeline, clipId)
  if (!clip) return timeline
  const { start, end } = clipSpan(clip)
  // A cut on (or within a frame of) either edge is not a cut, it is a no-op —
  // and doing it anyway would leave a clip too short to grab.
  if (atSec <= start + MIN_CLIP_SEC || atSec >= end - MIN_CLIP_SEC) return timeline

  const splitInSource = clip.inSec + (atSec - clip.startSec)

  const left: Clip = { ...clip, outSec: splitInSource, transitionOut: undefined }
  const right: Clip = {
    ...clip,
    id: newId('c'),
    inSec: splitInSource,
    startSec: atSec,
    transitionIn: undefined,
    // A copy, not a share: the two halves are independent from here on, and a
    // later mute of one must not silence the other.
    audio: { ...clip.audio },
  }

  const clips = timeline.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c]))
  return { ...timeline, clips }
}

/** Cut every clip the playhead is standing in — the ordinary "razor at the playhead". */
export function cutAt(timeline: Timeline, atSec: number): Timeline {
  return clipsAt(timeline, atSec).reduce((tl, c) => cutClip(tl, c.id, atSec), timeline)
}

export function deleteClip(timeline: Timeline, clipId: ClipId): Timeline {
  return { ...timeline, clips: timeline.clips.filter((c) => c.id !== clipId) }
}

/**
 * The lowest track at or above `desired` where this clip would not land on top
 * of another. When every track from `desired` up is occupied the answer is a
 * brand new one.
 *
 * **This is "add multiple tracks if two videos are slid on top of each other".**
 * Dropping one clip onto another does not overwrite it and does not refuse the
 * drop — it stacks, and the timeline grows a track to say so.
 */
export function freeTrackFor(
  timeline: Timeline,
  clip: Clip,
  desired: number,
  startSec: number,
): number {
  const moved = { ...clip, startSec }
  // Aiming above every existing track is allowed — dropping a clip on empty
  // space three tracks up is a request for a track there, not a mistake.
  const ceiling = Math.max(trackCount(timeline), Math.max(0, desired))
  for (let track = Math.max(0, desired); track <= ceiling; track += 1) {
    const collides = timeline.clips.some(
      (other) => other.id !== clip.id && other.track === track && clipsOverlap(other, { ...moved, track }),
    )
    if (!collides) return track
  }
  return ceiling
}

/**
 * Slide a clip along the timeline and between tracks. Overlaps are resolved
 * upwards by `freeTrackFor`, never by trimming or dropping anybody.
 *
 * Note that a *drag* never produces a same-track overlap, but `applyCrossfade`
 * deliberately does — a crossfade IS an overlap (see the contract), and it is
 * created explicitly rather than by dropping one clip on another and hoping.
 */
export function moveClip(
  timeline: Timeline,
  clipId: ClipId,
  startSec: number,
  track: number,
): Timeline {
  const clip = clipById(timeline, clipId)
  if (!clip) return timeline
  const start = Math.max(0, startSec)
  const resolved = freeTrackFor(timeline, clip, Math.max(0, Math.round(track)), start)
  return replaceClip(timeline, { ...clip, startSec: start, track: resolved })
}

// ─── transitions ────────────────────────────────────────────────────────────

/**
 * The contract's clamp, applied here as well as in the renderer: a 2 s
 * transition on a 1 s clip is a transition with no clip left to show. Doing it
 * in the editor too means the preview and the export agree about what the user
 * is looking at.
 */
export function effectiveTransitionSec(clip: Clip, side: 'in' | 'out'): number {
  const t = side === 'in' ? clip.transitionIn : clip.transitionOut
  if (!t) return 0
  return Math.max(0, Math.min(t.durationSec, clipDuration(clip) / 2))
}

export function setTransition(
  timeline: Timeline,
  clipId: ClipId,
  side: 'in' | 'out',
  transition: Transition | null,
): Timeline {
  const clip = clipById(timeline, clipId)
  if (!clip) return timeline
  const key = side === 'in' ? 'transitionIn' : 'transitionOut'
  return replaceClip(timeline, { ...clip, [key]: transition ?? undefined })
}

/**
 * A crossfade that actually crosses.
 *
 * `transitionIn = crossfade` on a clip that touches its neighbour end-to-start
 * has nothing to dissolve into — the contract says the renderer will treat that
 * as a fade from black rather than fail, which is legible but is not what the
 * user asked for. So this slides the clip (and everything after it on the same
 * track) back by the transition's length, producing the overlap the dissolve
 * needs. It is the one operation allowed to put two clips over each other on
 * one track, and it is deliberate rather than accidental.
 */
export function applyCrossfade(timeline: Timeline, clipId: ClipId, durationSec: number): Timeline {
  const clip = clipById(timeline, clipId)
  if (!clip) return timeline
  const previous = clipsOnTrack(timeline, clip.track)
    .filter((c) => c.id !== clip.id && clipSpan(c).end <= clip.startSec + 1e-6)
    .pop()
  if (!previous) {
    // Nothing before it: a crossfade from nothing is a fade from black, and the
    // contract says to render it as one. Set it and don't move anything.
    return setTransition(timeline, clipId, 'in', { kind: 'crossfade', durationSec })
  }

  const overlap = Math.max(
    0,
    Math.min(durationSec, clipDuration(clip) / 2, clipDuration(previous) / 2),
  )
  const from = clip.startSec
  const clips = timeline.clips.map((c) => {
    if (c.track !== clip.track || c.startSec < from - 1e-6) return c
    const slid = { ...c, startSec: Math.max(0, c.startSec - overlap) }
    return c.id === clipId
      ? { ...slid, transitionIn: { kind: 'crossfade' as TransitionKind, durationSec: overlap } }
      : slid
  })
  return { ...timeline, clips }
}

// ─── clip-level odds and ends ───────────────────────────────────────────────

export function setClipAudio(
  timeline: Timeline,
  clipId: ClipId,
  patch: { enabled?: boolean; gain?: number },
): Timeline {
  const clip = clipById(timeline, clipId)
  if (!clip) return timeline
  return replaceClip(timeline, {
    ...clip,
    audio: {
      enabled: patch.enabled ?? clip.audio.enabled,
      gain: clamp(patch.gain ?? clip.audio.gain, 0, 4),
    },
  })
}

/**
 * How long an intro/outro card stays on screen.
 *
 * An image has no intrinsic duration, so changing the card length changes the
 * SOURCE — and every clip cut from it has to be re-clamped, or a clip could
 * outlast the thing it is a piece of. Clips that ran to the old end are stretched
 * to the new one, which is what "make the intro 5 seconds" means.
 */
export function setImageDuration(
  timeline: Timeline,
  sourceId: SourceId,
  durationSec: number,
): Timeline {
  const source = sourceById(timeline, sourceId)
  if (!source || source.kind !== 'image') return timeline
  const next = Math.max(MIN_CLIP_SEC, durationSec)
  const wasFullLength = (c: Clip) => Math.abs(c.outSec - source.durationSec) < 1e-6

  const sources = timeline.sources.map((s) => (s.id === sourceId ? { ...s, durationSec: next } : s))
  const clips = timeline.clips.map((c) => {
    if (c.sourceId !== sourceId) return c
    const outSec = wasFullLength(c) ? next : Math.min(c.outSec, next)
    const inSec = Math.min(c.inSec, outSec - MIN_CLIP_SEC)
    return { ...c, inSec: Math.max(0, inSec), outSec }
  })
  return { ...timeline, sources, clips }
}

// ─── internals ──────────────────────────────────────────────────────────────

function replaceClip(timeline: Timeline, clip: Clip): Timeline {
  return { ...timeline, clips: timeline.clips.map((c) => (c.id === clip.id ? clip : c)) }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}
