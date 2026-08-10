import { useFileDrop } from '@unisim/sdk'
import { EDITOR_ACCEPT, useEditorStore } from '../stores/editorStore'

// The first screen, and the only one that isn't the editor. Its job is to say
// what this is and take some files — one is the whole compress path, several is
// an edit, and the app does not ask which you meant.
//
// The drop mechanics come from the SDK, shared with Universal Compress. The
// LOOK deliberately does not: Compress is a circle with a pill ring, this is a
// dashed rectangle that carries three paragraphs and a capability warning, and
// neither should be bent into the other's shape. `clickToBrowse` is OFF here
// because this zone has its own "choose a file" button inside it, and a click
// target wrapping a click target is ambiguous for a mouse and wrong for a
// screen reader.
export default function DropZone() {
  const addFiles = useEditorStore((s) => s.addFiles)
  const supported = useEditorStore((s) => s.supported)

  const drop = useFileDrop({ onFiles: addFiles, accept: EDITOR_ACCEPT, clickToBrowse: false })

  return (
    <div
      {...drop.dropzoneProps}
      className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors sm:p-14 ${
        drop.over
          ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20'
          : 'border-slate-300 bg-white hover:border-orange-400 dark:border-slate-700 dark:bg-slate-900'
      }`}
    >
      <input {...drop.inputProps} className="sr-only" />

      <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Drop a video here
      </p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        MP4, M4V and MOV — or
        {' '}
        <button
          type="button"
          onClick={drop.open}
          className="rounded font-semibold text-orange-700 underline underline-offset-2 hover:text-orange-800 focus-visible:outline-2 focus-visible:outline-orange-600 dark:text-orange-400"
        >
          choose a file
        </button>
      </p>

      <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">
        It opens in this tab, with a player and a timeline under it. Drop several
        and they line up one after another. Nothing is uploaded, and there is no
        size cap, no account, no watermark and no queue.
      </p>

      {supported === false && (
        <p className="mx-auto mt-6 max-w-md rounded-xl bg-amber-50 px-4 py-3 text-left text-xs leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <strong className="font-semibold">This browser can’t do the encoding.</strong>{' '}
          Compressing to MP4 needs a WebCodecs H.264 <em>encoder</em>, and this
          browser doesn’t have one — Firefox is the usual case. Chrome, Edge and
          Safari 16.4+ do. You can still drop a file and edit it here, but the
          export will not run.
        </p>
      )}
    </div>
  )
}
