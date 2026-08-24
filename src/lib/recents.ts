/**
 * The last few videos you opened, kept in this browser.
 *
 * Modelled on Universal PDF's `lib/recents.ts` — same IndexedDB shape, same
 * "the list is metadata, the bytes come out one at a time" split — with ONE
 * difference that matters, and it is the whole reason this file has a budget:
 *
 * ⚠️ **A video is not a PDF.** PDF keeps eight documents because eight PDFs are
 * a few megabytes. Eight phone clips are several gigabytes, which is past what
 * a browser will grant and, on a laptop, past what anyone would want spent
 * silently on a recents list. So this store keeps **four**, refuses any single
 * file over `MAX_FILE_BYTES`, and holds `MAX_TOTAL_BYTES` across the lot —
 * and the list says so out loud, because a "recent files" list that quietly
 * drops the file you actually care about is worse than not having one.
 *
 * Nothing in here ever throws at the caller. IndexedDB is absent in some
 * private-browsing modes and full in others, and neither is a reason to fail
 * opening a video — the recents list is a convenience, not the app.
 */

const DB_NAME = 'universal-video'
const STORE = 'recents'
const VERSION = 1

/** How many videos the list holds. Four, not PDF's eight — see the note above. */
export const MAX_RECENTS = 4
/** Anything bigger than this is opened and never kept. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024
/** ...and the whole store stays under this, however few files that turns out to be. */
export const MAX_TOTAL_BYTES = 250 * 1024 * 1024

/** What the list shows. Cheap to read — no bytes come with it. */
export interface RecentMeta {
  id: string
  name: string
  size: number
  /** Seconds, from the probe the editor did anyway. 0 for anything not measured. */
  durationSec: number
  width: number
  height: number
  lastOpened: number
}

export interface RecentFile extends RecentMeta {
  type: string
  bytes: ArrayBuffer
}

/**
 * Which entries survive, newest first — the one piece of this file with an
 * honest unit test, and the only piece with a decision in it.
 *
 * Both caps are applied in the same pass, because they disagree: four small
 * clips fit and two large ones do not, and the count alone would keep both.
 * Anything past either cap is dropped, oldest first.
 */
export function keepWithinBudget<T extends { size: number; lastOpened: number }>(
  entries: T[],
): { keep: T[]; drop: T[] } {
  const newestFirst = [...entries].sort((a, b) => b.lastOpened - a.lastOpened)
  const keep: T[] = []
  const drop: T[] = []
  let total = 0
  for (const entry of newestFirst) {
    // ⚠️ `continue`, not `break`. A single big file part way down the list must
    // not evict the small ones behind it — it is over the budget, they are not.
    if (keep.length >= MAX_RECENTS || total + entry.size > MAX_TOTAL_BYTES) {
      drop.push(entry)
      continue
    }
    keep.push(entry)
    total += entry.size
  }
  return { keep, drop }
}

/** True if a file is small enough to be worth keeping a copy of at all. */
export function isKeepable(size: number): boolean {
  return size > 0 && size <= MAX_FILE_BYTES
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** The list, newest first. `[]` if the browser won't give us a database. */
export async function listRecents(): Promise<RecentMeta[]> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readonly')
    const all = await request<RecentFile[]>(tx.objectStore(STORE).getAll())
    db.close()
    return keepWithinBudget(all)
      .keep.map(({ id, name, size, durationSec, width, height, lastOpened }) => ({
        id,
        name,
        size,
        durationSec,
        width,
        height,
        lastOpened,
      }))
  } catch {
    return []
  }
}

/**
 * Remember a file. Returns whether it was kept, so the caller can say so —
 * a big clip is opened exactly the same way, it just leaves no trace.
 */
export async function saveRecent(
  file: File,
  probe: { durationSec: number; width: number; height: number },
): Promise<boolean> {
  if (!isKeepable(file.size)) return false
  try {
    const bytes = await file.arrayBuffer()
    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const existing = await request<RecentFile[]>(store.getAll())

    // Same name AND size is the same video re-opened, not a second copy of it.
    const id =
      existing.find((r) => r.name === file.name && r.size === file.size)?.id ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

    const entry: RecentFile = {
      id,
      name: file.name,
      size: file.size,
      type: file.type || 'video/mp4',
      durationSec: probe.durationSec,
      width: probe.width,
      height: probe.height,
      lastOpened: Date.now(),
      bytes,
    }
    store.put(entry)

    const { drop } = keepWithinBudget([...existing.filter((r) => r.id !== id), entry])
    drop.forEach((r) => store.delete(r.id))

    await done(tx)
    db.close()
    return true
  } catch {
    // A full quota, a private window, a browser with the API switched off.
    // Opening the video worked; only remembering it did not.
    return false
  }
}

/** The bytes back, as the `File` the editor takes. `null` if it has gone. */
export async function getRecent(id: string): Promise<File | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readonly')
    const entry = await request<RecentFile | undefined>(tx.objectStore(STORE).get(id))
    db.close()
    if (!entry) return null
    return new File([entry.bytes], entry.name, { type: entry.type })
  } catch {
    return null
  }
}

export async function deleteRecent(id: string): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    await done(tx)
    db.close()
  } catch {
    // Nothing to do about it, and nothing worth telling anyone.
  }
}
