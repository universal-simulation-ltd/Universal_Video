import { create } from 'zustand'

/** The window of timeline surface px worth drawing strips for. Set by TimelineView on scroll. */
export const useStripWindow = create<{ from: number; to: number; set(w: { from: number; to: number }): void }>(
  (set, get) => ({
    from: -Infinity,
    to: Infinity,
    set: (w) => {
      if (w.from !== get().from || w.to !== get().to) set(w)
    },
  }),
)
