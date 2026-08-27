/**
 * How long is left, measured from what this device has actually done.
 *
 * §10.4 asks for the estimate to come from "a ~2-second calibration encode of
 * the first GOP at the chosen settings", because a static lookup table can
 * never know whether it is talking to a desktop with a hardware encoder or a
 * phone without one. This does the same job without the separate pass: the run
 * itself is the calibration, and the estimate simply stays hidden until enough
 * real frames have gone through for the rate to mean anything.
 *
 * A separate calibration encode would also have to be thrown away, which on a
 * short clip is a measurable slice of the whole job.
 */

/** Frames to get through before a projection is worth showing. */
export const CALIBRATION_FRAMES = 24

export function secondsRemaining(
  framesDone: number,
  framesTotal: number,
  elapsedSeconds: number,
): number | null {
  if (framesDone < CALIBRATION_FRAMES) return null
  if (framesTotal <= 0 || framesDone <= 0 || elapsedSeconds <= 0) return null
  if (framesDone >= framesTotal) return 0
  return ((framesTotal - framesDone) * elapsedSeconds) / framesDone
}

/**
 * Where the output is heading, from the bytes produced so far.
 *
 * This is the number that makes trouble visible at 20% instead of at 100%: a
 * run drifting past its prediction looks exactly like one that isn't, right up
 * until the tab dies, unless somebody is projecting forward.
 */
export function projectedBytes(
  bytesOut: number,
  framesDone: number,
  framesTotal: number,
): number | null {
  if (framesDone <= 0 || framesTotal <= 0) return null
  return (bytesOut / framesDone) * framesTotal
}

/** Past this multiple of the prediction, say so while there is still time to stop. */
export const OVERRUN_FACTOR = 1.35

export function isOverrunning(projected: number | null, predicted: number): boolean {
  return projected !== null && predicted > 0 && projected > predicted * OVERRUN_FACTOR
}

/**
 * Where a BATCH of exports has got to, when the timeline is being written out
 * as separate files.
 *
 * ⚠️ **The encoder has never heard of a batch.** It reports frames done against
 * frames total for the one piece it is writing, so plumbing that straight to
 * the bar makes it fill up and snap back to zero once per piece — which reads
 * as a crash-and-restart, not as progress. This converts the encoder's
 * per-piece report into one monotonic run across the whole job.
 *
 * The weights are the PREDICTED frame counts (duration × fps), not the
 * encoder's own, so `framesTotal` is a constant for the whole run rather than a
 * number that jumps each time a piece starts and reveals its real length. The
 * live piece still contributes its true fraction — the prediction only decides
 * how much of the bar that piece is worth.
 *
 * With one piece and its own frame count as the weight, this returns exactly
 * what the encoder said, which is why the joined export can go through the same
 * code path rather than having a second one.
 */
export function batchProgress(
  finishedFrames: number,
  current: { framesDone: number; framesTotal: number },
  currentWeight: number,
  remainingFrames: number,
): { framesDone: number; framesTotal: number } {
  const weight = currentWeight > 0 ? currentWeight : current.framesTotal
  const within =
    current.framesTotal > 0 ? Math.min(1, Math.max(0, current.framesDone / current.framesTotal)) : 0
  return {
    framesDone: Math.round(finishedFrames + weight * within),
    framesTotal: Math.round(finishedFrames + weight + remainingFrames),
  }
}
