import { readAppPreferences } from '../domain/appPreferences'
import { RECENT_FILES_CHANGED_EVENT, type RecentFileEntry } from '../application/ports/recentFiles'
export { RECENT_FILES_CHANGED_EVENT, type RecentFileEntry } from '../application/ports/recentFiles'
const STORAGE_KEY = 'vibegene:recent-files'

function entryKey(entry: RecentFileEntry): string {
  return entry.kind === 'local' ? `local:${entry.path}` : `database:${entry.projectId}`
}

function normalizeEntry(raw: unknown): RecentFileEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const openedAt = typeof value.openedAt === 'string' ? value.openedAt : ''
  if (!name || !openedAt) return null
  if (value.kind === 'local') {
    const path = typeof value.path === 'string' ? value.path.trim() : ''
    if (!path) return null
    return { kind: 'local', name, path, openedAt }
  }
  if (value.kind === 'database') {
    const projectId = typeof value.projectId === 'string' ? value.projectId.trim() : ''
    if (!projectId) return null
    return { kind: 'database', name, projectId, openedAt }
  }
  return null
}

function readAllRecentFiles(): RecentFileEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeEntry).filter((entry): entry is RecentFileEntry => entry != null)
  } catch {
    return []
  }
}

function writeAllRecentFiles(entries: RecentFileEntry[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // ignore quota / private mode
  }
  try {
    window.dispatchEvent(new CustomEvent(RECENT_FILES_CHANGED_EVENT))
  } catch {
    // ignore
  }
}

function touchEntry(entry: RecentFileEntry, maxEntries: number) {
  const max = Math.max(1, maxEntries)
  const next = readAllRecentFiles().filter((existing) => entryKey(existing) !== entryKey(entry))
  next.unshift({ ...entry, openedAt: new Date().toISOString() })
  writeAllRecentFiles(next.slice(0, max))
}

export function listRecentFiles(maxEntries = readAppPreferences().maxRecentFiles): RecentFileEntry[] {
  const max = Math.max(1, maxEntries)
  return readAllRecentFiles().slice(0, max)
}

export function touchRecentLocalFile(path: string, name: string, maxEntries = readAppPreferences().maxRecentFiles) {
  const trimmedPath = path.trim()
  const trimmedName = name.trim()
  if (!trimmedPath || !trimmedName) return
  touchEntry({ kind: 'local', path: trimmedPath, name: trimmedName, openedAt: '' }, maxEntries)
}

export function touchRecentDatabaseProject(
  projectId: string,
  name: string,
  maxEntries = readAppPreferences().maxRecentFiles,
) {
  const trimmedId = projectId.trim()
  const trimmedName = name.trim()
  if (!trimmedId || !trimmedName) return
  touchEntry({ kind: 'database', projectId: trimmedId, name: trimmedName, openedAt: '' }, maxEntries)
}

export function removeRecentDatabaseProject(projectId: string) {
  const trimmedId = projectId.trim()
  if (!trimmedId) return
  const next = readAllRecentFiles().filter(
    (entry) => entry.kind !== 'database' || entry.projectId !== trimmedId,
  )
  if (next.length === readAllRecentFiles().length) return
  writeAllRecentFiles(next)
}

export function removeRecentLocalFile(path: string) {
  const trimmedPath = path.trim()
  if (!trimmedPath) return
  const next = readAllRecentFiles().filter((entry) => entry.kind !== 'local' || entry.path !== trimmedPath)
  if (next.length === readAllRecentFiles().length) return
  writeAllRecentFiles(next)
}

export function trimRecentFilesToLimit(maxEntries: number) {
  const max = Math.max(1, maxEntries)
  const current = readAllRecentFiles()
  if (current.length <= max) return
  writeAllRecentFiles(current.slice(0, max))
}
