# What Universal Video does with your video

You landed here from the word **Guaranteed**, so this page owes you something
better than a privacy policy. It is written to be checked: every claim below
names the file in this repository that makes it true, and you are welcome to
go and read it.

The short version: **your video is trimmed, cut, joined and exported by your
own browser.** There is no upload, no queue, no rendering server, and no
account required. This app has no button that sends your video anywhere,
which is why the note on the landing page carries no exceptions.

That last point deserves emphasis, because it is unusual. Most of what an
online video editor does slowly, it does slowly *because your file is being
uploaded to a machine you don't own and processed in a queue behind other
people's files.* None of that happens here. There is no size limit for the same
reason — the only ceiling is your own computer's memory, and the app tells you
about that up front rather than failing halfway through.

---

## What happens when you open a video

| Step | Where it happens | The code |
|---|---|---|
| Reading the file | your browser | [`src/stores/editorStore.ts`](src/stores/editorStore.ts) |
| Decoding and re-encoding | your browser's **built-in** WebCodecs encoder | [`src/lib/render.ts`](src/lib/render.ts), and [`@unisim/media`](https://github.com/universal-simulation-ltd/universal-platform/tree/main/packages/media) |
| Cutting, joining and transitions | your browser | [`src/lib/edit.ts`](src/lib/edit.ts), [`src/lib/compose.ts`](src/lib/compose.ts) |
| Working out whether it will fit in memory | your browser, before it starts | [`src/lib/memory.ts`](src/lib/memory.ts) |
| Saving the result | your browser's download | [`src/lib/render.ts`](src/lib/render.ts) |

**There is no ffmpeg here, and nothing is downloaded to do the work.** The
encoder is the one already built into your browser, the same one a video call
uses. The MP4 file around it is assembled by our own code
([`packages/media/mp4mux.ts`](https://github.com/universal-simulation-ltd/universal-platform/blob/main/packages/media/src/mp4mux.ts)),
which is why this app starts instantly instead of fetching a 30 MB WASM bundle
first.

**Recent files stay on your device.** The app remembers what you were working
on using IndexedDB — storage inside your own browser — see
[`src/lib/recents.ts`](src/lib/recents.ts). Clearing your browser data deletes
it. Nobody else can read it, including us.

---

## What the app talks to a server for, even though your video doesn't

If you open your browser's Network tab you will see a few requests, and a
privacy page that pretended otherwise would look like a lie.

- **The example video**, if you click "try an example" — that is a download
  from us to you, not the other way around.
  See [`src/components/Landing.tsx`](src/components/Landing.tsx).
- **Signing in.** Only if you choose to. Nothing in this app requires it.
- **"You opened the app".** When you are signed in, the app records one event
  saying the app was opened, so your account's activity page is accurate. It
  does not include anything about your video — not its name, not its length,
  not its size. See [`src/UsageTracker.tsx`](src/UsageTracker.tsx).
- **The changelog and update notice.**

**There is no third-party analytics, no tracking pixel, and no advertising
script.** You can check that without reading any code: view the page source of
[the live app](https://opensource.unisim.co.uk/video/) and look at what it
loads. Everything comes from our own domain.

---

## How to prove it to yourself in about a minute

**Turn off your Wi-Fi and edit a video.** Trim it, cut it, join two clips,
export the result. All of it works, because none of it was ever happening
anywhere else. This is the whole test, and it is conclusive in a way that
reading a policy never is.

If you'd rather watch than disconnect: developer tools (F12) → **Network**,
then use the app. Your video is never in the list.

---

## If you find this page is wrong

That is worth more to us than it costs. Open an issue on
[the repository](https://github.com/universal-simulation-ltd/Universal_Video/issues).
A claim nobody can correct isn't a guarantee either.
