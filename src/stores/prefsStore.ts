import { createSyncedSettings } from '@unisim/sdk'

/**
 * This app's own switches, shown in Tune this app (the navbar's App
 * preferences dialog).
 *
 * Kept in localStorage and — signed in — on the account (James, 2026-10-30:
 * "mobile app and web app settings in tune this app should be saved and
 * synced to their account … Global rule"). An SDK synced store
 * (`createSyncedSettings`, @unisim/sdk 0.232.0): the SDK provider carries it
 * to the account's `tune-app:video` row, newest change wins; a device that
 * never changed anything takes the account's; signed out it stays here.
 * Same key and shape as before (`{ hideStrips }`), so nobody's choice is lost.
 * Unreadable storage (a private window, blocked site data) just means the
 * defaults.
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

export function normalisePrefs(raw: unknown): Prefs {
  const r = raw && typeof raw === 'object' ? (raw as Partial<Prefs>) : {}
  return { hideStrips: r.hideStrips === true }
}

export const usePrefs = createSyncedSettings<Prefs>('video', DEFAULT_PREFS, normalisePrefs, { storageKey: KEY })

interface PrefsState extends Prefs {
  set(patch: Partial<Prefs>): void
  /** Tune this app ▸ Reset to defaults (the SDK's reset also reaches it). */
  reset(): void
}

const actions = { set: (patch: Partial<Prefs>) => usePrefs.set(patch), reset: () => usePrefs.reset() }

function usePrefsSlice<U>(selector: (s: PrefsState) => U): U {
  return usePrefs((s) => selector({ ...s, ...actions }))
}

/** The zustand-style view the components use: values and setters together. */
export const usePrefsStore = Object.assign(usePrefsSlice, {
  getState: (): PrefsState => ({ ...usePrefs.getState(), ...actions }),
})
