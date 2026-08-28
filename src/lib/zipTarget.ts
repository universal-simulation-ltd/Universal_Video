/**
 * Where a separate-files batch is written, when the browser can write to a file
 * the user chose.
 *
 * The problem this solves is in `lib/memory.ts`: an in-tab zip costs
 * `sources + 2 × Σ pieces`, and on a long edit cut into a dozen that is a
 * refusal rather than an export. Nothing about the encode is the ceiling —
 * pieces are written one at a time and each one is small. What is expensive is
 * having nowhere to PUT a finished piece, so every one of them stays in the tab
 * until the last has been made and then gets copied again into the archive.
 *
 * A `showSaveFilePicker()` handle is somewhere to put them. Each piece is
 * appended to the archive and dropped, the peak becomes one piece, and the
 * batch stops being bounded by anything but the longest single cut.
 *
 * ── Three things this file exists to get right ───────────────────────────────
 *
 * 1. **The picker needs a user gesture and cannot be awaited into.** It must be
 *    the first thing that happens after the click — see `chooseZipTarget`'s
 *    warning. This is why the store asks for the file BEFORE it probes, plans
 *    or encodes anything.
 * 2. **Cancelling is not failing.** Someone who presses Escape on the save
 *    dialog has said "not now", and starting a several-minute encode into the
 *    tab instead would be the opposite of what they asked. `Cancelled` is
 *    distinct from every other outcome for that reason alone.
 * 3. **Not every browser has it.** Safari and Firefox do not, and there the
 *    app keeps exactly the behaviour it has always had. Nothing here is
 *    load-bearing for the common path.
 *
 * ⚠️ **Availability is not the same as permission.** The API exists on Chrome
 * and Edge but throws in a cross-origin iframe, in a non-secure context, and
 * when the gesture has expired. `chooseZipTarget` treats every one of those the
 * same way — as "no handle", falling back to the in-tab path — because from the
 * user's side they are the same thing and none of them is worth a dialog.
 */

import { openZip, type ZipStream } from '@unisim/media'

/* ── The bits of File System Access this app uses ────────────────────────────
 *
 * Declared here rather than leaned on from `lib.dom`: the API is not in every
 * TypeScript DOM lib yet, and a `declare global` that grows a type the runtime
 * may not have is exactly how an optional feature stops being optional. Only
 * what is called below is described.
 */
interface WritableFileStreamLike {
  // ⚠️ Typed as `Uint8Array` and not `BufferSource`. The real API takes both,
  // but recent TypeScript pins `BufferSource`'s view to an `ArrayBuffer` while
  // a plain `Uint8Array` is over `ArrayBufferLike`, so the wider type is the
  // one that will not accept what `openZip` actually hands it.
  write(data: Uint8Array | Blob | string): Promise<void>
  close(): Promise<void>
  abort?(reason?: unknown): Promise<void>
}

interface FileHandleLike {
  name: string
  createWritable(options?: { keepExistingData?: boolean }): Promise<WritableFileStreamLike>
}

type SaveFilePicker = (options?: {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
  excludeAcceptAllOption?: boolean
  id?: string
}) => Promise<FileHandleLike>

function picker(): SaveFilePicker | null {
  if (typeof window === 'undefined') return null
  const fn = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker
  return typeof fn === 'function' ? fn : null
}

/**
 * Can this browser write an archive straight to a file?
 *
 * Read by the export panel, so the button can say what pressing it will do
 * before it is pressed — a save dialog appearing unannounced after a click that
 * said "Export" is a small unpleasant surprise, and one sentence removes it.
 */
export function streamingZipSupported(): boolean {
  return picker() !== null && (typeof isSecureContext === 'undefined' || isSecureContext)
}

/** An archive open on disk, being written into. */
export interface ZipTarget {
  /** What the file is actually called — the user may well have renamed it. */
  name: string
  /** Append pieces here, in order. */
  stream: ZipStream
  /**
   * Finish the archive and close the file. Returns its size on disk.
   *
   * Safe to call after a piece has failed: everything already appended is a
   * valid archive of exactly those pieces (proven in `@unisim/media`'s
   * selftest), which is what lets a batch keep four good encodes when the
   * fifth fails.
   */
  close(): Promise<number>
  /**
   * Give up without finishing. The file the user picked has already been
   * created and truncated by the browser, so there is no way to leave no trace
   * — this abandons the handle rather than pretending otherwise.
   */
  abandon(): Promise<void>
}

/** The user pressed Escape, or "Cancel". Not an error; an answer. */
export class ZipPickCancelled extends Error {
  constructor() {
    super('No file was chosen.')
    this.name = 'ZipPickCancelled'
  }
}

/**
 * Ask for somewhere to write the archive.
 *
 * Returns `null` when this browser cannot do it at all, or when the picker was
 * available but refused for a reason the user did not choose (an expired
 * gesture, an embedded frame, a blocked permission) — the caller falls back to
 * the in-tab zip in every one of those cases.
 *
 * Throws {@link ZipPickCancelled} when the user actively said no, which the
 * caller must NOT treat as a fallback: silently exporting into the tab after
 * someone cancelled a save dialog is doing the thing they just declined.
 *
 * ⚠️ **Call this synchronously from the click handler.** Transient user
 * activation is spent by the first `await` that outlives it, and this API needs
 * it. An export that probes a file first and asks for a handle afterwards works
 * on a fast machine, fails on a slow one, and looks like a browser bug.
 */
export async function chooseZipTarget(suggestedName: string): Promise<ZipTarget | null> {
  const show = picker()
  if (!show || !streamingZipSupported()) return null

  let handle: FileHandleLike
  try {
    handle = await show({
      suggestedName,
      types: [{ description: 'Zip archive', accept: { 'application/zip': ['.zip'] } }],
      // A stable id makes the browser reopen the folder they used last time,
      // which for someone cutting up a series of clips is most of the value.
      id: 'universal-video-pieces',
      excludeAcceptAllOption: false,
    })
  } catch (err) {
    // ⚠️ `AbortError` is the ONLY one of these the user chose. Everything else
    // — SecurityError from a lost gesture, NotAllowedError from a blocked
    // permission — means the feature was not really available, so say so by
    // returning null and let the in-tab path run.
    if (err instanceof DOMException && err.name === 'AbortError') throw new ZipPickCancelled()
    return null
  }

  let writable: WritableFileStreamLike
  try {
    writable = await handle.createWritable()
  } catch {
    // The handle came back but cannot be written to — a read-only location, or
    // the permission was revoked between the two calls. The in-tab path still
    // works, so this is a fallback and not a failure.
    return null
  }

  const stream = openZip({
    write: (chunk) => writable.write(chunk),
    // ⚠️ `openZip` closes the sink itself when the archive is finished. Closing
    // the writable anywhere else as well throws `InvalidStateError`, so
    // `ZipTarget.close()` deliberately does nothing but await the stream.
    close: () => writable.close(),
  })

  return {
    name: handle.name,
    stream,
    close: () => stream.close(),
    abandon: async () => {
      try {
        await writable.abort?.()
      } catch {
        // Abandoning is already the unhappy path; there is nothing above this
        // that could do better with the news.
      }
    },
  }
}
