# Universal Video

**Clip, cut and resize a video without uploading it.** Drop an MP4, M4V or MOV
and it is opened right here, in the tab, by your own browser — with a player and
a timeline. Trim it, cut it, stack clips, choose the size and shape it comes out
at, and save it back — as one movie, or with every cut written out as its own
file in a zip. It will compress a video without uploading it too, which is
the phrase this app was founded on; it is simply no longer the whole of what it
is for. **No upload, no account, no size cap, no watermark, no queue** — and no
server ever sees a frame of it.

Part of the [UNI·SIM Universal Apps](https://opensource.unisim.co.uk) — free,
open source, no account required. Served at `opensource.unisim.co.uk/video`.

---

## How it works, in one diagram

```
  your file ──▶ mp4read ──▶ VideoDecoder ──▶ canvas ──▶ VideoEncoder ──▶ mp4mux ──▶ your file
   (on disk)    (our code)   (the browser)   (scale)   (the browser)   (our code)   (smaller)
                                                                        │
                     the audio track: decodeAudioData ─▶ OfflineAudioContext ─▶ AudioEncoder
```

Every box on that line runs inside the tab. **There is no server in the picture,
because there is no picture of a server** — nothing is fetched to make it work,
so there is nothing to intercept and nothing to trust us about. Open the network
tab and watch.

The codecs are the browser's own, through **WebCodecs**. What isn't in the
browser is the *container*: WebCodecs deals in frames, so nothing in the platform
will hand you an `EncodedVideoChunk` out of an MP4 or turn chunks back into one.
That part is ours, and it lives in
**[`@unisim/media`](https://www.npmjs.com/package/@unisim/media)** — shared with
[Universal Converter](https://opensource.unisim.co.uk/converter), which is where
it was written.

**No `ffmpeg.wasm`. No GPL. No 30 MB download. No CDN. No COOP/COEP.** Those are
decisions, not oversights — see [Don't](#dont) at the bottom.

## What it deliberately cannot do

These are on the page in the app itself, not just here.

⚠️ **The rule this list used to come from is gone.** It read: *one input file,
one output file, one setting applied to the whole file, and no time axis beyond a
single in/out pair — anything needing a second input is an editor, and this is
not one.* It **is** an editor now: a player, a timeline, several sources, cuts,
stacked video tracks, intro/outro cards and transitions. Compressing one file is
simply the case where the timeline has one clip on it, and that path is still one
drag and one click. What has **not** changed is everything below.

| | |
|---|---|
| **Read MKV, WebM, AVI or WMV** | ❌ No. MKV and WebM need a Matroska/EBML reader (a real piece of work, and the top of the backlog). AVI and WMV are refused **permanently** — the browser cannot decode MPEG-4 ASP or WMV3, so a reader would buy a different error message, not a working conversion. |
| **Read fragmented MP4** | ❌ Not yet. Common from screen recorders and some phone apps, so the refusal fires more often than its rarity suggests. It is detected on drop and named, not parsed half-way. |
| **Write WebM / VP9** | ❌ Not yet — and this is the highest-value gap, because it is also what would make **Firefox** a supported browser. WebCodecs already has the VP9 encoder; only the container is missing. |
| **Split into separate files** | ✅ Every cut on the timeline can come out as its own MP4, delivered as one `.zip` — see [Separate files](#separate-files-one-timeline-n-mp4s) below. One pill in the export panel; no split-point editor, because the cuts already on the timeline **are** the pieces. Refused (with the reason, and the fix) on a timeline that isn't a plain row of cuts: a stacked clip or a crossfade belongs to two pieces at once. |
| **Edit** | ✅ Trim, cut at the playhead, delete, slide clips along and between tracks, stack them (two clips slid over each other add a track rather than overwriting), intro/outro cards from an image or a video, and crossfade / fade-to-black between clips. **A clip carries its own audio**, so a cut splits picture and sound at the same instant by construction — see [`timeline.ts`](https://github.com/universal-simulation-ltd/universal-platform/blob/main/packages/media/src/timeline.ts), the contract this editor and the renderer share. |
| **Reframe** | ✅ The output frame is chosen, not inherited: match the source (the default), 1920×1080, 1080×1920, 1080×1080, or a size you type. A source of a different shape is **centred and the rest filled black** — *contain*, never *cover*, so nothing is ever cropped away. Both edges are forced even (H.264 codes in 16×16 macroblocks and the renderer refuses an odd one up front). The preview canvas is the output frame and letterboxes through the same `fitInside()` maths, so what you see while editing is what comes out. An **upright** frame is capped at 540 px tall in the viewer (`src/lib/layout.ts`) instead of drawing ~1280 px and pushing the timeline off the screen — and the timeline narrows with it, because the needle is placed as a fraction of that width. |
| **Crop, zoom-to-fill, per-clip position** | ❌ No. Reframing is letterbox/pillarbox only. A fill mode would silently throw away picture that is visible in the preview; black bars are visible and fixable, a missing head is neither. |
| **Filters, text, speed ramps, detached audio** | ❌ No colour work, no titles or watermarks, no speed changes, and no separating a clip's sound from its picture. Transitions are crossfade and fade to black only. |
| **Record** | ❌ That is **[Universal Recorder](https://opensource.unisim.co.uk/recorder)**. Adjacent products should not grow into each other. |
| **Fall back to a server for big files** | ⛔ **Never.** One *"we'll process the big ones on our server"* button would make every other sentence on the page false, and it would be discovered in five seconds by anyone with devtools open. If a hosted path ever exists it is a separate, explicitly-labelled product. |
| **Run in Firefox** | ❌ Firefox has no WebCodecs H.264 **encoder**. It is probed on arrival and said plainly, rather than failing after a long wait. **Tested on Chrome and Edge.** Safari 16.4+ ships WebCodecs and ought to work, but it has never been run there — an untested browser is not a supported one, so it is not claimed as one. |

## Separate files: one timeline, N MP4s

The client ask this was built for: *"cut a video at multiple points and export
each piece separately, as a zip."*

**Almost none of it was new work, and the design is why.** `cutAt()` already
turned one clip into several and the timeline already drew them, so "multiple
cut points" needed no marking UI at all — pressing **Cut at playhead** a few
times is the feature's input. What was missing was one sentence of intent on the
way out: *don't join these back together.* So the whole of it in the UI is two
pills at the top of the export panel:

```
  WHAT COMES OUT
  [ One video ]  [ Separate files — 5 ]
```

Everything below that line — frame, quality, resolution, sound — is unchanged
and applies to **every** piece. There is no per-file setup, no segment list and
no second screen.

Three things are worth knowing about how it works:

**Each piece is a one-clip `Timeline` starting at zero**
([`lib/segments.ts`](src/lib/segments.ts)), and that is not a convenience. Read
`exportRoute()` in
[`lib/render.ts`](src/lib/render.ts): every one of its five conditions is then
satisfied, so each piece takes the **`compress` route** — `convertVideo()` with
a trim, the path this app has shipped and been proven on since v1. N pieces
reuse the oldest code in the product instead of introducing a second way to be
wrong. The normalisation to zero is what earns that: `startSec` means "where the
black stops", so a piece exported at its timeline position would carry a minute
and a half of black at the head.

**The mode is refused, not guessed at, when the timeline isn't a plain row of
cuts.** Separate files means "this instant belongs to exactly one piece", and a
stacked or dissolving timeline has instants belonging to two — there is no
honest answer to *which file does the crossfade go in?* So the pill greys out
and names the fix, the same way the memory refusal does.

**A zip does not lower the ceiling, and it was tempting to assume it does.**
Only one piece is in the encoder at a time, so the biggest single output is
small — but `createZip()` copies every finished piece into a new blob, so the
moment the zip is built the tab holds all of them twice. That is
`sources + 2 × Σ pieces`: the same shape as the joined export.
`peakBytesForTimeline()` in [`lib/memory.ts`](src/lib/memory.ts) writes the
arithmetic out in full, because a formula that was optimistic here would
defeat the one defence there is against tab death.

What *does* change with the mode is the predicted length. A gap left by a
deleted clip is written as black in a joined movie and simply isn't a piece in a
zip, so the same timeline honestly predicts two different sizes — which is why
the plan is computed per mode and the button reads its number from the plan.

Naming is `01_holiday_00-01-32.mp4`: index first so an unzipped folder sorts
back into timeline order (zero-padded to the width of the count, or ten pieces
sort `10` before `2`), then the source's stem, then the piece's in-point **in
its own source** — which answers the question a file name gets asked, *where in
the original did this come from?*

> The zip writer itself ([`lib/zip.ts`](src/lib/zip.ts)) is a dependency-free
> STORED archiver — an MP4 does not deflate — and is the **fourth verbatim copy**
> in the suite, after Converter, Compress and PDF. It belongs in `@unisim/media`;
> there is a backlog item saying so. None of the other three had a test, so
> [`zip.test.ts`](src/lib/zip.test.ts) is the first: it walks the archive the way
> an unzipper does and pulls the entries back out.

## The ceiling, and why it is the *output* that binds

The finished MP4 is assembled in memory before you save it, so there is a real
limit — roughly a gigabyte or so of **output** on a desktop, less on a phone.

The counter-intuitive part, and the thing the UI exists to explain: **a 2 GB
source compressed to 300 MB is fine, while a 400 MB source re-encoded up to 5 GB
is not.** What binds is the file you are producing, not the file you dropped in.

So the app **refuses before, rather than crashing after**:

1. **Probe on drop.** The header is read off disk — `File.slice()` on a few dozen
   bytes per box — so a 4 GB file is understood in milliseconds without being
   loaded.
2. **Predict the output**, because that is what binds, and show the number.
3. **Arm or refuse the button**, with the estimate written on the button itself.
4. **A refusal names the fix.** Not *"file too large"* but *"this would produce
   about 2.4 GB, which this browser can't hold in one piece — 1080p at Balanced
   produces about 600 MB; that fits"*, with a button that applies it.
5. **Show trouble at 20%, not at 100%.** Progress is *frames done / frames total*
   plus a live byte counter against the prediction, and a remaining time measured
   from this device's real encoding speed.

This matters because the failure mode is **tab death**: an out-of-memory kill
fires no `onerror`, rejects no promise, and gives you nothing to catch. There is
no recovery path, so the pre-flight refusal is the *only* defence there is.

## Develop

```bash
cd D:/Github/UNISIM/Universal_Apps/Universal_Video    # macOS: ~/Github/UNISIM/...
npm install
./scripts/preview.sh        # or  .\scripts\preview.ps1   on Windows
```

Port **5199**, reserved for Video in `Docs_UNI_SIM/dev-preview.md`. The scripts
pass `--strictPort`, so a clash fails loudly rather than serving Video on another
app's port.

> **⚠️ `npm install` needs `@unisim/media@0.1.0` on npm, and it is not published
> yet.** The package lives at
> `backoffice/universal-platform/packages/media`. Until it is released, install
> it from a local pack:
>
> ```bash
> cd D:/Github/UNISIM/backoffice/universal-platform/packages/media
> npm run build && npm pack
> cd D:/Github/UNISIM/Universal_Apps/Universal_Video
> npm install --no-save ../../backoffice/universal-platform/packages/media/unisim-media-0.1.0.tgz
> ```
>
> `package-lock.json` therefore does **not** yet contain an entry for it. Run a
> plain `npm install` once the package is on npm and commit the updated lockfile;
> until then a clean `npm ci` — including a Cloudflare Pages build — will fail.

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` then a production bundle into `dist/` |
| `npm run lint` | ESLint (flat config, typescript-eslint) |
| `npm test` | Vitest — the pure logic (progress projection, overrun detection) |
| `npm run test:e2e` | **Playwright — a real Chromium, a real H.264 MP4, a real conversion, read back by the browser's own demuxer.** No internet needed. |

`npm run test:e2e` is the one that matters. A compressor that compiles proves
nothing. The container and pre-flight logic have their own suite — run
`npm test` in `backoffice/universal-platform/packages/media`.

`e2e/fixtures/clip-480x270.mp4` is 2 seconds of 480×270 H.264 with an AAC track,
generated by Chromium's own encoders and muxed by `@unisim/media`. There is no
ffmpeg on the machines this is built on, and that turned out to be a feature:
making the fixture exercises the writer before anything else runs.

## How it's built

| | |
|---|---|
| Shell | Vite + React + TypeScript, PWA, Tailwind v4 |
| Chrome | `@unisim/sdk` — `UniversalAppsNavBar`, suite switcher, usage telemetry |
| State | zustand (`src/stores/videoStore.ts`) — one file at a time, on purpose |
| Pipeline | `@unisim/media` — `mp4read`, `mp4mux`, `video`, `probe`, `plan` |
| Theme | Light by default, always, until the user picks otherwise (`src/stores/themeStore.ts`) |

**Bundle:** ~511 KB raw / ~148 KB gzip of JavaScript, of which `@unisim/media` is
about **24 KB raw / 9 KB gzip**. For comparison, the `ffmpeg.wasm` core this app
does not ship is **30.7 MiB** (9.7 MiB gzipped).

## Don't

- **Don't add `ffmpeg.wasm`.** The only published `@ffmpeg/core` is
  `GPL-2.0-or-later` — it bundles libx264 — and there is no LGPL build to take.
  Beyond the licence, its `.wasm` is 30.7 MiB and **Cloudflare Pages enforces a
  25 MiB per-file limit**, so it cannot even be self-hosted here without new
  infrastructure. And it is unnecessary: the browser already has an H.264
  encoder.
- **Don't load an engine from a CDN.** The core would never see your file, so the
  claim survives *technically*. But the claim we sell is a **trust** claim, and
  it is falsifiable by anyone who opens the network tab: a 10 MB request to
  `unpkg.com` while their private footage sits in the drop zone reads as
  *"something went somewhere"*, and no amount of explaining wins that argument.
  **If a user with devtools open would have to trust our explanation, the design
  is wrong.**
- **Don't set COOP/COEP.** `require-corp` blocks cross-origin `<img>` loads made
  without CORS — including the SDK navbar's **org branding logos** from Supabase
  Storage. The symptom is a paying customer's logo silently vanishing, reported
  three weeks later as "the site looks broken". Nothing here wants
  `SharedArrayBuffer` anyway.
- **Don't write `as unknown as ProductCode`.** `SuiteProductId` ends in
  `| (string & {})`, so a wrong product code type-checks — and that cast is what
  let Universal Converter and Universal USB lose every usage event from launch.
  `'video'` is a real member of the union and of the Postgres enum, so
  `product: 'video'` needs no cast. If the type ever fights you, the type is
  telling you the enum is missing a value.

The long-form argument for all four is §10 of `Docs_UNI_SIM/next-products.md`.

## Licence

MIT © 2026 James Markey. See [`LICENSE`](LICENSE).
