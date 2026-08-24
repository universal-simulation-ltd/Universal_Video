import { DropAnywhere, DropRing, useFileDrop } from '@unisim/sdk'
import { EDITOR_ACCEPT, useEditorStore } from '../stores/editorStore'
import DropWatermark from './DropWatermark'

// The first screen, and the only one that isn't the editor. Its job is to say
// what this is and take some files — one file or several, a trim or a five-clip
// edit, and the app does not ask which you meant.
//
// The LOOK is the suite's, not this app's. This used to be a dashed rectangle
// with its own "choose a file" button inside it, on the argument that the
// mechanics are shared but the appearance is per-app. That argument is no
// longer worth its cost: Universal PDF, Universal Images and Universal Compress
// all take a file through the SAME circle — the SDK's `DropRing` — and a
// visitor who arrives from one of them should not have to learn a second front
// door. It is the same ring the "reading the header" state already uses (see
// `App.tsx`), so the target and the wait now match each other too.
//
// Three consequences of the ring worth knowing before you edit this:
//
//  • `clickToBrowse` is ON, so the whole circle is the button. It has to be:
//    `DropRing` sets `pointer-events: none` on its centre so nothing there can
//    ever swallow a drop, which means a nested button inside the ring would be
//    dead to the mouse. The words "choose a file" are therefore words, not a
//    control, and the accessible name on the ring says the same thing.
//  • ⚠️ This component is ONLY the ring now. The prose that used to sit under
//    it was a near-copy of the page lead, and the encoder warning moved to the
//    foot of the card in `Landing.tsx` — where the rest of the card's words
//    are. The ring's centre is about 220px wide and clips 2.5rem of padding
//    off each side; a paragraph does not go in it, and the card around it is
//    the place for one. Put copy back here only if it is about the RING.
//  • ⚠️ The ring's interior is painted `#ffffff` by the SDK in both themes, so
//    the text inside it is fixed dark and carries NO `dark:` variant. Adding
//    one puts white text on white.
//
// `pageWide` is on and paired with `DropAnywhere`, which is the other half of
// the pattern PDF and Images established: the circle is a target, not a wall,
// and a file let go over the margin is taken rather than lost — dropping it on
// the page with no handler would let the browser navigate away from the tab.
export default function DropZone() {
  const addFiles = useEditorStore((s) => s.addFiles)

  const drop = useFileDrop({
    onFiles: addFiles,
    accept: EDITOR_ACCEPT,
    clickToBrowse: true,
    pageWide: true,
    label: 'Drop a video here, or choose a file',
  })

  return (
    // No padding of its own: since the two-column front door landed this sits
    // inside a card in `App.tsx` that owns the padding, and having both meant
    // the ring was inset twice.
    <div className="flex flex-col items-center text-center">
      {/* Outside the ring, so the picker is never the thing a drop lands on. */}
      <input {...drop.inputProps} className="sr-only" />

      <div
        {...drop.dropzoneProps}
        className="w-64 max-w-full cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600 sm:w-72"
      >
        <DropRing over={drop.over} size="100%" watermark={<DropWatermark />}>
          <span className="text-base font-semibold text-slate-900">
            Drop a video here
          </span>
          <span className="text-sm text-slate-500">MP4, M4V or MOV</span>
          <span className="mt-1 text-sm font-semibold text-orange-700 underline underline-offset-2">
            or choose a file
          </span>
        </DropRing>
      </div>

      <DropAnywhere
        show={drop.pageOver}
        title="Drop it anywhere"
        hint="MP4, M4V or MOV — or an image for an intro or outro card"
      />
    </div>
  )
}
