import type { Plugin } from 'vite'

/** Serves public/_headers' Content-Security-Policy, Report-Only, on the dev server. */
export function cspDev(): Plugin
