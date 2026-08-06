# Universal Video — handover

**State: v1 is built, compiles, lints, unit-tests, and has been proven working
end to end in a real browser with a real video. Not deployed. No GitHub remote.
Local commits only. One thing blocks a deploy: `@unisim/media` is not on npm
yet — see §5.**

Written 2026-08-06, in the session that built the app.

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

1. **Publish `@unisim/media@0.1.0`, then re-run `npm install` in both consumers
   and commit the lockfiles.** Nothing can deploy until this is done:
   `package.json` in both apps asks for `@unisim/media@^0.1.0`, and it is not on
   npm, so a clean `npm ci` — which is what Cloudflare Pages runs — fails.
   Locally both apps are wired to a `npm pack` tarball via `npm install --no-save`,
   which is why they build here.
   ⚠️ `auto-release.yml` watches **`packages/sdk/package.json` alone**, so this
   package has **no release path**. Either extend that workflow with a matrix or
   adopt changesets — and per the standing rule, never `npm publish` by hand while
   an auto-release run could be in flight.
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
