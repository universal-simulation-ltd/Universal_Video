/**
 * The drop circle's backdrop — a clip on a timeline, being trimmed.
 *
 * Same rule as the other Universal apps' versions of this: STROKE ONLY, no
 * fills. The ring's interior is an opaque white circle, so pale fills have
 * nothing left to show once knocked back to a fraction of opacity; thin lines
 * are what survive.
 *
 * ⚠️ Render as a CHILD of <DropRing>, never behind it — DropRing paints that
 * white interior itself, so anything positioned behind the ring is covered.
 *
 * ⚠️ Top and bottom bands only. This ring carries THREE lines of copy, so the
 * middle belongs to the words; a drawing through there reads as a scribble
 * behind text rather than a backdrop.
 */

const LOOP_MS = 9000

// pathLength={100} on every animated path, so the dash values below are
// PERCENTAGES of each stroke and survive a curve being moved.
const CSS = `
  .vw-frame, .vw-play, .vw-track, .vw-clip, .vw-head {
    stroke-dasharray: 100;
    stroke-dashoffset: 100;
    animation-duration: ${LOOP_MS}ms;
    animation-iteration-count: infinite;
    animation-timing-function: ease-in-out;
  }
  @keyframes vw-draw {
    0%        { stroke-dashoffset: 100; opacity: 0; }
    4%        { opacity: 1; }
    22%, 82%  { stroke-dashoffset: 0; opacity: 1; }
    94%, 100% { stroke-dashoffset: 0; opacity: 0; }
  }
  .vw-frame { animation-name: vw-draw; animation-delay: 0ms; }
  .vw-play  { animation-name: vw-draw; animation-delay: 700ms; }
  .vw-track { animation-name: vw-draw; animation-delay: 1600ms; }
  .vw-clip  { animation-name: vw-draw; animation-delay: 2100ms; }
  .vw-head  { animation-name: vw-draw; animation-delay: 2700ms; }

  /* ⚠️ Reduced motion gets the FINISHED drawing, not a slower loop and not
     frame 0 — frame 0 is an empty rectangle, the least useful still. */
  @media (prefers-reduced-motion: reduce) {
    .vw-frame, .vw-play, .vw-track, .vw-clip, .vw-head {
      animation: none;
      stroke-dashoffset: 0;
      opacity: 1;
    }
  }
`

const INK = '#94a3b8'
const ACCENT = '#f97316'

export default function DropWatermark() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true" focusable="false">
      <style>{CSS}</style>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* The frame, 16:9 rather than square — the shape that says "video"
            where Images' is a photo and PDF's a portrait page. */}
        <rect className="vw-frame" pathLength={100} x="30" y="10" width="60" height="34" rx="4" stroke={INK} strokeWidth="1.6" />
        <path className="vw-play" pathLength={100} d="M54 20 L70 27 L54 34 Z" stroke={INK} strokeWidth="1.6" />

        {/* The timeline. A clip on a track with a playhead is what makes this
            an editor rather than a player. */}
        <path className="vw-track" pathLength={100} d="M16 100 H104" stroke={INK} strokeWidth="1.4" strokeOpacity="0.7" />
        <rect className="vw-clip" pathLength={100} x="34" y="93" width="46" height="14" rx="3" stroke={INK} strokeWidth="1.5" />
        {/* The playhead gets the accent — it is the thing that moves. */}
        <path className="vw-head" pathLength={100} d="M66 87 V113" stroke={ACCENT} strokeWidth="2.2" />
      </g>
    </svg>
  )
}
