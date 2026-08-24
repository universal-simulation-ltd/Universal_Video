import { useEffect, useRef } from 'react'
import { smoothstep, unSmoothstep } from '../lib/illustrationClock'

/** One sweep of the loop, frame 0 → the finished frame, in ms. It runs straight back down. */
const SWEEP_MS = 5200
/** The glide back to frame 0 when the pointer arrives. */
const RETURN_MS = 480

/**
 * The landing illustration: a clip sitting on a timeline is played up to the
 * playhead, cut there, and its tail dropped — and the line underneath it goes
 * from 00:42 · 24.6 MB to 00:18 · 5.9 MB. Then it unwinds and does it again.
 *
 * It is the left-hand half of the front door, the shape Universal PDF and
 * Universal Images already use: what the app DOES on one side, the drop circle
 * on the other. The circle's own backdrop (`DropWatermark`) draws the same idea
 * in five thin strokes; this is the version with room to actually show it.
 *
 * ONE CLOCK, NOT TEN ANIMATIONS
 * -----------------------------
 * Everything is a window on a single `--t`, 0 → 1, set here and read by
 * `index.css`. See `lib/illustrationClock.ts` for why one number rather than
 * ten `@keyframes`, and for the ⚠️ about this being the suite's third copy of
 * the loop below.
 *
 * ⚠️ THE GEOMETRY IS THE ARITHMETIC. The cut sits at x = 226 because the clip
 * runs 64 → 436 and 18 seconds is 43.5% of 42 — and the player's scrub bar
 * fills to that same 43.5%, because it is the same position said twice. Move
 * the cut and the three matching windows in `index.css` (`.vi-playhead`,
 * `.vi-scrub`, `.vi-scrub-knob`) move with it, or the picture starts lying
 * about its own numbers.
 *
 * BOTH THEMES
 * -----------
 * Every surface, rule and piece of text below paints from a `--vi-*` custom
 * property, set on `.vid-illu` in `index.css` and swapped under `.dark`. They
 * are inline `style` rather than `fill=`/`stroke=` attributes on purpose: a
 * presentation attribute cannot hold a `var()`. What stays hard-coded is what
 * is the same in both themes — the orange, the green of the badge, and
 * anything sitting on the player's own dark screen.
 *
 * WHY HOVER STOPS IT RATHER THAN STARTING IT
 * ------------------------------------------
 * This sits beside the drop circle, so the pointer arriving means the user is
 * reading or aiming, and a picture that keeps moving under the cursor competes
 * with the thing they came to click. It settles on frame 0 and stays there.
 *
 * ⚠️ Frame 0 is the whole clip, un-cut, with the playhead at the start — a
 * still that already reads as "a video on a timeline". Do not rebuild it as an
 * empty stage that assembles itself: frame 0 is what a hovering visitor looks
 * at, and a fade-in would leave them with nothing.
 */
export default function VideoIllustration() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const set = (t: number) => el.style.setProperty('--t', t.toFixed(4))

    // ⚠️ Reduced motion gets the FINISHED frame, not frame 0 and not a slower
    // loop. An infinite animation has no honest "reduced" version, and frame 0
    // is the clip before anything has been done to it — the still that says
    // least about what the app is for.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      set(1)
      return
    }

    let raf = 0
    let clock = 0 // 0 → 2. 0–1 cuts the clip, 1–2 puts it back.
    let shown = 0 // the eased value last written, so a mid-glide exit can resume from it
    let last = 0
    let hovering = false
    let from = 0 // where the glide back to frame 0 started
    let since = 0 // ms into that glide

    function frame(now: number) {
      // A backgrounded tab stops firing rAF entirely; the first frame back
      // would otherwise carry the whole gap and jump the loop forward.
      const dt = Math.min(now - last, 100)
      last = now

      if (hovering) {
        since += dt
        shown = from * (1 - smoothstep(Math.min(since / RETURN_MS, 1)))
        set(shown)
        // Parked on frame 0 — stop asking for frames until the pointer leaves.
        if (since >= RETURN_MS) {
          raf = 0
          return
        }
      } else {
        clock = (clock + dt / SWEEP_MS) % 2
        shown = smoothstep(clock <= 1 ? clock : 2 - clock)
        set(shown)
      }
      raf = requestAnimationFrame(frame)
    }

    function start() {
      if (raf) return
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }

    function onEnter() {
      if (hovering) return
      hovering = true
      from = shown
      since = 0
      start()
    }

    function onLeave() {
      if (!hovering) return
      hovering = false
      // Pick up the clock wherever the glide left the picture, on the way up.
      clock = unSmoothstep(shown)
      start()
    }

    // Only on a real pointer. On a touch screen `pointerenter` fires on a tap
    // and there is no matching leave, which would park the loop for good.
    const canHover = window.matchMedia('(hover: hover)').matches
    if (canHover) {
      el.addEventListener('pointerenter', onEnter)
      el.addEventListener('pointerleave', onLeave)
    }
    start()

    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (canHover) {
        el.removeEventListener('pointerenter', onEnter)
        el.removeEventListener('pointerleave', onLeave)
      }
    }
  }, [])

  return (
    <div ref={ref} data-testid="illustration" className="vid-illu relative w-full max-w-lg select-none">
      <svg
        viewBox="0 0 500 470"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <clipPath id="vi-screen-clip">
            <rect x="72" y="60" width="356" height="200" rx="10" />
          </clipPath>
          {/* Each clip body clips its own waveform, so the bars stop at the cut
              rather than running through it. */}
          <clipPath id="vi-keep-clip">
            <rect x="64" y="348" width="162" height="56" />
          </clipPath>
          <clipPath id="vi-tail-clip">
            <rect x="226" y="348" width="210" height="56" />
          </clipPath>
          <linearGradient id="vi-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="55%" stopColor="#334155" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <filter id="vi-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#0f172a" floodOpacity="0.16" />
          </filter>
        </defs>

        {/* ── The player ────────────────────────────────────────────────── */}
        <rect x="60" y="48" width="380" height="236" rx="18" strokeWidth="2" filter="url(#vi-shadow)" style={{ fill: 'var(--vi-surface)', stroke: 'var(--vi-edge)' }} />

        <g clipPath="url(#vi-screen-clip)">
          <rect x="72" y="60" width="356" height="200" fill="url(#vi-sky)" />
          {/* A low sun over two ridges: warm on cold, so the screen reads as a
              picture rather than a grey placeholder box. */}
          <circle cx="356" cy="112" r="22" fill="#fb923c" opacity="0.9" />
          <path d="M72 214 L150 158 L214 196 L286 146 L360 200 L428 168 L428 260 L72 260 Z" fill="#0b1220" opacity="0.75" />
          <path d="M72 260 L134 206 L206 240 L272 204 L348 246 L428 214 L428 260 Z" fill="#020617" />

          {/* The timecode ticking over — the playhead's position, in words.
              ⚠️ THREE values, not two. Two would leave the pill EMPTY for the
              whole gap between them, which is a sixth of the sweep and reads as
              a broken player; the middle one closes it. The windows overlap by
              a hair rather than meeting exactly, for the same reason: meeting
              exactly is a frame of nothing. */}
          <rect x="86" y="74" width="74" height="26" rx="8" fill="#0f172a" opacity="0.72" />
          <text className="vi-tc-a" x="123" y="92" textAnchor="middle" fontSize="14" fontWeight="600" fill="#e2e8f0" fontFamily="ui-monospace, SFMono-Regular, monospace">
            00:00
          </text>
          <g className="vi-tc-b-out">
            <text className="vi-tc-b" x="123" y="92" textAnchor="middle" fontSize="14" fontWeight="600" fill="#e2e8f0" fontFamily="ui-monospace, SFMono-Regular, monospace">
              00:09
            </text>
          </g>
          <text className="vi-tc-c" x="123" y="92" textAnchor="middle" fontSize="14" fontWeight="600" fill="#e2e8f0" fontFamily="ui-monospace, SFMono-Regular, monospace">
            00:18
          </text>

          {/* Play, then not, then play again — the difference between a still
              and a clip that ran. Three separate glyphs over ONE static disc:
              crossfading two whole buttons dips the disc through the overlap,
              and a single node cannot fade out AND back in from one clock
              window — so the pause is TWO nested groups whose opacities
              multiply, one fading it in and one taking it away again. Same
              trick as the scissors below; it is the only one this file uses. */}
          <circle cx="250" cy="160" r="30" fill="#ffffff" opacity="0.92" />
          <path className="vi-glyph-play" d="M241 148 L266 160 L241 172 Z" fill="#0f172a" />
          <g className="vi-glyph-pause-out">
            <g className="vi-glyph-pause">
              <rect x="240" y="149" width="7" height="22" rx="2" fill="#0f172a" />
              <rect x="253" y="149" width="7" height="22" rx="2" fill="#0f172a" />
            </g>
          </g>
          <path className="vi-glyph-play-again" d="M241 148 L266 160 L241 172 Z" fill="#0f172a" />
        </g>

        {/* The player's own scrub bar, filling in step with the playhead below. */}
        <rect x="72" y="269" width="356" height="6" rx="3" style={{ fill: 'var(--vi-bar-track)' }} />
        <rect className="vi-scrub" x="72" y="269" width="356" height="6" rx="3" fill="#ea580c" style={{ transformOrigin: '72px 272px' }} />
        <g transform="translate(72 272)">
          <circle className="vi-scrub-knob" r="7" stroke="#ea580c" strokeWidth="3" style={{ fill: 'var(--vi-surface)' }} />
        </g>

        {/* ── The timeline ─────────────────────────────────────────────── */}
        <g strokeWidth="1.5" strokeLinecap="round" style={{ stroke: 'var(--vi-rule)' }}>
          <path d="M60 330 H440" />
          <path d="M60 330 V322 M136 330 V322 M212 330 V322 M288 330 V322 M364 330 V322 M440 330 V322" />
        </g>

        <rect x="56" y="342" width="388" height="68" rx="12" strokeWidth="2" style={{ fill: 'var(--vi-well)', stroke: 'var(--vi-edge)' }} />

        {/* ⚠️ NEITHER PIECE IS A ROUNDED RECT, and the reason is frame 0. The
            two are separate nodes from the start — the cut is the tail being
            let go of, not a rectangle split at runtime — but at frame 0 they
            have to read as ONE clip that has not been cut yet. Two `rx="8"`
            rects abutting show four rounded corners and a seam down the middle,
            which is a picture of a cut that has already happened.

            So each piece is drawn twice: a closed path for the FILL, whose
            inner edge is square, and an OPEN path for the outline that omits
            that inner edge entirely. At frame 0 the two outlines join into one
            unbroken boundary with no seam. What seals the head's open right
            edge afterwards is `.vi-selected`, which draws itself round the
            survivor as the tail leaves — and its square right corner is
            correct: a cut edge is square. */}
        <g className="vi-tail">
          <path d="M226 348 H428 a8 8 0 0 1 8 8 V396 a8 8 0 0 1 -8 8 H226 Z" style={{ fill: 'var(--vi-clip)' }} />
          <g clipPath="url(#vi-tail-clip)" stroke="#fb923c" strokeWidth="2.5" strokeLinecap="round" opacity="0.75">
            <path d="M234 386 V366 M248 390 V362 M262 382 V370 M276 392 V360 M290 384 V368 M304 388 V364 M318 380 V372 M332 391 V361 M346 385 V367 M360 389 V363 M374 383 V369 M388 387 V365 M402 390 V362 M416 384 V368" />
          </g>
          <path d="M226 348 H428 a8 8 0 0 1 8 8 V396 a8 8 0 0 1 -8 8 H226" fill="none" stroke="#fb923c" strokeWidth="2" />
        </g>

        {/* The head — the clip that survives — and its selection outline. */}
        <g>
          <path d="M226 348 H72 a8 8 0 0 0 -8 8 V396 a8 8 0 0 0 8 8 H226 Z" style={{ fill: 'var(--vi-clip)' }} />
          <g clipPath="url(#vi-keep-clip)" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" opacity="0.8">
            <path d="M80 386 V366 M94 391 V361 M108 383 V369 M122 389 V363 M136 379 V373 M150 392 V360 M164 384 V368 M178 388 V364 M192 381 V371 M206 390 V362 M220 385 V367" />
          </g>
          <path d="M226 348 H72 a8 8 0 0 0 -8 8 V396 a8 8 0 0 0 8 8 H226" fill="none" stroke="#fb923c" strokeWidth="2" />
          <path className="vi-selected" d="M226 348 H72 a8 8 0 0 0 -8 8 V396 a8 8 0 0 0 8 8 H226 Z" fill="none" stroke="#ea580c" strokeWidth="3" />
        </g>

        {/* Where the tail used to be, held for a beat so the shorter clip has
            something to be shorter *than*. */}
        <path className="vi-ghost" d="M226 348 H428 a8 8 0 0 1 8 8 V396 a8 8 0 0 1 -8 8 H226 Z" fill="none" stroke="#fb923c" strokeWidth="2" strokeDasharray="7 7" />

        {/* The playhead, and the scissors riding on it. The base position is an
            attribute on an outer group and the animation a CSS transform on an
            inner one — a `transform` rule on the same node would REPLACE the
            attribute rather than add to it, and the whole thing would jump to
            x = 0. */}
        <g transform="translate(64 0)">
          <g className="vi-playhead">
            <path d="M0 318 V414" strokeWidth="2.5" strokeLinecap="round" style={{ stroke: 'var(--vi-ink)' }} />
            {/* The playhead's own head, which the scissors take over from —
                they occupy the same 30-odd units between the player card and
                the ruler, and there is no room for both. */}
            <path className="vi-playhead-arrow" d="M-7 310 H7 L0 322 Z" style={{ fill: 'var(--vi-ink)' }} />
            {/* The scissors arrive with the playhead and leave with the tail.
                That is two windows on one element, which one `--t` window
                cannot do — so it is two nested groups whose opacities
                multiply: the inner one fades it in, the outer one takes it
                away again after the cut. */}
            <g transform="translate(0 304)">
              <g className="vi-scissors-out">
                {/* ⚠️ `0px 0px`, NOT the group's y in the viewBox. The
                    scissors sit inside two translated groups, so its own local
                    origin IS its centre — naming the absolute y here scales it
                    about a point 300 units away and throws it up into the
                    player. */}
                <g className="vi-scissors-in" style={{ transformOrigin: '0px 0px' }}>
                  <g strokeWidth="2.2" strokeLinecap="round" fill="none" style={{ stroke: 'var(--vi-ink)' }}>
                    <path d="M-7 -12 L4 4 M7 -12 L-4 4" />
                    <circle cx="-6" cy="8" r="4.5" />
                    <circle cx="6" cy="8" r="4.5" />
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>

        {/* Before and after, in the same place, with a beat of nothing between. */}
        <text className="vi-stat-before" x="250" y="452" textAnchor="middle" fontSize="17" fontFamily="ui-sans-serif, system-ui" style={{ fill: 'var(--vi-muted)' }}>
          00:42 · 24.6 MB
        </text>
        <text className="vi-stat-after" x="250" y="452" textAnchor="middle" fontSize="17" fontWeight="600" fontFamily="ui-sans-serif, system-ui" style={{ fill: 'var(--vi-ink)' }}>
          00:18 · 5.9 MB
        </text>

        {/* −76%, stamped into the track the tail just gave back. Not the trim
            alone — 18 seconds of 42 is 43% — the rest is the quality the export
            is written at, which is the other half of what the button does. */}
        <g className="vi-badge" style={{ transformOrigin: '370px 376px' }}>
          <rect x="318" y="355" width="104" height="42" rx="21" stroke="#10b981" strokeWidth="2" style={{ fill: 'var(--vi-badge-bg)' }} />
          <text x="370" y="383" textAnchor="middle" fontSize="20" fontWeight="700" fontFamily="ui-sans-serif, system-ui" style={{ fill: 'var(--vi-badge-ink)' }}>
            −76%
          </text>
        </g>
      </svg>
    </div>
  )
}
