const SYNC_TARGET_KEY = 'vibegene:database-sync-target'
const SYNC_FOLDER_KEY = 'vibegene:database-sync-folder'
const SYNC_AT_KEY = 'vibegene:database-sync-at'

/** Sync the whole library, or only the subtree of one DB folder into an OS folder. */
export type DatabaseSyncTarget = {
  path: string
  /** When set, OS folder maps to this DB folder (Import folder); paths omit this folder name. */
  folderId: string | null
  lastSyncedAt: string
}

function parseTarget(raw: string): DatabaseSyncTarget | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DatabaseSyncTarget>
    if (!parsed || typeof parsed.path !== 'string' || !parsed.path.trim()) return null
    return {
      path: parsed.path.trim(),
      folderId: typeof parsed.folderId === 'string' && parsed.folderId ? parsed.folderId : null,
      lastSyncedAt:
        typeof parsed.lastSyncedAt === 'string' && parsed.lastSyncedAt
          ? parsed.lastSyncedAt
          : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function readDatabaseSyncTarget(): DatabaseSyncTarget | null {
  try {
    const raw = window.localStorage.getItem(SYNC_TARGET_KEY)
    if (raw) {
      const target = parseTarget(raw)
      if (target) return target
    }
    // Migrate older path-only preference.
    const path = window.localStorage.getItem(SYNC_FOLDER_KEY)?.trim()
    if (!path) return null
    const lastSyncedAt = window.localStorage.getItem(SYNC_AT_KEY)?.trim() || new Date().toISOString()
    return { path, folderId: null, lastSyncedAt }
  } catch {
    return null
  }
}

export function readDatabaseSyncFolder(): string | null {
  return readDatabaseSyncTarget()?.path ?? null
}

export function readDatabaseLastSyncedAt(): string | null {
  return readDatabaseSyncTarget()?.lastSyncedAt ?? null
}

/** Remember a folder as the Sync to folder target and mark the library as in sync. */
export function rememberDatabaseSyncTarget(path: string, folderId: string | null = null) {
  try {
    const trimmed = path.trim()
    if (!trimmed) {
      window.localStorage.removeItem(SYNC_TARGET_KEY)
      window.localStorage.removeItem(SYNC_FOLDER_KEY)
      window.localStorage.removeItem(SYNC_AT_KEY)
      return
    }
    const target: DatabaseSyncTarget = {
      path: trimmed,
      folderId: folderId || null,
      lastSyncedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(SYNC_TARGET_KEY, JSON.stringify(target))
    // Keep legacy keys updated for older builds / debugging.
    window.localStorage.setItem(SYNC_FOLDER_KEY, trimmed)
    window.localStorage.setItem(SYNC_AT_KEY, target.lastSyncedAt)
  } catch {
    // ignore quota / private mode
  }
}
