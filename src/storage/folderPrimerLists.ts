import { createId, normalizeDna, nowIso } from '../domain/sequence'
import { db } from './projects'
import { collectFolderSubtreeIds } from './databaseExport'
import { listFolders } from './projectLibrary'

export type FolderPrimerEntry = {
  name: string
  sequence: string
  color?: string
  description?: string
}

/** A `.txt` primer list imported into a specific database folder. */
export type StoredFolderPrimerList = {
  id: string
  folderId: string
  /** Path relative to the import/sync root (`Primers/foo.txt`). */
  relativePath: string
  name: string
  primers: FolderPrimerEntry[]
  updatedAt: string
}

function fileNameOf(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || relativePath
}

function listDisplayName(relativePath: string): string {
  const fileName = fileNameOf(relativePath)
  return fileName.replace(/\.txt$/i, '').trim() || fileName || 'Primers'
}

function normalizeEntries(entries: FolderPrimerEntry[]): FolderPrimerEntry[] {
  const out: FolderPrimerEntry[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const name = entry.name.trim() || 'Primer'
    const sequence = normalizeDna(entry.sequence)
    if (!sequence) continue
    const key = `${name.toLowerCase()}\0${sequence}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      name,
      sequence,
      color: entry.color?.trim() || '#7c3aed',
      description: entry.description ?? '',
    })
  }
  return out
}

export async function listFolderPrimerLists(): Promise<StoredFolderPrimerList[]> {
  return db.folderPrimerLists.toArray()
}

export async function listFolderPrimerListsInFolders(
  folderIds: ReadonlySet<string> | null,
): Promise<StoredFolderPrimerList[]> {
  const rows = await listFolderPrimerLists()
  if (!folderIds) return rows
  return rows.filter((row) => folderIds.has(row.folderId))
}

export async function upsertFolderPrimerList(input: {
  folderId: string
  relativePath: string
  primers: FolderPrimerEntry[]
}): Promise<{ list: StoredFolderPrimerList; created: boolean; primerCount: number; unchanged: boolean }> {
  const relativePath = input.relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const primers = normalizeEntries(input.primers)
  const matched = await db.folderPrimerLists
    .where('[folderId+relativePath]')
    .equals([input.folderId, relativePath])
    .first()

  if (
    matched &&
    JSON.stringify(normalizeEntries(matched.primers)) === JSON.stringify(primers)
  ) {
    return { list: matched, created: false, primerCount: 0, unchanged: true }
  }

  const row: StoredFolderPrimerList = {
    id: matched?.id ?? createId('primer-list'),
    folderId: input.folderId,
    relativePath,
    name: listDisplayName(relativePath),
    primers,
    updatedAt: nowIso(),
  }
  await db.folderPrimerLists.put(row)
  return { list: row, created: !matched, primerCount: primers.length, unchanged: false }
}

export type SyncFolderPrimerListsResult = {
  listsSaved: number
  primersSaved: number
  listsRemoved: number
  primersRemoved: number
}

/**
 * Upsert primer lists for the given drafts. When `cleanup` is true, remove any
 * existing lists in the folder scope that are not present in `drafts`.
 */
export async function syncFolderPrimerLists(
  drafts: Array<{ folderId: string; relativePath: string; primers: FolderPrimerEntry[] }>,
  options: { rootFolderId: string | null; cleanup: boolean },
): Promise<SyncFolderPrimerListsResult> {
  const folders = await listFolders()
  const scopeIds =
    options.rootFolderId != null ? collectFolderSubtreeIds(folders, options.rootFolderId) : null

  let listsSaved = 0
  let primersSaved = 0
  const keptIds = new Set<string>()

  for (const draft of drafts) {
    if (scopeIds && !scopeIds.has(draft.folderId)) continue
    const { list, primerCount, unchanged } = await upsertFolderPrimerList(draft)
    keptIds.add(list.id)
    if (unchanged) continue
    listsSaved += 1
    primersSaved += primerCount
  }

  let listsRemoved = 0
  let primersRemoved = 0
  if (options.cleanup) {
    const existing = await listFolderPrimerListsInFolders(scopeIds)
    for (const row of existing) {
      if (keptIds.has(row.id)) continue
      primersRemoved += row.primers.length
      await db.folderPrimerLists.delete(row.id)
      listsRemoved += 1
    }
  }

  return { listsSaved, primersSaved, listsRemoved, primersRemoved }
}
