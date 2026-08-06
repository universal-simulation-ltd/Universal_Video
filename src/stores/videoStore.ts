import { create } from 'zustand'
import {
  convertVideo,
  planConversion,
  probeVideoFile,
  videoSupported,
  DEFAULT_VIDEO_SETTINGS,
  VIDEO_INPUT_EXTS,
  type ConversionPlan,
  type ConvertedFile,
  type VideoProbe,
  type VideoProgress,
  type VideoSettings,
} from '@unisim/media'
import { secondsRemaining } from '../lib/eta'

/**
 * One file at a time, on purpose.
 *
 * Universal Converter has a queue because it converts batches of podcast
 * episodes and folders of photos. This app answers one question — "make this
 * video smaller" — and a queue would mean either running conversions in
 * parallel (which is how you hit the memory ceiling on purpose) or hiding a
 * serial queue behind a progress bar that says nothing useful. One file, one
 * prediction, one honest answer.
 */
export type Phase = 'idle' | 'reading' | 'ready' | 'running' | 'done' | 'failed'

export interface RunProgress extends VideoProgress {
  /** Wall-clock start, so a remaining-time estimate can come from real speed. */
  startedAt: number
  /** Seconds left, once enough frames have gone through to mean anything. */
  secondsLeft: number | null
}

interface VideoState {
  phase: Phase
  /** null until the browser has been asked whether it can encode H.264 at all. */
  supported: boolean | null
  file: File | null
  probe: VideoProbe | null
  settings: VideoSettings
  /** Recomputed on every settings change — this is what arms or refuses the button. */
  plan: ConversionPlan | null
  progress: RunProgress | null
  result: ConvertedFile | null
  error: string | null

  checkSupport(): Promise<void>
  chooseFile(file: File): Promise<void>
  updateSettings(patch: Partial<VideoSettings>): void
  /** Adopt the setting the refusal suggested. */
  acceptAlternative(): void
  convert(): Promise<void>
  download(): void
  reset(): void
}

export const useVideoStore = create<VideoState>((set, get) => ({
  phase: 'idle',
  supported: null,
  file: null,
  probe: null,
  settings: DEFAULT_VIDEO_SETTINGS,
  plan: null,
  progress: null,
  result: null,
  error: null,

  checkSupport: async () => {
    set({ supported: await videoSupported() })
  },

  // Everything expensive is refused BEFORE it starts. The probe is a header
  // read (see @unisim/media's probe.ts) so a 4 GB file lands here in
  // milliseconds and without going anywhere near memory.
  chooseFile: async (file) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!VIDEO_INPUT_EXTS.includes(ext)) {
      set({
        phase: 'failed',
        file,
        probe: null,
        plan: null,
        result: null,
        error:
          `This app reads MP4, M4V and MOV. A .${ext || '???'} file isn’t one of them — and that’s not a ` +
          `missing feature so much as a different product: MKV and AVI need a whole other container reader, ` +
          `and the browser can’t decode the video inside an AVI or WMV even once it’s open.`,
      })
      return
    }

    set({ phase: 'reading', file, probe: null, plan: null, result: null, error: null, progress: null })
    try {
      const probe = await probeVideoFile(file)
      const settings = get().settings
      set({ phase: 'ready', probe, plan: planConversion(probe, settings) })
    } catch (err) {
      set({
        phase: 'failed',
        probe: null,
        plan: null,
        error: err instanceof Error ? err.message : 'This file couldn’t be read',
      })
    }
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    const probe = get().probe
    set({ settings, plan: probe ? planConversion(probe, settings) : null })
  },

  acceptAlternative: () => {
    const alternative = get().plan?.alternative
    if (!alternative) return
    get().updateSettings(alternative.settings)
  },

  convert: async () => {
    const { file, settings, plan, phase } = get()
    if (!file || phase === 'running') return
    // The refusal is enforced here as well as in the UI. A disabled button is a
    // hint; this is the guarantee.
    if (plan?.verdict === 'refuse') return

    set({
      phase: 'running',
      error: null,
      result: null,
      progress: { fraction: 0, framesDone: 0, framesTotal: 0, bytesOut: 0, startedAt: Date.now(), secondsLeft: null },
    })

    try {
      const result = await convertVideo(
        file,
        settings,
        () => {},
        (detail) => {
          const started = get().progress?.startedAt ?? Date.now()
          const elapsed = (Date.now() - started) / 1000
          // The time estimate measures THIS device's actual encoder rather than
          // a lookup table, which is the only way it can be right on both a
          // desktop with hardware encoding and a phone without. See lib/eta.ts.
          const secondsLeft = secondsRemaining(detail.framesDone, detail.framesTotal, elapsed)
          set({ progress: { ...detail, startedAt: started, secondsLeft } })
        },
      )
      set({ phase: 'done', result })
    } catch (err) {
      set({
        phase: 'failed',
        progress: null,
        error: err instanceof Error ? err.message : 'The conversion failed',
      })
    }
  },

  download: () => {
    const result = get().result
    if (!result) return
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.name
    a.click()
    // Revoked on the next tick rather than immediately: Safari has been known
    // to cancel the download if the URL dies in the same frame as the click.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },

  reset: () =>
    set({
      phase: 'idle',
      file: null,
      probe: null,
      settings: DEFAULT_VIDEO_SETTINGS,
      plan: null,
      progress: null,
      result: null,
      error: null,
    }),
}))
