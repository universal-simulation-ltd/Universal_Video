# Universal Video — handover

**State: v2 — a MULTI-TRACK EDITOR with a chosen output frame. It builds, lints,
passes 131 unit tests and 20 Playwright specs driven headlessly against real
MP4s. LIVE at `opensource.unisim.co.uk/video`.**

⚠️ **This header said "Not deployed. Local commits only." until 2026-08-12, long
after it stopped being true**, and §12 step 3 said the same. It cost a session:
the ring in §10 was built, left on a branch, and reported as unshippable because
this file said there was nowhere to ship it. **The app is a Git-connected
Cloudflare Pages project (`unisim-video`) and every push to `main` deploys it** —
about a minute, no workflow file in this repo, nothing to run by hand. There is
no `.github/workflows/` here and that is not a sign it doesn't deploy; the
connection lives in the Pages project. Preview URLs are built for branches too,
which is what made a branch feel shipped.

`renderTimeline()` landed in `@unisim/media` **0.3.1** and this app calls it, so
a full multi-clip export works — §8.4's "blocked" note is closed. A single whole
clip in its own frame still takes the fast v1 `convertVideo()` path; everything
else, **including any reframe**, goes to the renderer (§9).

Written 2026-08-06. §§1–7 are the session that built v1 — still true except
where §8 says otherwise; §8 is the editor; §9 is the output frame; §10 is the
front door.

---

## 1. What this app is, and why it exists separately

§10 of `Docs_UNI_SIM/next-products.md` recommended option **(b)** — a `/video`
alias into Universal Converter — and rejected option **(c)**, a standalone repo,
on the grounds that it puts *"a second codebase around a pipeline with one
consumer"*. James chose (c) anyway.

**The objection was answered rather than ignored: there is no second codebase
around the pipeline, because the pipeline moved out of the first one.** It now
lives in `@unisim/media` and both apps import it. Universal Converter deleted
1,445 lines of pipeline and gained a dependency; this app never had a copy to
begin with.

What is genuinely new here, and could not have been an alias:

- **The front door.** `<title>`, description, OG card and H1 all said *"compress a
  video without uploading it"* verbatim — §10's Q1 analysis is that this is the
  highest-volume intent in the suite and `/converter` will never rank for it.
  ⚠️ **Superseded on 2026-08-13 — see §12.1:** the phrase was demoted to the
  description and the keywords, and the H1 now says what the app is for
  (*"Clip, cut and resize a video without uploading it"*). The e2e test asserts
  both: the new headline, and that the old phrase is still matchable in the head.
- **The pre-flight refusal** (§10.4), which Converter does not have. A probe, an
  output prediction on the button, a refusal that names a working setting, and
  progress in frames-and-bytes rather than a percentage.
- **One file at a time**, deliberately. Converter has a queue because it converts
  batches; a queue here would either run conversions in parallel (which is how
  you hit the memory ceiling on purpose) or hide a serial queue behind a bar
  that says nothing.

## 2. What was proved live, and what was only compiled

### Proved live, in a real Chromium, on this machine

`npm run test:e2e` repeats all of it. No internet needed.

- **A real 480×270 H.264 + AAC MP4 goes in and a smaller one comes out**, and
  **Chromium's own demuxer reads the result back** — 480×270, 2.0 s, seeks to
  1 s and decodes a frame there. Our reader agreeing with our writer would prove
  nothing; the browser agreeing does.
- **The sound survives.** The output's AAC track is decoded back with
  `decodeAudioData` and asserted to be ~2 seconds long. This is the half that
  fails *silently* when it fails (see §4), so it is asserted rather than eyeballed.
- **Trim + resize.** A 0–1 s trim comes back under 1.4 s (keyframe-aligned, so an
  exact 1.000 would be a lie to assert) and under half the source's bytes, with
  the picture untouched at 480×270 — because "480p" names the *short* edge and
  this clip's short edge is already 270, so it must not be scaled up.
- **The header-only probe.** Facts appear on drop with no decode.
- **The estimate is on the button before it is pressed**, and carries a
  "% smaller".
- **Refusals.** A `.mkv` is named and refused on drop; a file that is not really
  an MP4 produces a sentence, not a stack trace.
- **Nothing is uploaded.** Every request the page makes is recorded and asserted
  to include no CDN engine fetch and no upload of the media.
- **Light mode holds** in a context whose `prefers-color-scheme` is dark.
- **Universal Converter still works after the extraction** — driven headlessly
  through its *built* bundle: 585 KB in → 257 KB out, 3.02 s, 640×360, audio
  intact, read back by `<video>`.

### Compiled and reviewed, but NOT exercised

- **The memory refusal, against a real large file.** The refusal logic has
  thorough unit tests in `@unisim/media` (including that the suggested
  alternative genuinely fits the budget), but no multi-gigabyte file has been put
  through the UI on this machine. The floor of `memoryBudget()` is 384 MiB, so
  there is no way to provoke a refusal with a small fixture, and committing a
  gigabyte fixture to a public repo would be worse than the gap.
- **Any browser except Chromium.** Safari and Firefox untested. Firefox is
  *expected* to show the "no H.264 encoder" notice — that path has never run.
- **Mobile.** Layout is responsive and was eyeballed at desktop width only. No
  device, no emulator. The mobile memory budget has never been exercised.
- **A long clip.** Everything driven live was 2–3 seconds. The 150,000-frame
  muxer case is unit-tested (see §4) but no minutes-long encode has run here.
- **Signed-in behaviour.** `UsageTracker` mounts with `product: 'video'` and the
  enum value exists (migration 0112, applied to prod), but every live run was
  anonymous, so no `usage_events` row has actually been inserted. **This is the
  exact check that was skipped for Converter and USB.** It is two minutes.
- **PWA install / offline.** The service worker builds; installation untested.
  Unlike Beam, this app genuinely does work offline once the shell is cached —
  there is nothing to fetch.

## 3. The shared package, and where the boundary is

**`@unisim/media`**, at `backoffice/universal-platform/packages/media` — the
location §10.6 names. MIT, no runtime dependencies, no wasm.

| In the package | Why |
|---|---|
| `box`, `mp4`, `mp4read`, `mp4mux` | The container layer. `mp4mux` needs `mp4`'s `mp4aSampleEntry`, and both need `box` — the boundary is forced, not chosen. |
| `aac` | `video` needs `encodeAacFrames`; `aac` needs `mp4`'s writer for its M4A path. Also forced. |
| `framesize`, `video` | The pipeline itself. |
| `trim` | `trimWindow` was stranded in Converter's `convert.ts`, which imports LAME, libFLAC and the Opus writer. Reaching it from the video path would have dragged all of that into the package. |
| `probe`, `plan` | **New.** Written for this app; Converter could adopt them. |

**The files were MOVED, not rewritten** — §10.6 is explicit about why, and it was
right: this code carries fixes a clean-room rewrite would have dropped. Their
self-tests moved with them. Converter keeps one block asserting it really calls
the package rather than a stale copy.

What did **not** move: `mp3`, `flac`, `opus`, `ogg`, `wav`, `aiff`, `pcm`,
`tags`, `zip`, `image`, `resize`. §10.6's audio-layer extraction is therefore
**half done** — the MP4/AAC half, because video forced it. The LAME divergence
with Universal Recorder that §10.6 is really about is still open, and is still
"do it when Recorder is next open".

**Cost of the extraction to Converter's bundle**, measured by building the
pre-extraction commit in a worktree and the current tree side by side:

| | Before | After |
|---|---|---|
| `index-*.js` | 529.89 kB raw · 153.02 kB gzip | 530.56 kB raw · **153.23 kB gzip** |

+0.67 kB raw, +0.21 kB gzip — and the gzip delta is the AAC fix in §4(a), not the
extraction. Measured immediately after the move and before that fix, the numbers
were 530.56 kB / 152.92 kB, i.e. *below* the original. Free, within noise.

**Universal Video's own bundle:** 510.84 kB raw · 147.86 kB gzip of JavaScript,
plus 21.40 kB · 5.04 kB of CSS. `@unisim/media`, minified on its own with the
same esbuild the Vite build uses, is **24.3 kB raw · 9.1 kB gzip** of that — so
the entire container-and-pipeline layer costs about 6% of the bundle. The
`ffmpeg.wasm` core this does not ship is 30.7 MiB (9.7 MiB gzipped), i.e. **a
thousand times larger**, and would not fit Cloudflare Pages' 25 MiB per-file
limit in any case. The rest of the bundle is React and `@unisim/sdk`.

## 4. Three bugs found by reading the moved code — two of them live in production

These are the reason the extraction was worth doing beyond the sharing.

**(a) `aacSupported()` was a false negative on the whole Windows platform.**
The support trial encoded **one** 1024-sample frame and flushed. Measured on
Windows 11 with Chrome 151 (headed *and* headless) and Playwright's Chromium:
one frame gives `EncodingError: Flushing error.` for every rate, channel count
and bitrate; **two or more frames work perfectly.** Almost certainly Media
Foundation's AAC encoder holding its first frame and objecting to a flush before
it has produced anything.

It fails *closed*, which is why nobody noticed:
- Universal Converter's **M4A chip was greyed out** on Windows. Verified before
  and after: the disabled dot next to `M4A` is gone; only `OGG•` remains.
- **Worse and silent:** a video conversion with "keep the audio" ON produced a
  **silent file**, because `encodeAudioTrack()` deliberately swallows an audio
  failure rather than losing the picture with it. The user was told nothing.

Fixed in `aac.ts` (`TRIAL_FRAMES = 4`, and the trial now also requires the
encoder to actually emit a chunk rather than merely not error).

**(b) `box('mdat', ...frames)` throws `RangeError` on long files.** One spread
argument per frame. Measured on Node 24/V8: 110,000 arguments is fine, 125,000
throws. At 30 fps that is about a **65-minute clip** — and the crash lands
*after* the entire encode has run. The same shape was in the M4A writer (AAC
codes ~43 frames a second, so an hour of audio is ~155,000 frames) and in the
`stts`/`ctts` writers. Both writers now assemble into one pre-sized buffer;
there is a 150,000-frame regression test.

**(c) The muxer allocated the payload twice.** `box('mdat', …)` built the payload,
then `concat([ftyp, moov, mdat])` built it again — so a 1 GB movie briefly needed
2 GB of assembled bytes *on top of* the encoded chunks. The single-buffer write
removes one of the two. The remaining copy cannot go without streaming to disk.

## 5. What is left for you

**In order. Only the first one blocks anything.**

1. ~~**Publish `@unisim/media@0.1.0`…**~~ **DONE.** 0.1.0 and 0.2.0 are both on
   npm, and this repo's lockfile resolves `@unisim/media@0.2.0` from
   `registry.npmjs.org` rather than a local tarball, so a clean `npm ci` works.
   The editor needs **0.2.0 or newer** — 0.1.0 has no `timeline.ts`.
   ⚠️ Still true: `auto-release.yml` watches **`packages/sdk/package.json`
   alone**, so this package has **no automated release path** and each version so
   far has been published by hand. Extend that workflow with a matrix or adopt
   changesets before the renderer version ships.
2. **Do not push `Universal_Converter` before step 1.** Its commit is local and
   deliberately unpushed. A push to `main` deploys, and the build will fail on the
   missing dependency.
3. ~~**Deploy this app.**~~ **DONE, and done well before this list was updated.**
   The `unisim-video` Pages project is Git-connected, `'/video'` is in the
   `TARGETS` map in `backoffice/opensource-portal/src/worker.js`, and the portal
   tile exists. `public/_redirects` and `base: '/video/'` were already written.
   Verified live on 2026-08-12 in a real browser.
4. ~~**Add `video` to the SDK's `DEFAULT_UNIVERSAL_APPS_PRODUCTS`**~~ **DONE.**
   `video` is in the SDK catalogue with its glyph, `src/lib/catalogue.tsx` is
   deleted and the `products` prop is gone from `App.tsx`. Universal Beam was
   waiting on the same change.
5. **Verify a signed-in visit inserts a `usage_events` row.** The enum value
   exists; the insert path is unproven end to end. Two minutes, and it is the
   check that was skipped for Converter and USB.
6. **Try it on a real, big, phone-shot video** — the case no fixture reaches. A
   4K clip of a few minutes will tell you whether the estimate is honest and
   whether the refusal fires where it should. The estimate is the thing most
   likely to be wrong in the wild: it assumes the encoder hits its target
   bitrate, and very busy footage overshoots.
7. **Safari and Firefox.** Especially Firefox — the "no H.264 encoder" notice
   has never actually rendered.
8. **`UNISIM_Compare`.** §10.7 says extend the existing `universal-converter`
   entry with a `features.video` flag rather than minting a `universal-video`
   product — but that was written when Video had no URL of its own, and it
   explicitly says *"revisit if Q1 goes the other way"*. Q1 has gone the other
   way. Whichever you choose: **write the input formats out longhand**, never a
   bare ✓. The row we lose is input breadth, and a table that overclaims on the
   row a visitor checks first is worse than no table.
9. **The suite changelog and `next-products.md` §10.** Not touched by this
   session — those are shared repos and this session was given git boundaries for
   two. §10's "Recommendation: nothing to build" is now out of date, and its §10.4
   contains two claims this session disproved (see §6).
10. **Next features, in the order §10.5 argues for:** WebM/VP9 output + an EBML
    reader, scoped together — that turns Firefox into a supported browser *and*
    MKV into a supported input, and they share a container vocabulary. Then
    fragmented-MP4 input. Then streaming output to lift the ceiling.

## 6. What in §10 turned out wrong

§10 held up very well — every architectural call in it survived contact. Four
corrections:

1. **§10.4: "the input stops mattering" is false today.** It says encoded chunks
   are sliced out of a disk-backed `File`, so a 4 GB source is fine. That is what
   a WebCodecs pipeline *can* do; it is not what this one does. `convertVideo()`
   opens with `await file.arrayBuffer()` and holds the whole source resident,
   because `readMp4()` resolves absolute offsets into one buffer. So the input
   counts in full, and *"a 4 GB source compressed to 300 MB is fine"* is not true
   yet. `plan.ts` budgets `input + 2 × output` accordingly and says why.
   Making it true — async slice reads per sample — is the single biggest headroom
   win available and was deliberately not bundled into this work.
2. **§10.4's "1–1.5 GB of output is comfortable" understates the cost.** The
   output is assembled while the encoded chunks are still alive, so it costs
   about twice what it weighs. It used to be three times; see §4(c).
3. **§10.4: "`mp4read.ts` already parses `moov`, so probing is free."** True in
   principle, contradictory in practice — `readMp4()` takes the whole file, and
   loading a 4 GB file to find out whether you can afford to load it is the bug
   the check exists to prevent. `probe.ts` had to be written: it walks top-level
   box headers with `File.slice()` and reads only `moov`. It also has to keep
   walking past `mdat`, because `moov` legally sits at the *end* of anything not
   "faststart"-optimised.
4. **§10.6: "extracting a package for one consumer buys a version number and a
   release process in exchange for nothing."** Correct as an argument, and it was
   answered by Q1 rather than refuted — there are two consumers now. But the
   costs it named are real and are now due: there is no release path for a second
   package in `auto-release.yml`, and until one exists neither app can be
   deployed from a clean checkout. Budget it (§5.1).

Also worth recording: **§10.8's enum landmine is closed, not open.** `'video'` is
in the Postgres enum (0112, applied to prod), in `ProductCode`, in
`SuiteProductId` and in `UNIVERSAL_APP_PRODUCTS`. `main.tsx` writes
`product: 'video'` with **no cast**, which is the whole point.

## 7. Landmines specific to this repo

- **Never write `as unknown as ProductCode`.** `SuiteProductId` ends in
  `| (string & {})`, so a wrong product code type-checks. That cast is what let
  Converter and USB lose every usage event from launch.
- **Don't "improve" `aacSupported()` back down to one frame.** It looks like a
  wasteful loop. It is a platform bug fix with a table of measurements attached;
  see §4(a) and the comment in `aac.ts`.
- **Don't reword the H1.** *"Compress a video without uploading it"* is search
  intent verbatim, and it is the entire justification for this repo existing
  rather than a tab. There is a test.
- **`encodeAudioTrack()` swallows audio failures on purpose** — a silent output
  beats a failed conversion. The trade is deliberate, but it means an audio
  regression is invisible. That is why the e2e asserts the output's audio track
  decodes, and why any future change there needs the same.
- **The e2e fixture is generated by the code under test.** There is no ffmpeg on
  these machines, so `e2e/fixtures/clip-480x270.mp4` was made with Chromium's own
  encoders and `@unisim/media`'s muxer. That is fine — the browser's demuxer is
  the independent check — but do not mistake it for an external fixture. A real
  camera file would be a genuine improvement.
- **Nothing here may fetch anything to work.** No CDN, no engine, no analytics on
  the file. The e2e test asserts it. This is not a preference; it is the product.

## 8. v2 — the editor

Written 2026-08-06, in the session that replaced the middle of the app with a
timeline. The owner's brief, verbatim: *"After uploading the video on Universal
Video, I want to see a video player to watch the video and then I want to be able
to visualise and edit the tracks below for audio, video when I can resize (trim)
the sliders, cut them, delete them, add an intro and outro image / video and add
transition between different videos. Add multiple tracks if two videos are slid
on top of each other and link the audio to the track if it's been cut."*

Owner's decisions, taken as given: full export from the start; **one screen — the
editor IS the app**, so a dropped file gives you player + timeline and "compress"
is exporting a timeline with one clip on it; transitions are crossfade and
fade-to/from-black only.

### 8.1 The contract, and the one decision everything follows

`@unisim/media`'s **`timeline.ts`** (0.2.0) is the document both this editor and
the renderer are written against. Read it before touching anything here.

**A `Clip` carries its own audio.** There is no separate audio clip and there
must never be one. The timeline DRAWS a video lane and an audio lane for each
clip — presentation — but a cut splits ONE `Clip` into two, so the sound is cut
at the same instant as the picture *by construction*. `edit.test.ts` has a test
named in shouting capitals asserting exactly that, and the Playwright spec
asserts it a second time by reading the two audio lanes out of the DOM. If a
future change introduces `audioClips: [...]`, those two tests are the alarm.

### 8.2 Where things are

| File | What it owns |
|---|---|
| `src/lib/edit.ts` | **Every edit, as a pure `Timeline → Timeline` function.** Trim, cut, delete, move + auto-track, intro/outro, transitions, clip audio, card length. No React, no DOM. |
| `src/lib/compose.ts` | What is on screen and audible at one instant — `layersAt()`, `opacityAt()`, `audioAt()`, `fitInside()`. Drives the preview only. |
| `src/lib/memory.ts` | The §10.4 refusal, extended to a timeline: **every source is resident at once**, so the budget is `Σ sources + 2 × output`. |
| `src/lib/render.ts` | The export adapter, and the only place that knows there are two routes. |
| `src/lib/timecode.ts` | `0:03.4` — the playhead clock. `formatDuration()` rounds to whole seconds, which cannot place a cut. |
| `src/lib/zoom.ts` | Zoom as a multiple of **fit-to-width**, and the pixels-per-second derived from it. At fit the movie is exactly as wide as the picture, so the needle at `t` is at `t / duration` of it. |
| `src/lib/layout.ts` | `PLAYER_MAX_W` — the one width the picture and the timeline both lay out from. |
| `src/stores/editorStore.ts` | The impure half: `File` handles, object URLs, playhead, zoom, export in flight. Every mutation delegates to `lib/edit.ts`. |
| `src/components/Player.tsx` | Canvas preview + transport. Composites the source `<video>`/`<img>` elements per `layersAt()`. |
| `src/components/TimelineView.tsx` | Ruler, tracks, clips. Video lane + audio lane inside ONE box with ONE border and ONE selection ring. |
| `src/components/Toolbar.tsx`, `Inspector.tsx`, `ExportPanel.tsx`, `SourceBin.tsx` | The verbs; the selected clip in numbers; output settings + refusal + button; the header facts. |

Deleted with the old flow: `stores/videoStore.ts`, `SourceCard.tsx`,
`SettingsPanel.tsx`, `RunPanel.tsx`.

### 8.3 Decisions worth knowing before you change something

- **Auto-track only applies to a DRAG.** Dropping a clip where it would overlap
  another puts it on the first free track above (a new one if needed) — the
  owner's "add multiple tracks if two videos are slid on top of each other". A
  **crossfade deliberately does the opposite**: `applyCrossfade()` slides the
  clip back over its neighbour *on the same track*, because a dissolve IS an
  overlap, and ripples the clips after it so the join doesn't spring a gap.
- **Deleting leaves the gap.** No ripple delete: an editor that silently closes
  gaps moves footage the user never touched.
- **Audio gain does not follow the picture's fade.** A fade to black with the
  dialogue still running is a real edit; tying them together would take it away.
- **An image is a source, not a special case** (the contract's own reasoning), so
  an intro card trims, moves and takes a transition like footage. Changing a
  card's length changes the source and re-clamps every clip cut from it.
- **The one-drag-one-click compress path is intact.** The button said
  *"Compress this video"* for a single clip until 2026-08-13; it says
  *"Export this video"* now (§12), and the *"% smaller"* on its second line is
  what tells you it compressed.
- **`c` cuts, `Delete` deletes, space plays** — ignored while focus is in a
  field, or typing "3" into the out-point box would delete a clip.
- **The timeline is as wide as the picture, and zoom is a multiple of that.**
  `zoomFactor: 1` means fit; `pxPerSec` is derived from a measured width
  (`lib/zoom.ts`), never stored. What is matched is the player's **output
  frame** — a source with a different aspect is letterboxed inside it, and the
  black is part of the picture — not the visible rectangle of the current clip,
  which would change the timeline's width from clip to clip. Two things are
  load-bearing for the alignment and both have bitten already: the ruler is
  clipped (it draws one tick past the end) and the follow-the-playhead scroll
  ignores a couple of pixels of overflow (the needle is 2 px wide and sits on
  the last instant). Anything that can scroll the timeline at fit breaks it.

### 8.4 The renderer adapter — where it stands

`renderTimeline()` **is not in `@unisim/media@0.2.0`**. `src/lib/render.ts`
therefore does two things:

1. **`exportRoute(timeline)`** returns `'compress'` for a timeline holding one
   whole-source video clip, at track 0, starting at 0, with no transitions and
   gain 1 — which is precisely what the shipped `convertVideo()` expresses, the
   clip's in/out becoming the trim window. Every condition is something the old
   pipeline genuinely cannot do (a clip starting at 2 s means leading black),
   and relaxing one would silently produce the wrong file. Unit-tested.
2. Anything else looks `renderTimeline` up **at run time** and, when it is
   absent, throws `RendererUnavailableError` with a sentence a user can read.
   The UI shows it as a notice and leaves the timeline exactly as it was.

**When the renderer lands:** install the new `@unisim/media`, check
`TimelineRenderInput` in `render.ts` against the real signature, and delete the
temporary spec *"a multi-clip export says why it can't run yet"* in
`e2e/video.e2e.ts` — replacing it with a real two-clip export read back by the
browser's own demuxer, the way the single-clip test already does.

### 8.5 What the contract could not tell us

Reported to the owner; nothing here was worked around.

1. **`TimelineSource` has no handle on the bytes.** It describes a source but
   nothing in it can be decoded, so every call has to be handed the `File`s
   separately, keyed by source id (`TimelineRenderInput.files`). That is
   defensible — a `File` is a browser object and the document should stay
   serialisable — but the pairing is currently invented by this app rather than
   named by the contract.
2. **Nothing says what the OUTPUT settings are.** `Timeline` carries `width`,
   `height` and `fps`, but not quality, audio bitrate or "keep the sound", so
   `VideoSettings` is passed alongside. If the renderer expects those on the
   timeline instead, the contract should say so.
3. **`transitionOut` and the next clip's `transitionIn` can disagree.** Two
   overlapping clips with different kinds or lengths is representable and
   undefined. This editor only ever writes the incoming clip's `transitionIn`
   for a crossfade, but nothing in the types stops the other arrangement.
4. **No z-order rule within one track.** Two clips on the SAME track that overlap
   (which a crossfade creates) are drawn in start-time order here; the contract
   says higher tracks cover lower ones but not what happens inside one.

### 8.6 Driven live, versus only compiled

`npm run test:e2e` — 12 specs, real Chromium, real MP4, no internet:

- **The player really plays.** After a drop, the canvas is sampled with
  `getImageData` and asserted to contain decoded picture rather than black.
- **A cut splits picture and sound at the same instant** — asserted from the
  DOM's own audio lanes, not from the model.
- **A drag stacks a track.** A real mouse drag of the second half back over the
  first leaves two clips, one of them on V2, overlapping. Nothing is overwritten.
- **Delete** removes it.
- **An image becomes a 3 s intro card** and pushes the footage behind it, its
  audio lane saying "no sound in this file" rather than being absent.
- **A trim typed into the Inspector** produces a shorter, smaller MP4, read back
  by Chromium.
- The v1 proofs all still run: the H1, light mode, the header probe, the estimate
  on the button, the `.mkv` and not-really-an-MP4 refusals, and that nothing is
  uploaded.

**Only compiled, not driven:** the multi-clip export (no renderer yet); a real
memory refusal on a large edit (the unit tests cover the arithmetic, but no
multi-gigabyte set of files has been through the UI); anything but Chromium;
mobile; touch-drag on the timeline (pointer events are used, so it *should*
work, but no device has touched it).

### 8.7 Landmines this session added

- **Do not model audio as a parallel array.** §8.1. Two objects for one piece of
  footage is how picture and sound drift apart.
- **`package.json` needs `@unisim/media@^0.2.0`** — 0.1.0 has no `timeline.ts`
  and the app will not compile against it.
- **`getByLabel('Playhead')` was ambiguous** while the preview canvas was
  `aria-label="Preview of the edit at the playhead"`. Playwright's label match is
  a substring; the canvas is now labelled "Preview of the edit".
- **The pure functions are the specification.** If an interaction feels wrong,
  fix it in `lib/edit.ts` with a test, not in the component — the component is
  the only part with no way to prove itself.

## 9. The output frame — reframing, letterbox only

Written 2026-08-06. The owner's brief, verbatim: *"I want to be able to reframe a
video e.g. a portrait video to reframe to 1920 x 1080 — it keeps the video in the
centre and fills black on the sides."*

**Most of it already existed and was not rebuilt.** `renderTimeline()` has always
letterboxed a source whose aspect differs from `Timeline.width × height` —
*contain*, not *cover* (`drawContained()`), deliberately, so nothing is cropped —
and `Timeline` has always carried the frame. What was missing was the **control**:
nothing let the user set the frame independently of the source, so a portrait
source could only ever produce a portrait movie.

### 9.1 What was built

| File | What it owns |
|---|---|
| `src/lib/frame.ts` | **New.** The presets, `evenEdge`/`customEdge`, `naturalFrame`, `applyFrame`, `letterbox()`, and **`outputFrame()` — the one definition of the exported frame size.** |
| `src/lib/frame.test.ts` | **New.** 21 tests: the bars, the evenness, the cap composing with the frame, and the budget moving when the frame does. |

The control is a select plus two number fields in **`ExportPanel`**, above
Resolution — the frame is a property of the *movie*, so it sits with the output
settings and not in the clip inspector. Presets: **Match the source** (the
default, and today's behaviour), **1920×1080**, **1080×1920**, **1080×1080**, and
**Custom…**.

### 9.2 The four things that keep it honest

1. **`outputFrame()` is read by everything.** The player sizes its canvas from
   it, `estimateTimelineOutput()` predicts from it, and `render.ts` hands it to
   `renderTimeline()`. The preview cannot drift from the file because there is
   nowhere for a second answer to live. The bars themselves come from
   `fitInside()` in `compose.ts`, which is the same *contain* the renderer uses.
2. **⚠️ A reframe forces the RENDER route.** `convertVideo()` scales the source's
   own frame to a height; it has no frame to compose into and cannot letterbox.
   `exportRoute()` therefore returns `'render'` whenever the clip's source shape
   differs from the timeline's frame. Relaxing that would produce a file the
   source's shape with the reframe silently dropped — the exact failure this
   feature invites. Tested in `render.test.ts`, in shouting capitals.
3. **⚠️ Both edges are always even.** `checkTimeline()` refuses an odd width or
   height *before it starts* (H.264 codes in 16×16 macroblocks). Every number out
   of `frame.ts` has been through `evenEdge()` or `targetFrameSize()`, the custom
   fields round on commit rather than per keystroke (rounding as you type turns
   the "1" of 1920 into "2"), and a source whose *own* dimensions are odd is
   evened too — which quietly fixes an export that would previously have been
   refused. There is a Playwright spec that types `1281 × 719` and gets
   `1282 × 720`.
4. **The budget is re-planned the moment the frame changes.** `reflow()` in the
   store stamps the frame on first, then re-runs `planTimelineExport()`.
   Reframing a 480×270 clip to 1920×1080 is sixteen times the pixels, and the
   refusal has to arrive while the user can still change it.

### 9.3 What this deliberately is not

**Letterbox/pillarbox only.** No crop, no zoom-to-fill, no per-clip pan or scale.
`UNISIM_Compare`'s entry for this app states in print that there is no per-clip
transform, so adding one quietly would make a published claim false. If a fill
mode is ever wanted it is a separate decision, not an implementation detail —
and it would need the preview, the renderer and that table changed together.

The `Honesty` panel and the README both grew a **Reframes** row and an explicit
"no crop / no zoom-to-fill" row, because both lists claim to be complete.

### 9.4 A bug this closed on the way past

**`renderTimeline()` ignores `maxHeight` — it encodes at exactly
`timeline.width × height`.** `TimelineRenderSettings` carries quality and audio
bitrate and nothing else, while the resolution cap lives in `VideoSettings`,
which that route never passed on. So before this session, picking "720p" on a
**multi-clip** edit changed the estimate on the button and *not the file*.
`renderWholeTimeline()` now resolves the frame through `outputFrame()` and hands
the scaled timeline over, so the prediction and the file agree again.

That is the one thing here that arguably belongs in `@unisim/media` instead —
either `TimelineRenderSettings` should take `maxHeight`, or the contract should
say out loud that the frame on the timeline is final and the cap is the caller's
job. **Reported, not changed:** the package was deliberately not edited.

### 9.5 Driven live, in Chromium, with real numbers

`e2e/fixtures/portrait-270x480.mp4` is **new** — 2 s of 270×480 H.264 + AAC, a
solid red fill with a moving white marker, made the same way the 480×270 fixture
was (Chromium's own encoder, this package's muxer; there is no ffmpeg here). It
exists because **the assertion cannot be made with a 16:9 source at all**: a
480×270 clip in a 1920×1080 frame is the same shape and grows no bars, so it
could not tell a letterbox from a stretch.

The spec drops it, picks **1920×1080**, and asserts:

- the preview canvas reports `data-frame="1920x1080"` and is 16:9, with its 3%
  and 97% columns black (`r < 24`) and its centre lit — *before* anything runs;
- the timeline surface is still exactly the canvas's width and x (±1 px), Fit is
  still Fit, and the needle at 0 s / 1 s / 2 s is within 1 px of
  `canvas.x + (t/duration) × canvas.width`;
- the **exported file**, read back through `<video>` and sampled on a canvas, is
  `1920 × 1080` and at 1.0 s reads **black at x = 64, x = 600 and x = 1856**
  (max channel < 24) and **red at x = 960** (`r > 120`, and `r > g + 40`).

Those x positions are the arithmetic, not guesses: 270×480 contained in
1920×1080 is drawn 607.5 px wide and centred, so the picture runs x ≈ 656–1264.
**A dimension assertion alone would have passed on a stretched frame; x = 600
being black is what proves it was letterboxed.**

### 9.6 Left over

- ~~**A tall preview.**~~ ✅ **Fixed 2026-08-13 — see §12.2.** The box is bounded
  both ways now, and the timeline moved with it exactly as this note said it
  would have to.
- **No fill mode.** See §9.3. Report it as a request; don't add it quietly.

## 10. The front door is the suite's circle

The owner's brief: *"This should use the generic circle drop for uploads as per
PDF, Images etc."*

`DropZone.tsx` was a dashed rectangle with its own "choose a file" button, on the
argument — written into the file — that the drop MECHANICS are shared but the
LOOK is per-app. The mechanics half of that was already true (`useFileDrop` came
from the SDK); the look half is what this closes. Universal PDF, Universal Images
and Universal Compress all take a file through the same ring, the SDK ships it as
**`DropRing`**, and its own doc comment says it was lifted out of Compress *"so
Video and the rest can use it"*. A visitor arriving from a sibling app should not
have to learn a second front door. It is also the ring the "reading the file's
header" state already used (`App.tsx`), so the target and the wait now match.

### 10.1 Three things the ring forces, and why the file looks like it does

- **`clickToBrowse` is ON and there is no button inside the circle.** `DropRing`
  sets `pointer-events: none` on its centre so nothing there can ever swallow a
  drop — which means a nested button would be dead to the mouse. The words
  *"or choose a file"* are words; the whole circle is the control, and its
  accessible name is `Drop a video here, or choose a file`.
- **⚠️ The ring's interior is painted `#ffffff` by the SDK in BOTH themes.** The
  text inside it is therefore fixed dark and carries no `dark:` variant. Adding
  one puts white text on white. The prose and the encoder warning sit *below* the
  ring, outside the target, where the dark variants are correct — and where they
  fit, which they do not in a ~220 px centre.
- **The `<input>` is outside the zone, not inside it.** With a click-to-browse
  zone, an input nested within it receives `open()`'s programmatic click and
  bubbles it straight back into the zone's own `onClick` — and the only thing
  between that and an endless loop is the browser's click-in-progress guard.
  Moving the input out removes the question. There is an e2e assertion that one
  click on the ring produces exactly **one** click on the picker.

### 10.2 Page-wide, which is new behaviour and not only a repaint

`pageWide` is on, paired with the SDK's **`DropAnywhere`** hint — the other half
of the pattern PDF and Images established. The circle is a target, not a wall: a
file let go over the margin is taken rather than lost. This is worth more here
than the tidiness of it, because a drop that *nothing* handles makes the browser
navigate to the file, and in a local-first app that throws away the tab and the
edit with it. The hint is driven from `pageOver`, not `over`, so it never covers
a ring that is already lighting up on its own.

Driven live, in Chromium: the ring is present by its accessible name, one click
opens the picker exactly once, and a `drop` dispatched on the **footer** — with
the ring hundreds of pixels away — still puts a clip on the timeline.

### 10.3 What did not change

The accepted types (`EDITOR_ACCEPT`), `addFiles`, the refusals, and the probe.
This is the front door's appearance and its reach, not what it will take. In
particular *"as per PDF, Images"* is about the shared **circle**, not about
accepting PDFs — this app reads MP4, M4V and MOV, plus images as intro/outro
cards, exactly as it did before.

### 10.4 Two columns, and the honesty box collapsed to fit one

Added 2026-08-12, after the ring landed. Owner ask: *"make the page 2 column as
per convert / compress etc — make the content of second box What it does, and
what it deliberately doesn't more succinct."*

**The front door is now `lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]`,
the same string Universal Compress uses.** Ring on the left in a white card,
`Honesty` on the right. Below `lg` they stack, ring first — there is an e2e
spec asserting that order geometrically, because a collapsed grid and a
correctly stacked one look identical to a class-name assertion.

**Why the box had to shrink to make the column work.** `Honesty` is nine
paragraphs. At full width under the ring that was merely long; in a ~330px
column it was a wall of text three screens tall, and the drop target — the thing
somebody actually arrives to use — lost the page to it. So each row now leads
with a written one-sentence `summary` and keeps its full text behind a
disclosure. **Nothing was deleted.** Every word is still there, one click away,
and the e2e spec opens a row and asserts the full text appears.

Three things that shaped the implementation, all in `Honesty.tsx`:

- ⚠️ **The summaries are WRITTEN, not sliced.** The obvious reading of "a
  character limit and then `...`" is to cut the existing text at N characters,
  and it does not survive contact with this file: the rows are rich — `<strong>`,
  `<em>`, a link to Universal Recorder — and a character count walked through
  JSX either drops the markup or cuts a tag in half. `lib/summary.ts` still caps
  each summary at `SUMMARY_LIMIT` and appends `…` at a word boundary, but it is
  a **guard** against a summary someone lengthens later, not the mechanism. It
  has its own unit tests (10) covering the word boundary, the long-token hard
  cut and the trailing-punctuation strip.
- ⚠️ **It stopped being a `<dl>` and cannot go back.** A disclosure needs a
  `<button>` beside the term, and the only children HTML permits inside `<dl>`
  are `<dt>`, `<dd>` and a `<div>` wrapping a group of them — a button there is
  invalid. It is a `<ul>` of nine facts now.
- **The whole row is the button, not the ellipsis.** An ellipsis is a ~10px
  target and announces nothing; the row carries `aria-expanded` +
  `aria-controls`, and its accessible name is the summary. The chevron rotates
  rather than swapping glyph so opening a row doesn't reflow it.

`DropZone` lost its own `py-6 sm:py-10` in the same change — the card in
`App.tsx` owns the padding now, and having both inset the ring twice.

## 11. The app name is the switcher, not a home link

The owner's brief: *"The app name on hover / mobile click should reveal the
suite switcher dropdown, not refresh page."*

**Measured before the change**, in a real Chromium: hovering the name opened the
switcher; clicking it navigated (one full page load); and on a touch context —
where there is no hover at all — a tap navigated and the menu never appeared. So
on a phone the switcher was unreachable from the identity **by any gesture**.

The cause is two SDK behaviours meeting. `productHomeHref` makes the navbar wrap
the logo AND the catalogue-derived product name in a single home `<a>`. And
`SuiteSwitcher`'s wrapper toggle begins:

```js
if (target.closest('a, button')) return   // let a child link navigate
```

which is the rule that lets a home link coexist with the dropdown on the
desktop, and the rule that swallows every tap on a touch screen.

**The fix is to drop `productHomeHref`.** The identity becomes a plain span, so
hover opens it on the desktop and a tap toggles it on a phone. Nothing was lost
by removing the link: this app is ONE SCREEN, so "home" was the page you are
already on — and mid-edit that navigation reloads the app and takes the timeline
with it, which is the worst thing a stray tap on the title bar could do.

### 11.1 `SwitcherHandle`, and why it is a span with `role="button"`

The home `<a>` was the only focusable thing in the identity cluster, and
`SuiteSwitcher` opens on `onFocusCapture` — so removing it would have fixed the
tap and quietly taken the Tab key away. `App.tsx` therefore wraps the generated
`ProductLogo` in a focusable handle.

⚠️ It is a `<span role="button">` and **not a real `<button>`**, which is the one
thing about it that looks like a mistake. The selector above matches the TAG,
not the role: a real button would be swallowed by the very rule that swallowed
the anchor. Its key handler re-dispatches Enter/Space as a `click()` for the
same reason — a click is the event the wrapper is listening for.

`ProductLogo.tsx` is a GENERATED file (`scripts/app-marks/marks.mjs` in the
platform repo); the handle lives in `App.tsx` so a regenerated mark does not
drop it.

### 11.2 Driven live

The spec drives all three gestures: the identity is asserted to have no ancestor
`<a>`, hover opens the menu, focusing the handle opens it, and — in a `hasTouch`
context — a **tap** opens it with `framenavigated` counted and asserted to be
**zero**. The navigation count is the assertion that matters; a menu-visible
check alone would pass on a page that opened the menu and then reloaded.

### 11.3 ✅ Fixed upstream in the SDK — 2026-08-12, `@unisim/sdk@0.100.0`

This was an SDK shape, not a Video one: all **13** apps passing
`productHomeHref` had the same dead identity on touch. Of the two options
floated here, the second was taken — **`UniversalAppsNavBar` no longer wraps
the NAME in the home link.** The mark carries the `<a>`; the name is a plain
`<span>` that falls through to `SuiteSwitcher`'s wrapper toggle, so it opens on
a tap with no hover available, and on a desktop click too.

**What that means for Video specifically.** Everything in §11 and §11.1 above
still describes the bug and the reasoning correctly, but the *workaround* is now
redundant: an app on 0.100.0 can pass `productHomeHref` and still have a working
switcher. Video's `SwitcherHandle` and its dropped `productHomeHref` were left
in place on purpose — for a one-screen editor, "home" is the page you are
already on and the reload discards the timeline, so having no home link may
still be right here. It is a product decision now, not a workaround.

### 11.4 ✅ Decided and cleaned up — 2026-08-20 (James)

**The product question is answered: Video keeps NO home link.** `productHomeHref`
stays unset, for the reason §11.3 gives — a one-screen editor's "home" is the
page you are already on, and the reload throws the timeline away.

**And with that answered, `SwitcherHandle` is deleted.** It is not a matter of
taste: SDK **0.103.0** generalised this exact workaround into the
no-`productHomeHref` branch of `UniversalAppsNavBar`, after finding Universal
PDF and Universal QR had the same hole (neither could open the switcher from the
keyboard). The SDK's version is the same construct line for line — `role="button"`
span, `tabIndex={0}`, `aria-haspopup`, the "Switch product" label, and the
Enter/Space re-dispatch — and the SDK's own source comment names Video as where
it came from.

So ours was nested *inside* an identical one. Two elements, one accessible name:
a screen reader announced it twice, and the strict-mode locator in
`e2e/video.e2e.ts:238` matched both. That is the 20th spec noted as failing on an
untouched tree in §13 — now fixed, not merely explained.

⚠️ **The negative control is worth keeping in mind if this ever recurs**: on the
stashed (untouched) tree the spec fails with `strict mode violation:
getByRole('button', { name: 'Switch product' }) resolved to 2 elements`, and
passes with the local handle removed. If you re-introduce any focusable node
carrying that label, that is the error you will get.

Full suite after the change: **135 unit tests and all 20 e2e specs pass.**

⚠️ **The `<span role="button">` note in §11.1 is still load-bearing SDK-wide**,
for the same reason it was here: `SuiteSwitcher`'s guard matches the TAG
(`closest('a, button')`), so promoting a switcher trigger to a real `<button>`
gets it swallowed by the very rule being worked around.

---

## 12. It is an editor, and the copy says so — 2026-08-13

The owner's brief: *"Update the text on Universal Video — its purpose is not
primarily to compress a video, more to clip, cut, change dimensions. If a
portrait video then have a max height in the viewer so it doesn't take over the
screen."*

Two changes, and the first one contradicts something this repo had written down
in three places, so read the reasoning before reverting any of it.

### 12.1 The founding search phrase is DEMOTED, not deleted

`index.html`, `App.tsx` and `e2e/video.e2e.ts` all carried a note saying *"keep
the phrase intact in the title, the description and the H1"* — the phrase being
**"Compress a video without uploading it"**, which is why §10 of
`next-products.md` argued this should not be a tab inside Universal Converter.
The e2e spec asserted the H1 verbatim and said that if the assertion ever had to
be relaxed, *"the app has lost its reason to exist separately"*.

That was written when the app compressed one file. It has been a multi-track
editor since §8, and the owner's point is that the SEO phrase had outlived the
product: what people do here is clip, cut and change the frame.

So the phrase moved rather than going away:

| Where | Before | Now |
|---|---|---|
| H1 | Compress a video without uploading it | **Clip, cut and resize a video without uploading it** |
| `<title>`, `og:title`, `twitter:title` | same | same as the H1 |
| `meta[name=description]` | led with it | still contains it, in the second sentence |
| `meta[name=keywords]` | `compress video without uploading` first | clip/cut/resize/dimensions first, the compress terms kept |
| Export button (1 clip) | Compress this video | **Export this video** |
| Export button (refused) | Can't compress this here | **Can't export this here** |

The spec was rewritten to match and now asserts **both halves**: the new H1 and
title verbatim, *and* that the old phrase is still matchable in the description
and the keywords. Dropping it from the head entirely is still a regression —
that part of the old note holds.

`Honesty` also re-ordered: **Edits** and **Reframes** lead the list, and
**Writes** picked up the sentence that says dropping one video and pressing the
button is the whole "make this smaller" job. Nine rows, as the heading promises.

### 12.2 The picture is bounded in BOTH directions

§9.6 listed a tall preview as left over: a 9:16 frame drew a ~1280 px canvas and
pushed the transport, the toolbar and the whole timeline below the fold. It also
said what fixing it would cost — *"the timeline viewport has to move with it, and
the alignment spec is the check"* — and that is exactly how it was done.

`lib/layout.ts` gained `PLAYER_MAX_H = 540` and `pictureWidth(aspect)`:

```
width = min(720, round(540 × aspect))
```

**540 is 720 × 3/4 on purpose**, so the cap starts biting at exactly 4:3 and no
landscape frame is touched. A square frame is 540 across; 9:16 — the case this
exists for — is **304 × 540** instead of 720 × 1280.

The width is exposed as `selectPictureWidth` on the store, and BOTH `Player` and
`TimelineView` lay out from it. That is the whole trick: `pxPerSec` comes from a
*measured* viewport (§8, `lib/zoom.ts`), so the timeline re-derives itself when
the box narrows, and the needle — placed at `t / duration` of that width — stays
under the frame it names. A timeline left at 720 while the picture shrank to 304
would put every needle position outside the picture.

The portrait e2e spec now asserts the cap directly (canvas ≤ 541 px tall, < 720
wide, and the timeline surface the same width and x), before it switches the
frame to landscape and re-asserts the original alignment. `pictureWidth()` has
unit tests of its own in `src/lib/layout.test.ts`, including that 4:3 does not
move and that a nonsense aspect falls back to the full width rather than
collapsing the box.

---

## 13. The export that stopped at 93% — 2026-08-13

Reported with a screenshot: *"Jammed on processing. It was a portrait video being
redimensioned to be 16:9."* — 175 of 188 frames, 3.2 MB written, "about 0:00
left", and it never moved again.

**Reproduced**: the owner's own 1080×1920 file, `Output frame` → landscape, in
real Chrome — **4 runs in 5 hung**, always in the same place, always near the
end. Headless Chromium never hung once, which is why nothing here had caught it.

### 13.1 What it was

`VideoClipReader` (in `@unisim/media`, `render.ts`) ended its feed with a bare
`await this.decoder.flush()`. A hardware H.264 decoder emits into a **fixed pool
of picture buffers**; a `VideoFrame` holds one until `close()`; and `flush()`
cannot resolve until every queued decode has produced output. Wait on it while
holding frames and neither side can move — the decoder needs buffers we are
holding, and we are holding them because we are waiting for the decoder.

Instrumented at the moment it wedged:

```
[DBG] decoder.flush() start, decQ= 9, pending= 3, current= true
[DBG] flush still pending: decQ= 4  pending= 8  ENC encQ=0 chunks=170
[DBG] flush still pending: decQ= 4  pending= 8  ENC encQ=0 chunks=170   (forever)
```

Eight frames held, four decodes queued, both codecs idle. It bit at the END of a
clip because that is where the flush is, and never on the 320×240 fixtures
because a small frame never runs the pool dry.

### 13.2 The fix, and two more hangs found under it

The flush is **started and not awaited**: `fill()` hands back whatever is already
decoded, and waits only when it is holding nothing — then on `Promise.race([the
flush, the next frame])`. Every frame is consumed and closed before the next
wait, so the pool is never starved.

Two more, both found by fixing the first:

- **A lost wake-up.** The first attempt rang a signal when the flush settled and
  waited on the signal. By the last frame the flush has usually settled already,
  and *a bell rung to an empty room is not heard* — it hung at **187 of 188,
  every single run**. The flush PROMISE is in the race now, not just its signal.
  Any one-shot signal in this file needs the same treatment.
- **A dead codec sends no `dequeue`.** Both back-pressure waits could park on an
  event that could never arrive again, with the real error sitting unread in
  `failure`. Errors now wake the waiter, and `failure` is checked immediately
  before the wait is registered as well as after it.

Plus a **watchdog**: 60 s of complete silence from a codec fails the export with
a sentence the user can act on. An export that fails is recoverable; one that
waits forever is indistinguishable from a slow one.

Shipped as **`@unisim/media` 0.4.1**; this app moved `^0.3.1` → `^0.4.1` (0.4.0
also brought the MP3/WAV encoders in, with LAME as an OPTIONAL peer — the dev
server and the production build were both checked, since Video never emits MP3
and does not install LAME).

### 13.3 What this is tested by — and what it isn't

- ✅ **8 consecutive exports** of the reported file, 2.6–3.2 s each, against a
  build that hung 4 in 5. Then 6 more on the released package.
- ✅ The **result read back** through Chromium's own demuxer: 1920×1080, 7.85 s
  of picture and 7.85 s of audio in step, black bars either side of a centred
  picture — the reframe is still a letterbox, not a stretch.
- ✅ 19 of 20 e2e specs (the 20th failed on an untouched tree too:
  since SDK 0.103.0 there were two `aria-label="Switch product"` handles in the
  navbar — the SDK's own plus §11.1's local one — so a strict-mode locator
  matched both. **Fixed 2026-08-20 — see §11.4; all 20 now pass.**)
- ⚠️ **The new render-test case does NOT catch this bug.** `rendertest.mjs` case
  (e) renders a busy 8 s 1080×1920 source into a 1920×1080 frame, twice, with a
  second decoder held open on the same stream — and it passes against the exact
  build that hangs, in bundled Chromium *and* in real Chrome. The pool pressure
  the real app generates could not be manufactured. It is a **guard** on the
  big-frame path, not coverage of this bug, and its comment says so. If you
  change how the reader feeds or drains a decoder, the check that means anything
  is still: export a real phone clip, reframed, in real Chrome, several times.

## 14. The front door is two columns, and the left one draws itself — 2026-08-24

Owner ask: *"make the landing page more like PDF / Images — animated SVG on the
left, upload on the right, with an animated SVG inside the orange ring (if not
already done)."*

The ring's own animated backdrop **was** already done (`DropWatermark`, the
five-stroke clip-on-a-timeline from earlier the same day), so this was the other
half: the page shape.

### 14.1 What moved

| Was | Is |
|---|---|
| Headline + lede full width, above everything | Headline + lede in the RIGHT column, next to the ring |
| `[ ring card 1.55fr | Honesty 0.85fr ]` | `[ illustration | headline + ring card ]`, `Honesty` full width beneath |
| `DropZone` carried a paragraph of prose under the ring | Gone — it duplicated the lede (see below) |
| `<header>` always rendered | Rendered **only while editing** |

The `<h1>` is the same sentence in both branches. It has to be: the e2e spec, the
`<title>` and the og:title all assert it character for character (§12). Two
traps in the JSX version of it, both commented in `App.tsx`:

- ⚠️ **`<br />` contributes NOTHING to `textContent`.** Without the explicit
  `{' '}` before it, the headline reads *"…a videowithout uploading it"* to the
  spec, to a screen reader, and to anything that isn't a browser laying out
  boxes.
- ⚠️ **No full stop.** Images ends its headline with one; this one cannot,
  because the sentence has to match `<title>` exactly.

The prose that came out of `DropZone` was a near-copy of the page lede — same
tab, same player and timeline, same no-upload-no-queue list. It was invisible
while the two sat in columns apart from each other, and read as a stutter the
moment the two-column front door stacked them. What stayed in `DropZone` is what
is about the RING: the three lines inside it and the Firefox encoder warning.

### 14.2 The illustration — one clock, ten windows

`components/VideoIllustration.tsx` + the `.vid-illu` rules at the bottom of
`src/index.css`. A clip on a timeline is played to the playhead, cut there, and
its tail dropped; the line under it goes 00:42 · 24.6 MB → 00:18 · 5.9 MB and a
−76% badge stamps into the track the tail gave back.

Everything is a window on **one** number — `--t`, 0 → 1, written on the wrapper
by a rAF loop and read by every CSS rule. Copied deliberately from
`PdfIllustration` and `ImageIllustration`, for the reason those two give: an
element part way through a `@keyframes` cannot be told to return to its own first
frame (`animation-play-state: paused` freezes it where it stands, removing the
animation snaps it), and the pointer arriving has to glide the whole picture back
to frame 0. With one number that is a single interpolation.

⚠️ **This is the suite's THIRD copy of that loop.** `ImageIllustration` already
carries the note that a third should go to `@unisim/sdk` as a hook instead. What
went to `lib/illustrationClock.ts` here is only the pure maths — `smoothstep` and
its exact inverse, which is what lets a mid-glide exit resume on the frame that
is already on screen rather than snapping — because that is the part with an
honest unit test. The rAF loop is still pasted. A FOURTH copy should not be.

Things learned drawing it, all of them commented in place:

- ⚠️ **Neither half of the clip is a rounded rect.** Two `rx="8"` rects abutting
  show four rounded corners and a seam at frame 0 — a picture of a cut that has
  already happened, which is the one thing frame 0 must not be. Each piece is
  drawn twice instead: a closed path for the fill with a square inner edge, and
  an **open** path for the outline that omits that edge. The two outlines join
  into one unbroken boundary. What seals the survivor's open right edge
  afterwards is the selection outline, drawn as the tail leaves — and its square
  corner is correct, because a cut edge is square.
- ⚠️ **A single element cannot fade out AND back in from one window.** Where
  something has to (the pause glyph, the scissors) it is two nested groups whose
  opacities multiply — one window brings it in, the other takes it away.
- ⚠️ **THREE timecodes, not two.** Two would leave the pill empty for a sixth of
  the sweep, which reads as a broken player. The same applies to any pair of
  "before/after" texts sharing a spot: they need a beat between them, not a gap.
- ⚠️ **`transformOrigin` on a nested SVG group is LOCAL.** Naming the scissors'
  absolute y (`0px 304px`) instead of `0px 0px` scales it about a point 300 units
  away and throws it up inside the player. It renders, it just renders wrong.
- ⚠️ **The geometry is the arithmetic.** The cut sits at x = 226 because the clip
  runs 64 → 436 and 18 seconds is 43.5% of 42, and the scrub bar fills to that
  same 43.5%. Three CSS windows carry those numbers; move the cut and all three
  move with it or the picture lies about itself.
- Every surface paints from a `--vi-*` custom property so the drawing has a dark
  theme. They are inline `style` and not `fill=`/`stroke=` attributes because a
  **presentation attribute cannot hold a `var()`**.
- Reduced motion parks `--t` at **1** and never starts the loop: the finished
  frame, not a slower version of it and not frame 0 — frame 0 is the clip before
  anything has been done to it, the still that says least.

### 14.3 The e2e drag test was passing on an accident

`cutting splits picture AND sound…` started failing, and it was NOT the drag.
`page.mouse` works in viewport coordinates and does no scrolling of its own; the
clip lane sits below the fold at 1280×720, so the drag was aimed at nothing. It
used to work because filling the `Playhead` field above happened to scroll the
page 440px — and the front door getting **one paragraph shorter** was enough to
stop that happening. Fixed properly with `scrollIntoViewIfNeeded()` before the
box is measured. Any other `page.mouse` drag in this spec has the same latent
hole.

### 14.4 What was checked

- ✅ 20/20 Playwright specs, 139 unit tests, clean `tsc -b` + build, against
  **SDK 0.110.0** (a concurrent session bumped it mid-work and moved the
  watermark onto `DropRing`'s new `watermark` prop — verified the ring still
  draws exactly one).
- ✅ The whole sweep photographed at every tenth of `--t`, light and dark, plus
  the reduced-motion still and the hover-park/resume behaviour.
- ✅ 390×844 and 820×1180: no horizontal overflow, and the stack order is
  headline → ring → drawing → spec sheet, which the phone spec now asserts.
- ⚠️ **Chromium only.** WebKit was not run, and the PDF landing page's
  `min-width: auto` landmine from earlier the same day says that is exactly
  where a grid-column bug hides. This layout has no fixed-width child in a grid
  column, but it has not been proved on iOS.

## 15. The front door becomes Universal PDF's, properly — 2026-08-24

Second pass over §14, same day, owner's list: *"remove all of what it does…;
header: videos that just work (just work coloured); subheader: Trim it, cut it,
stack it, intro or outro it, and choose the size and shape it comes out at. Add
an example video (turns to recent files with use) and 'or' for 1 click compress
and more options such as convert. Look at Universal PDF again to keep in that
style (including header size etc)."*

The whole front door now lives in **`components/Landing.tsx`** — `App.tsx` keeps
the navbar, the editor and the footer. `DropZone.tsx` is the RING and nothing
else.

### 15.1 The card, top to bottom

Universal PDF's card, in PDF's order, wearing PDF's pill classes:

1. the drop ring;
2. **"Try with an example video"** — which becomes **"Recent videos"** once
   there are any, with the example demoted inside the list. Same slot, different
   offer: a first-time visitor has nothing to be recent, so an empty list is a
   dead end, and someone with history rarely wants the sample again;
3. an `or` rule;
4. **1 Click Compress** — a pill that is also its own drop target;
5. **More options** — Convert, and Join videos — collapsed.

The `<h1>` scale is PDF's exactly (`text-3xl sm:text-4xl lg:text-5xl`), and the
landing (not the editor) is vertically centred in the viewport, which is what
PDF's `min-h-full flex items-center` does.

⚠️ **The headline is no longer the search phrase**, and §12 spent a session
deciding that it should be. *"Clip, cut and resize a video without uploading it"*
is still the `<title>`, the og:title, and **the editor's own `<h1>`** — the spec
now asserts all three plus the new one, so the words are still on the page, one
screen further in. Do not "restore" it to the front door without asking: it was
changed on purpose, by the owner, for consistency with PDF and Images.

⚠️ **`Honesty` is off the front door** (same ask) and still renders under the
editor. Its nine rows are not deleted, and the spec that opens every one of them
now drops a file first.

### 15.2 Recents, and why a video's list is not a PDF's

`lib/recents.ts` is Universal PDF's file with one difference that changes every
number in it: **eight PDFs are a few megabytes; eight phone clips are several
gigabytes.** So this store keeps **4**, refuses any single file over **100 MB**,
holds **250 MB** in total — and the list SAYS so, because a recents list that
silently drops the file you cared about is worse than not having one.

`keepWithinBudget()` is the only decision in the file and the only thing with a
unit test. ⚠️ It `continue`s rather than `break`s: one oversized file part way
down the list must not evict the small ones behind it — it is over budget, they
are not.

Nothing in that file throws at its caller. IndexedDB is missing in some private
windows and full in others, and neither is a reason to fail at opening a video.

### 15.3 One-click compress is two calls, not a second pipeline

`compressNow()` in the store is `addFiles()` then `exportEdit()` — the same two
things a person would do by hand, with no settings of its own. ⚠️ It does **not**
force past a refusal: if the memory plan says the edit will not fit, `exportEdit`
returns and the editor is on screen with the reason, which is where a refused
Export button leaves you anyway.

⚠️ It takes **one** file. Dropping several on the CIRCLE joins them into one
movie — that is the app — but "compress" plainly means "this one, smaller", so
the pill takes the first and says what it did with the rest.

### 15.4 Two React traps, both now commented

- ⚠️ **An effect that clears its own trigger cancels its own timer.** The export
  panel announces itself when you arrive via Convert: it sets `announcing`,
  scrolls, and clears the intent. Clearing the intent changes that effect's
  dependency, so React runs the cleanup — killing the pending `setTimeout` — and
  the re-run returns early because the intent has gone. The panel stayed lit
  **for good**. The beat is a second effect keyed on `announcing`.
- ⚠️ The intent hooks sit **above** `if (!plan) return null`. Hooks are counted
  per render and that panel returns null before the timeline is planned.

### 15.5 The example clip, and the machine that made it

`public/Example_Video.mp4` — 12 s, 1280×720, 30 fps, **three 4-second shots** in
different colours so that cutting one off is a visible act, a white block
travelling across each shot, an orange marker crawling the whole 12 s, and a
quiet tone that changes pitch per shot so the audio lane has something in it.
551 KB.

⚠️ **It is excluded from the PWA precache** (`vite.config.ts` `globIgnores`).
Precaching it would make every install pay half a megabyte for a file only
someone who presses "Try with an example video" ever needs.

⚠️ **§7 and §13 say "there is no ffmpeg on these machines". That is no longer
true on the Mac** — Homebrew ffmpeg 8.1.1 is on the path, and it made this clip.
Two things about that build cost time and will again:

- **No `drawtext`** (built without libfreetype), so nothing in the clip is
  lettered.
- **`drawbox` has no `eval` option** in this build, so its `w`/`h` expressions
  are evaluated once at init and only `x`/`y` see `t`. Worse, drawing onto
  `gradients` output (rgba) draws **nothing at all, silently** — `format=yuv420p`
  has to come FIRST in the chain. The animation is `overlay` instead, whose
  `x`/`y` genuinely are per-frame.

The command is one function repeated three times plus a concat; it is in the
session's scratch notes rather than checked in, because the file it produces is
checked in and regenerating it is a once-in-a-product-lifetime job. If it ever
needs to change: three `gradients` + `color` + `sine` inputs, `overlay` for the
two moving blocks, `-crf 23 -preset slow`, then `-f concat -c copy`.
