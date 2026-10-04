import { create } from 'zustand'

/**
 * This app's own switches, shown in Tune this app (the navbar's App
 * preferences dialog).
 *
 * Device-local, in localStorage: how THIS device draws the editor, not a fact
 * about anybody's video. Unreadable storage (a private window, blocked site
 * data) just means the defaults.
 *
 * ⚠️ Every tick box in the suite starts UNTICKED, and is worded so that
 * unticked is the ordinary app. Thumbnails and waveforms are on by default, so
 * the box is "Hide timeline thumbnails" — ticking it is the opt-out.
 */
export interface Prefs {
  /** Plain coloured clip blocks instead of frames and a sound wave. */
  hideStrips: boolean
}

const KEY = 'unisim-video-prefs'
export const DEFAULT_PREFS: Prefs = { hideStrips: false }

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>
    return { hideStrips: raw.hideStrips === true }
  } catch {
    return DEFAULT_PREFS
  }
}

interface PrefsState extends Prefs {
  set(patch: Partial<Prefs>): void
  /** Tune this app ▸ Reset to defaults. */
  reset(): void
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch)
    try {
      localStorage.setItem(KEY, JSON.stringify({ hideStrips: get().hideStrips }))
    } catch {
      // Still applies until the tab closes.
    }
  },
  reset: () => {
    set(DEFAULT_PREFS)
    try {
      localStorage.removeItem(KEY)
    } catch {
      // As above.
    }
  },
}))
