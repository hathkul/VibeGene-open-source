import Dexie, { type Table } from 'dexie'

export type StoredFileOpenHandoff = {
  id: string
  path: string
  name: string
  bytes: Uint8Array
  createdAt: number
}

/**
 * One-shot raw-file handoff for opening a disk construct in a new workspace.
 * Prefer this over `?openPath=` when the bytes are already in memory (startup
 * drops / file picker), so the editor does not depend on a second FS read.
 */
class FileOpenHandoffDb extends Dexie {
  handoffs!: Table<StoredFileOpenHandoff, string>

  constructor() {
    super('vibegene-file-open-handoffs')
    this.version(1).stores({
      handoffs: 'id, createdAt',
    })
  }
}

const db = new FileOpenHandoffDb()

const MAX_AGE_MS = 5 * 60 * 1000

export async function putFileOpenHandoff(
  id: string,
  payload: { path: string; name: string; bytes: Uint8Array },
): Promise<void> {
  const now = Date.now()
  await db.handoffs.put({
    id,
    path: payload.path,
    name: payload.name,
    bytes: payload.bytes,
    createdAt: now,
  })
  // Best-effort cleanup of abandoned handoffs.
  void db.handoffs.where('createdAt').below(now - MAX_AGE_MS).delete().catch(() => {})
}

export async function takeFileOpenHandoff(id: string): Promise<StoredFileOpenHandoff | null> {
  const row = await db.handoffs.get(id)
  if (!row) return null
  await db.handoffs.delete(id)
  if (Date.now() - row.createdAt > MAX_AGE_MS) return null
  return row
}
