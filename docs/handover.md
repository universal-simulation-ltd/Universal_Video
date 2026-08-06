# Universal Video — handover

**State: v2 — the app is now a MULTI-TRACK EDITOR. It builds, lints, passes 87
unit tests and 12 Playwright specs driven headlessly against a real MP4. Not
deployed. Local commits only.**

**One thing blocks a full export: `renderTimeline()` does not exist in
`@unisim/media` yet** (0.2.0 is the timeline *contract*, types only, and a
separate session is writing the renderer against it). A timeline holding one
whole clip still exports today through the v1 `convertVideo()` path; anything
with two clips, a transition, a card or a gain change refuses in a sentence.
See §8.

Written 2026-08-06. §§1–7 are the session that built v1 — still true except
where §8 says otherwise; §8 is the editor.

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

- **The front door.** `<title>`, description, OG card and H1 all say *"compress a
  video without uploading it"* verbatim — §10's Q1 analysis is that this is the
  highest-volume intent in the suite and `/converter` will never rank for it.
  There is an e2e test asserting the H1 is exactly that sentence; if it ever has
  to be relaxed, the app has lost its reason to exist separately.
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
3. **Deploy this app.** Not done, deliberately — no Cloudflare Pages project, no
   remote, no push. It needs: a Pages project, a `TARGETS` entry for `/video` in
   `backoffice/opensource-portal/src/worker.js`, and a tile in the portal's
   `public/index.html`. `public/_redirects` and `base: '/video/'` are already
   written for it.
4. **Add `video` to the SDK's `DEFAULT_UNIVERSAL_APPS_PRODUCTS`** (glyph and
   `category: 'everyday'`), then **delete `src/lib/catalogue.tsx`** and drop the
   `products` prop from `App.tsx`. The shim exists only because that entry is
   missing; it has a clean exit and the file says so. Universal Beam is waiting
   on exactly the same change.
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
- **The one-drag-one-click compress path is intact**, and the button still says
  *"Compress this video"* when the timeline holds a single clip.
- **`c` cuts, `Delete` deletes, space plays** — ignored while focus is in a
  field, or typing "3" into the out-point box would delete a clip.

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
