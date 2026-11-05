import { createId, nowIso } from '../domain/sequence'
import { isSnapGeneBytes, isVibeGeneConstructJson, parseProjectJson, parseSequenceBytes, parseSnapGene, rejectedSequenceDocumentReason } from '../domain/parsers'
import { isSettingsFile } from '../domain/settingsFile'
import { inferProjectFileFormat, isFolderScopedSyncFileName, isSequenceOpenFileName } from '../domain/fileFormats'
import { importRequiresTopologyChoice } from '../domain/sequenceTopology'
import { normalizeSequenceRecord } from '../domain/constructProperties'
import { isDnaLibraryRecord } from '../domain/dnaLibrary'
import type { SequenceRecord } from '../domain/types'
import type { MwLadder } from '../domain/mwLadders'
import { createFolder, listFolders, renameProject } from './projectLibrary'
import {
  deleteProjects,
  getProject,
  saveProject,
  setProjectSyncRelativePath,
  setProjectSyncSourceHash,
} from './projects'
import { pauseLibraryChangeNotifications, resumeLibraryChangeNotifications } from './libraryEvents'
import { syncFolderPrimerLists } from './folderPrimerLists'
import { hashSyncSourceBytes } from './syncSourceHash'
import {
  DATABASE_EXPORT_FORMAT,
  DATABASE_EXPORT_MANIFEST_NAME,
  listDatabaseExportIndex,
  type DatabaseExportManifest,
} from './databaseExport'
import { isPrimerListTabText, parsePrimerDataTsv } from '../domain/primerExport'
import { planInboundCleanupRemovals, planInboundConstructSync, sequenceFileStem } from './databaseSync'
import {
  hashConstructSemanticRecord,
} from './databaseImportSemanticHash'

export {
  constructSyncContentKey,
  constructSyncContentKeyWithoutHistory,
  hashConstructSemanticRecord,
  hashConstructSemanticRecordWithoutHistory,
  hashUnversionedConstructSemanticRecord,
} from './databaseImportSemanticHash'

export type VirtualFsEntry = {
  /** Path relative to the chosen root, using `/` separators. */
  relativePath: string
  bytes: Uint8Array
  /** Optional filesystem mtime (ms since epoch) for Sync to database. */
  mtimeMs?: number | null
}

/** The bytes win over the suffix when a legacy database file uses `.gb` for a SnapGene packet. */
function sourceFileFormat(fileName: string, bytes: Uint8Array) {
  return isSnapGeneBytes(bytes) ? 'snapgene' as const : inferProjectFileFormat(fileName)
}

export type LibraryImportExtras = {
  folderId?: string | null
  tags?: string[]
  customMwLadders?: MwLadder[]
  /** Prefer this name for the saved construct when set. */
  constructName?: string
  /** Sync-folder relative path to remember for later inbound matching. */
  syncRelativePath?: string | null
  /** Skip a second SHA-256 when the caller already hashed these bytes. */
  contentHash?: string
}

export type BytesImportResult =
  | { ok: true; name: string; id: string; unchanged?: boolean }
  | { ok: false; fileName: string; error: string }

export type BytesImportFailure = Extract<BytesImportResult, { ok: false }>

/** Hash an imported file's parsed construct for safe recovery of import baselines. */
export async function hashImportedFileSemanticRecord(
  fileName: string,
  bytes: Uint8Array,
): Promise<string | null> {
  try {
    const parsed = await parseBytesToRecord(fileName, bytes)
    return 'error' in parsed ? null : hashConstructSemanticRecord(parsed.record)
  } catch {
    return null
  }
}

function fileNameOf(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || relativePath
}

function withFreshId(record: SequenceRecord, constructName?: string): SequenceRecord {
  const timestamp = nowIso()
  return normalizeSequenceRecord({
    ...record,
    id: createId('seq'),
    name: constructName?.trim() || record.name,
    createdAt: record.createdAt || timestamp,
    updatedAt: timestamp,
    traceFiles: isDnaLibraryRecord(record) ? record.traceFiles : undefined,
  })
}

function withPreservedId(
  record: SequenceRecord,
  existing: SequenceRecord,
  constructName?: string,
): SequenceRecord {
  const timestamp = nowIso()
  return normalizeSequenceRecord({
    ...record,
    id: existing.id,
    name: constructName?.trim() || record.name || existing.name,
    createdAt: existing.createdAt || record.createdAt || timestamp,
    updatedAt: timestamp,
    traceFiles: isDnaLibraryRecord(record) ? record.traceFiles : undefined,
  })
}

async function parseBytesToRecord(
  fileName: string,
  bytes: Uint8Array,
  constructName?: string,
  existing?: SequenceRecord | null,
): Promise<{ record: SequenceRecord; customMwLadders?: MwLadder[] } | { error: string }> {
  const finalize = (record: SequenceRecord, customMwLadders?: MwLadder[]) => ({
    record: existing
      ? withPreservedId(record, existing, constructName)
      : withFreshId(record, constructName),
    ...(customMwLadders?.length ? { customMwLadders } : {}),
  })

  if (isSnapGeneBytes(bytes)) {
    // DNA-library members are stored in SnapGene alignment packets. Parse them here;
    // finalize strips traces from ordinary constructs while retaining library members.
    return finalize(parseSnapGene(bytes, fileName))
  }

  const rejected = rejectedSequenceDocumentReason(bytes)
  if (rejected) return { error: rejected }

  const text = new TextDecoder().decode(bytes)
  if (text.trim().startsWith('{') && /\.json$/i.test(fileName)) {
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(text)
    } catch {
      return { error: 'Invalid JSON' }
    }
    if (isSettingsFile(parsedJson)) {
      return { error: 'Settings files cannot be imported into the database' }
    }
    if (isDatabaseExportManifest(parsedJson)) {
      return { error: 'Database manifest is not a construct file' }
    }
    if (!isVibeGeneConstructJson(parsedJson)) {
      return { error: 'Not a VibeGene construct file' }
    }
    const project = parseProjectJson(text)
    return finalize(project.record, project.customMwLadders)
  }

  let parsed = parseSequenceBytes(
    (() => {
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      return copy.buffer
    })(),
    fileName,
  )
  if (parsed.molecule !== 'protein' && importRequiresTopologyChoice(text, fileName)) {
    parsed = normalizeSequenceRecord({ ...parsed, topology: 'circular' })
  }
  return finalize(parsed)
}

/** Parse bytes and save into the library (always assigns a new project id). */
export async function importBytesIntoLibrary(
  fileName: string,
  bytes: Uint8Array,
  extras: LibraryImportExtras = {},
): Promise<BytesImportResult> {
  if (!isSequenceOpenFileName(fileName)) {
    return { ok: false, fileName, error: 'Unsupported file type' }
  }
  if (fileName.toLowerCase() === DATABASE_EXPORT_MANIFEST_NAME.toLowerCase()) {
    return { ok: false, fileName, error: 'Database manifest is not a construct file' }
  }

  const folderId = extras.folderId ?? null
  const tags = extras.tags ?? []

  try {
    const syncSourceHash = extras.contentHash ?? (await hashSyncSourceBytes(bytes))
    const fileFormat = sourceFileFormat(fileName, bytes)
    const parsed = await parseBytesToRecord(fileName, bytes, extras.constructName)
    if ('error' in parsed) return { ok: false, fileName, error: parsed.error }
    const semanticRecordHash = await hashConstructSemanticRecord(parsed.record)
    await saveProject(parsed.record, {
      folderId,
      tags,
      syncSourceHash,
      fileName,
      fileFormat,
      fileBytes: bytes,
      fileProvenance: extras.syncRelativePath ? 'sync-folder' : 'imported',
      fileSyncState: extras.syncRelativePath ? 'synced' : 'local-only',
      baseline: {
        contentHash: syncSourceHash,
        semanticRecordHash,
        ...(extras.syncRelativePath ? { relativePath: extras.syncRelativePath } : {}),
      },
      ...(extras.syncRelativePath !== undefined
        ? { syncRelativePath: extras.syncRelativePath }
        : {}),
      ...(extras.customMwLadders?.length
        ? { customMwLadders: extras.customMwLadders }
        : parsed.customMwLadders?.length
          ? { customMwLadders: parsed.customMwLadders }
          : {}),
    })
    return { ok: true, name: parsed.record.name, id: parsed.record.id }
  } catch (error) {
    return {
      ok: false,
      fileName,
      error: error instanceof Error ? error.message : 'Could not import file',
    }
  }
}

/** Replace an existing construct's sequence body while keeping its id and folder/tags. */
export async function importBytesReplacingProject(
  projectId: string,
  fileName: string,
  bytes: Uint8Array,
  extras: LibraryImportExtras = {},
): Promise<BytesImportResult> {
  if (!isSequenceOpenFileName(fileName)) {
    return { ok: false, fileName, error: 'Unsupported file type' }
  }
  const existing = await getProject(projectId)
  if (!existing) {
    return { ok: false, fileName, error: 'Construct not found in database' }
  }

  try {
    const syncSourceHash = extras.contentHash ?? (await hashSyncSourceBytes(bytes))
    const fileFormat = sourceFileFormat(fileName, bytes)
    const existingSemanticRecordHash = await hashConstructSemanticRecord(existing.record)
    if (existing.syncSourceHash && existing.syncSourceHash === syncSourceHash) {
      await saveProject(existing.record, {
        folderId: extras.folderId !== undefined ? extras.folderId : existing.folderId,
        tags: extras.tags !== undefined ? extras.tags : existing.tags,
        syncSourceHash,
        fileName,
        fileFormat,
        fileBytes: bytes,
        fileProvenance: extras.syncRelativePath ? 'sync-folder' : existing.fileProvenance,
        fileSyncState: extras.syncRelativePath ? 'synced' : existing.fileSyncState,
        baseline: {
          contentHash: syncSourceHash,
          semanticRecordHash: existingSemanticRecordHash,
          ...(extras.syncRelativePath ?? existing.syncRelativePath
            ? { relativePath: extras.syncRelativePath ?? existing.syncRelativePath }
            : {}),
        },
        ...(extras.syncRelativePath !== undefined
          ? { syncRelativePath: extras.syncRelativePath }
          : {}),
        ...(existing.customMwLadders?.length
          ? { customMwLadders: existing.customMwLadders }
          : {}),
      })
      if (extras.syncRelativePath && extras.syncRelativePath !== existing.syncRelativePath) {
        await setProjectSyncRelativePath(existing.record.id, extras.syncRelativePath)
      }
      const preferredName = extras.constructName?.trim()
      if (preferredName && preferredName !== existing.record.name) {
        await renameProject(existing.record.id, preferredName)
        return { ok: true, name: preferredName, id: existing.record.id, unchanged: true }
      }
      return { ok: true, name: existing.record.name, id: existing.record.id, unchanged: true }
    }
    const parsed = await parseBytesToRecord(fileName, bytes, extras.constructName, existing.record)
    if ('error' in parsed) return { ok: false, fileName, error: parsed.error }
    const semanticRecordHash = await hashConstructSemanticRecord(parsed.record)
    if (semanticRecordHash === existingSemanticRecordHash) {
      await saveProject(existing.record, {
        folderId: extras.folderId !== undefined ? extras.folderId : existing.folderId,
        tags: extras.tags !== undefined ? extras.tags : existing.tags,
        syncSourceHash,
        fileName,
        fileFormat,
        fileBytes: bytes,
        fileProvenance: extras.syncRelativePath ? 'sync-folder' : existing.fileProvenance,
        fileSyncState: extras.syncRelativePath ? 'synced' : existing.fileSyncState,
        baseline: {
          contentHash: syncSourceHash,
          semanticRecordHash,
          ...(extras.syncRelativePath ?? existing.syncRelativePath
            ? { relativePath: extras.syncRelativePath ?? existing.syncRelativePath }
            : {}),
        },
        ...(extras.syncRelativePath !== undefined
          ? { syncRelativePath: extras.syncRelativePath }
          : {}),
        ...(existing.customMwLadders?.length
          ? { customMwLadders: existing.customMwLadders }
          : {}),
      })
      const preferredName = extras.constructName?.trim()
      if (preferredName && preferredName !== existing.record.name) {
        await renameProject(existing.record.id, preferredName)
        return { ok: true, name: preferredName, id: existing.record.id, unchanged: true }
      }
      return { ok: true, name: existing.record.name, id: existing.record.id, unchanged: true }
    }
    await saveProject(parsed.record, {
      folderId: extras.folderId !== undefined ? extras.folderId : existing.folderId,
      tags: extras.tags !== undefined ? extras.tags : existing.tags,
      syncSourceHash,
      fileName,
      fileFormat,
      fileBytes: bytes,
      fileProvenance: extras.syncRelativePath ? 'sync-folder' : 'imported',
      fileSyncState: extras.syncRelativePath ? 'synced' : 'local-only',
      baseline: {
        contentHash: syncSourceHash,
        semanticRecordHash,
        ...(extras.syncRelativePath ? { relativePath: extras.syncRelativePath } : {}),
      },
      ...(extras.syncRelativePath !== undefined
        ? { syncRelativePath: extras.syncRelativePath }
        : {}),
      ...(extras.customMwLadders?.length
        ? { customMwLadders: extras.customMwLadders }
        : parsed.customMwLadders?.length
          ? { customMwLadders: parsed.customMwLadders }
          : existing.customMwLadders?.length
            ? { customMwLadders: existing.customMwLadders }
            : {}),
    })
    return { ok: true, name: parsed.record.name, id: parsed.record.id }
  } catch (error) {
    return {
      ok: false,
      fileName,
      error: error instanceof Error ? error.message : 'Could not import file',
    }
  }
}

export function isDatabaseExportManifest(value: unknown): value is DatabaseExportManifest {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<DatabaseExportManifest>
  return (
    row.format === DATABASE_EXPORT_FORMAT &&
    typeof row.version === 'number' &&
    Array.isArray(row.folders) &&
    Array.isArray(row.projects)
  )
}

export function parseDatabaseExportManifest(bytes: Uint8Array): DatabaseExportManifest {
  const text = new TextDecoder().decode(bytes)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Invalid vibegene-database.json')
  }
  if (!isDatabaseExportManifest(parsed)) {
    throw new Error('Not a VibeGene database export manifest')
  }
  return parsed
}

export async function createUniqueFolder(name: string, parentId: string | null = null) {
  const siblings = (await listFolders()).filter((folder) => (folder.parentId ?? null) === parentId)
  const base = name.trim() || 'Untitled folder'
  let candidate = base
  let index = 2
  while (siblings.some((folder) => folder.name.toLowerCase() === candidate.toLowerCase())) {
    candidate = `${base} (${index})`
    index += 1
  }
  return createFolder(candidate, parentId)
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

function findManifestEntry(entries: VirtualFsEntry[]): VirtualFsEntry | null {
  const exact = entries.find(
    (entry) => normalizeRelativePath(entry.relativePath).toLowerCase() === DATABASE_EXPORT_MANIFEST_NAME,
  )
  if (exact) return exact
  // Allow a single nested root folder wrapping the export.
  const nested = entries.filter((entry) => {
    const parts = normalizeRelativePath(entry.relativePath).split('/')
    return parts.length === 2 && parts[1]!.toLowerCase() === DATABASE_EXPORT_MANIFEST_NAME
  })
  return nested.length === 1 ? nested[0]! : null
}

export type ImportDatabaseResult = {
  foldersCreated: number
  projectsSaved: number
  failed: BytesImportFailure[]
}

/** Import a previously exported database from an in-memory virtual filesystem. */
export async function importDatabaseFromVirtualFs(
  entries: VirtualFsEntry[],
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportDatabaseResult> {
  pauseLibraryChangeNotifications()
  try {
    return await importDatabaseFromVirtualFsUnpaused(entries, onProgress)
  } finally {
    resumeLibraryChangeNotifications()
  }
}

async function importDatabaseFromVirtualFsUnpaused(
  entries: VirtualFsEntry[],
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportDatabaseResult> {
  const manifestEntry = findManifestEntry(entries)
  if (!manifestEntry) {
    throw new Error(`Missing ${DATABASE_EXPORT_MANIFEST_NAME} in the selected export`)
  }
  const manifest = parseDatabaseExportManifest(manifestEntry.bytes)
  const prefix = normalizeRelativePath(manifestEntry.relativePath).includes('/')
    ? normalizeRelativePath(manifestEntry.relativePath).split('/').slice(0, -1).join('/') + '/'
    : ''

  const byPath = new Map(
    entries.map((entry) => [normalizeRelativePath(entry.relativePath).toLowerCase(), entry]),
  )

  // Create folders parents-first.
  const remaining = [...manifest.folders]
  const idMap = new Map<string, string>()
  let foldersCreated = 0
  let guard = remaining.length + 5
  while (remaining.length > 0 && guard > 0) {
    guard -= 1
    let progressed = false
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const folder = remaining[index]!
      if (folder.parentId && !idMap.has(folder.parentId)) continue
      const parentId = folder.parentId ? (idMap.get(folder.parentId) ?? null) : null
      const created = await createUniqueFolder(folder.name, parentId)
      idMap.set(folder.id, created.id)
      foldersCreated += 1
      remaining.splice(index, 1)
      progressed = true
    }
    if (!progressed) break
  }
  if (remaining.length > 0) {
    throw new Error('Could not recreate folder hierarchy (cycle or missing parent).')
  }

  const failed: BytesImportFailure[] = []
  let projectsSaved = 0
  for (let index = 0; index < manifest.projects.length; index += 1) {
    const project = manifest.projects[index]!
    onProgress?.(index, manifest.projects.length, project.name)
    const relative = normalizeRelativePath(`${prefix}${project.relativePath}`)
    const file = byPath.get(relative.toLowerCase())
    if (!file) {
      failed.push({ ok: false, fileName: project.relativePath, error: 'File missing from export' })
      continue
    }
    const folderId = project.folderId ? (idMap.get(project.folderId) ?? null) : null
    const result = await importBytesIntoLibrary(
      fileNameOf(project.fileName ?? project.relativePath),
      file.bytes,
      {
      folderId,
      tags: project.tags ?? [],
      constructName: project.constructName || project.name,
      ...(project.customMwLadders?.length ? { customMwLadders: project.customMwLadders } : {}),
      },
    )
    if (result.ok) projectsSaved += 1
    else failed.push(result)
  }
  onProgress?.(manifest.projects.length, manifest.projects.length, 'done')

  return { foldersCreated, projectsSaved, failed }
}

export type ImportFolderResult = {
  rootFolderId: string
  rootFolderName: string
  foldersCreated: number
  projectsSaved: number
  primersSaved: number
  primersSkipped: number
  failed: BytesImportFailure[]
}

/**
 * Import an OS folder tree: create a top-level DB folder named after the root,
 * recreate subfolders, and import sequence files.
 * `.txt` files are not imported as constructs; `name<tab>sequence` primer lists
 * are stored on the matching database folder (not Common primers).
 */
export async function importFolderTreeFromVirtualFs(
  rootFolderName: string,
  entries: VirtualFsEntry[],
  onProgress?: (done: number, total: number, name: string) => void,
  loadBytes?: (entry: VirtualFsEntry) => Promise<Uint8Array>,
): Promise<ImportFolderResult> {
  pauseLibraryChangeNotifications()
  try {
    return await importFolderTreeFromVirtualFsUnpaused(rootFolderName, entries, onProgress, loadBytes)
  } finally {
    resumeLibraryChangeNotifications()
  }
}

async function importFolderTreeFromVirtualFsUnpaused(
  rootFolderName: string,
  entries: VirtualFsEntry[],
  onProgress?: (done: number, total: number, name: string) => void,
  loadBytes?: (entry: VirtualFsEntry) => Promise<Uint8Array>,
): Promise<ImportFolderResult> {
  const root = await createUniqueFolder(rootFolderName, null)
  const folderCache = new Map<string, string>() // relative dir path → folder id
  folderCache.set('', root.id)

  async function ensureDir(relativeDir: string): Promise<string> {
    const normalized = normalizeRelativePath(relativeDir).replace(/\/+$/, '')
    if (!normalized) return root.id
    const cached = folderCache.get(normalized)
    if (cached) return cached
    const parts = normalized.split('/').filter(Boolean)
    let parentId = root.id
    let built = ''
    for (const part of parts) {
      built = built ? `${built}/${part}` : part
      const existing = folderCache.get(built)
      if (existing) {
        parentId = existing
        continue
      }
      const created = await createUniqueFolder(part, parentId)
      folderCache.set(built, created.id)
      parentId = created.id
    }
    return parentId
  }

  function isTxtFileName(name: string) {
    return name.toLowerCase().endsWith('.txt')
  }

  const sequenceEntries = entries.filter((entry) =>
    isFolderScopedSyncFileName(fileNameOf(entry.relativePath)),
  )

  const primerListEntries = entries.filter((entry) => {
    const name = fileNameOf(entry.relativePath)
    if (!name || name === '.keep' || name.startsWith('.')) return false
    return isTxtFileName(name)
  })

  const workTotal = sequenceEntries.length + primerListEntries.length
  const failed: BytesImportFailure[] = []
  let projectsSaved = 0
  let workIndex = 0

  for (const entry of sequenceEntries) {
    const relative = normalizeRelativePath(entry.relativePath)
    const name = fileNameOf(relative)
    onProgress?.(workIndex, workTotal, name)
    workIndex += 1
    const dir = relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : ''
    const folderId = await ensureDir(dir)
    let bytes: Uint8Array
    try {
      bytes = loadBytes ? await loadBytes(entry) : entry.bytes
    } catch (error) {
      failed.push({ ok: false, fileName: name, error: error instanceof Error ? error.message : String(error) })
      continue
    }
    const result = await importBytesIntoLibrary(name, bytes, {
      folderId,
      tags: [],
      constructName: sequenceFileStem(name),
      syncRelativePath: relative,
    })
    if (result.ok) projectsSaved += 1
    else failed.push(result)
  }

  const primerDrafts: Array<{
    folderId: string
    relativePath: string
    primers: Array<{ name: string; sequence: string; description: string }>
  }> = []
  for (const entry of primerListEntries) {
    const relative = normalizeRelativePath(entry.relativePath)
    const name = fileNameOf(relative)
    onProgress?.(workIndex, workTotal, name)
    workIndex += 1
    let bytes: Uint8Array
    try {
      bytes = loadBytes ? await loadBytes(entry) : entry.bytes
    } catch (error) {
      failed.push({ ok: false, fileName: name, error: error instanceof Error ? error.message : String(error) })
      continue
    }
    const text = new TextDecoder().decode(bytes)
    if (!isPrimerListTabText(text)) continue
    const parsed = parsePrimerDataTsv(text, { requireTab: true })
    const dir = relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : ''
    const folderId = await ensureDir(dir)
    primerDrafts.push({
      folderId,
      relativePath: relative,
      primers: parsed.map((primer) => ({
        name: primer.name,
        sequence: primer.sequence,
        description: `Imported from ${name}`,
      })),
    })
  }
  const primerSync = await syncFolderPrimerLists(primerDrafts, {
    rootFolderId: root.id,
    cleanup: false,
  })

  onProgress?.(workTotal, workTotal, 'done')

  return {
    rootFolderId: root.id,
    rootFolderName: root.name,
    foldersCreated: folderCache.size,
    projectsSaved,
    primersSaved: primerSync.primersSaved,
    primersSkipped: 0,
    failed,
  }
}

export type SyncFolderIntoDatabaseResult = {
  rootFolderId: string | null
  projectsAdded: number
  projectsUpdated: number
  projectsSkipped: number
  projectsRemoved: number
  primersSaved: number
  primersSkipped: number
  primersRemoved: number
  foldersCreated: number
  failed: BytesImportFailure[]
}

export type SyncPlanDiagnosticWriter = (fileName: string, contents: string) => Promise<void>

/**
 * Rescan an OS folder into an existing DB folder (or whole library when root is null).
 * Adds new sequence files, updates constructs when disk mtime is newer than lastSyncedAt
 * (or newer than the construct updatedAt when never synced), skips no-op content replaces,
 * and stores tab-separated primer `.txt` lists on the matching database folders.
 *
 * When `cleanup` is true, also removes constructs and folder primer lists (in scope)
 * that are not present in the source folder. Common primers are never modified.
 */
export async function syncFolderTreeIntoDatabase(
  entries: VirtualFsEntry[],
  options: {
    rootFolderId: string | null
    lastSyncedAt: string | null
    cleanup?: boolean
    writeDiagnosticText?: SyncPlanDiagnosticWriter
  },
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<SyncFolderIntoDatabaseResult> {
  pauseLibraryChangeNotifications()
  try {
    return await syncFolderTreeIntoDatabaseUnpaused(entries, options, onProgress)
  } finally {
    resumeLibraryChangeNotifications()
  }
}

async function syncFolderTreeIntoDatabaseUnpaused(
  entries: VirtualFsEntry[],
  options: {
    rootFolderId: string | null
    lastSyncedAt: string | null
    cleanup?: boolean
    writeDiagnosticText?: SyncPlanDiagnosticWriter
  },
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<SyncFolderIntoDatabaseResult> {
  const rootFolderId = options.rootFolderId
  const cleanup = options.cleanup === true
  if (rootFolderId) {
    const folders = await listFolders()
    if (!folders.some((folder) => folder.id === rootFolderId)) {
      throw new Error('Linked database folder no longer exists')
    }
  }

  const folderCache = new Map<string, string | null>()
  folderCache.set('', rootFolderId)
  let foldersCreated = 0
  let foldersSnapshot = await listFolders()

  async function ensureDir(relativeDir: string): Promise<string | null> {
    const normalized = normalizeRelativePath(relativeDir).replace(/\/+$/, '')
    if (!normalized) return rootFolderId
    if (folderCache.has(normalized)) return folderCache.get(normalized) ?? null
    const parts = normalized.split('/').filter(Boolean)
    let parentId = rootFolderId
    let built = ''
    for (const part of parts) {
      built = built ? `${built}/${part}` : part
      if (folderCache.has(built)) {
        parentId = folderCache.get(built) ?? null
        continue
      }
      const existing = foldersSnapshot.find(
        (folder) =>
          (folder.parentId ?? null) === parentId &&
          folder.name.toLowerCase() === part.toLowerCase(),
      )
      if (existing) {
        folderCache.set(built, existing.id)
        parentId = existing.id
        continue
      }
      const created = await createFolder(part, parentId)
      foldersCreated += 1
      foldersSnapshot = [...foldersSnapshot, created]
      folderCache.set(built, created.id)
      parentId = created.id
    }
    return parentId
  }

  function isTxtFileName(name: string) {
    return name.toLowerCase().endsWith('.txt')
  }

  const byPath = new Map(
    entries.map((entry) => [normalizeRelativePath(entry.relativePath).toLowerCase(), entry]),
  )

  const sequenceEntries = entries.filter((entry) =>
    isFolderScopedSyncFileName(fileNameOf(entry.relativePath)),
  )

  const txtEntries = entries.filter((entry) => {
    const name = fileNameOf(entry.relativePath)
    if (!name || name === '.keep' || name.startsWith('.')) return false
    return isTxtFileName(name)
  })

  onProgress?.(0, Math.max(1, sequenceEntries.length), 'plan: hashing folder…')
  const index = await listDatabaseExportIndex({ rootFolderId })
  const diskFiles = await Promise.all(
    sequenceEntries.map(async (entry) => ({
      relativePath: normalizeRelativePath(entry.relativePath),
      mtimeMs: entry.mtimeMs ?? null,
      contentHash: await hashSyncSourceBytes(entry.bytes),
    })),
  )
  const libraryFiles = index.projects.map((project) => ({
    projectId: project.projectId,
    name: project.name,
    relativePath: project.relativePath,
    syncRelativePath: project.syncRelativePath ?? null,
    updatedAt: project.updatedAt,
    syncSourceHash: project.syncSourceHash ?? null,
  }))
  const plan = planInboundConstructSync(diskFiles, libraryFiles, options.lastSyncedAt)
  const removalIds = cleanup
    ? planInboundCleanupRemovals(diskFiles, libraryFiles, plan.matchedProjectIds)
    : []

  // Only tab-separated primer lists participate in work; other .txt files are ignored.
  const primerListEntries = txtEntries.filter((entry) => {
    const text = new TextDecoder().decode(entry.bytes)
    return isPrimerListTabText(text)
  })

  if (import.meta.env.DEV && options.writeDiagnosticText) {
    try {
      const workActionsPreview = plan.actions.filter((action) => action.kind === 'add' || action.kind === 'update')
      await options.writeDiagnosticText(
        'vibegene-last-sync-plan.json',
        JSON.stringify(
          {
            at: new Date().toISOString(),
            lastSyncedAt: options.lastSyncedAt,
            rootFolderId,
            library: libraryFiles.length,
            disk: diskFiles.length,
            withSyncPath: libraryFiles.filter((f) => f.syncRelativePath).length,
            withHash: libraryFiles.filter((f) => f.syncSourceHash).length,
            add: workActionsPreview.filter((a) => a.kind === 'add').length,
            update: workActionsPreview.filter((a) => a.kind === 'update').length,
            skip: plan.skippedUnchanged,
            dup: plan.skippedDuplicates,
            remove: removalIds.length,
            primersTxt: primerListEntries.length,
            workTotal:
              workActionsPreview.length + primerListEntries.length + (cleanup ? removalIds.length : 0),
            sampleAdds: workActionsPreview
              .filter((a) => a.kind === 'add')
              .slice(0, 20)
              .map((a) => a.relativePath),
          },
          null,
          2,
        ),
      )
    } catch (error) {
      console.warn('sync plan dump failed', error)
    }
  }

  const hashByPath = new Map(diskFiles.map((file) => [file.relativePath.toLowerCase(), file.contentHash]))

  const workActions = plan.actions.filter((action) => action.kind === 'add' || action.kind === 'update')
  const workTotal = workActions.length + primerListEntries.length + (cleanup ? removalIds.length : 0)
  onProgress?.(
    0,
    Math.max(1, workTotal),
    cleanup
      ? `plan: add ${workActions.filter((a) => a.kind === 'add').length}, update ${workActions.filter((a) => a.kind === 'update').length}, skip ${plan.skippedUnchanged}, remove ${removalIds.length}`
      : `plan: add ${workActions.filter((a) => a.kind === 'add').length}, update ${workActions.filter((a) => a.kind === 'update').length}, skip ${plan.skippedUnchanged}`,
  )

  // Learn / adopt hashes and source paths for skipped matches (batched).
  // Also restore construct names from on-disk stems (GenBank LOCUS is often truncated).
  const adoptJobs: Array<Promise<void>> = []
  for (const action of plan.actions) {
    if (action.kind !== 'skip' || action.reason !== 'unchanged' || !action.projectId) continue
    const hash = hashByPath.get(action.relativePath.toLowerCase())
    const library = libraryFiles.find((file) => file.projectId === action.projectId)
    if (hash && library?.syncSourceHash !== hash) {
      adoptJobs.push(setProjectSyncSourceHash(action.projectId, hash))
    }
    if (library?.syncRelativePath !== action.relativePath) {
      adoptJobs.push(setProjectSyncRelativePath(action.projectId, action.relativePath))
    }
    const stem = sequenceFileStem(fileNameOf(action.relativePath))
    if (stem && library?.name !== stem) {
      adoptJobs.push(renameProject(action.projectId, stem).then(() => undefined))
    }
  }
  if (adoptJobs.length > 0) {
    onProgress?.(0, Math.max(1, adoptJobs.length), 'plan: adopting sync metadata…')
  }
  const ADOPT_CHUNK = 100
  for (let i = 0; i < adoptJobs.length; i += ADOPT_CHUNK) {
    await Promise.all(adoptJobs.slice(i, i + ADOPT_CHUNK))
  }

  const failed: BytesImportFailure[] = []
  let projectsAdded = 0
  let projectsUpdated = 0
  let projectsSkipped = plan.skippedUnchanged + plan.skippedDuplicates
  let projectsRemoved = 0
  let workIndex = 0

  // Removals first — batch IndexedDB deletes; avoid per-row UI status (re-renders
  // the Database window and dominated the old ~1–2s/delete cost).
  if (cleanup && removalIds.length > 0) {
    const REMOVE_CHUNK = 40
    for (let i = 0; i < removalIds.length; i += REMOVE_CHUNK) {
      const chunk = removalIds.slice(i, i + REMOVE_CHUNK)
      onProgress?.(
        workIndex,
        workTotal,
        `remove duplicates ${Math.min(i + chunk.length, removalIds.length)}/${removalIds.length}`,
      )
      await deleteProjects(chunk)
      projectsRemoved += chunk.length
      workIndex += chunk.length
    }
  }

  for (const action of workActions) {
    const entry = byPath.get(action.relativePath.toLowerCase())
    const name = fileNameOf(action.relativePath)
    onProgress?.(workIndex, workTotal, name)
    workIndex += 1
    if (!entry) {
      failed.push({ ok: false, fileName: name, error: 'File missing from folder scan' })
      continue
    }
    const dir = action.relativePath.includes('/')
      ? action.relativePath.slice(0, action.relativePath.lastIndexOf('/'))
      : ''
    const folderId = await ensureDir(dir)
    if (action.kind === 'add') {
      const result = await importBytesIntoLibrary(name, entry.bytes, {
        folderId,
        tags: [],
        // Prefer on-disk filename over GenBank LOCUS (often truncated to ~16 chars).
        constructName: sequenceFileStem(name),
        syncRelativePath: action.relativePath,
      })
      if (result.ok) projectsAdded += 1
      else failed.push(result)
    } else {
      const result = await importBytesReplacingProject(action.projectId, name, entry.bytes, {
        folderId,
        constructName: sequenceFileStem(name),
        syncRelativePath: action.relativePath,
      })
      if (result.ok && result.unchanged) projectsSkipped += 1
      else if (result.ok) projectsUpdated += 1
      else failed.push(result)
    }
  }

  const primerDrafts: Array<{
    folderId: string
    relativePath: string
    primers: Array<{ name: string; sequence: string; description: string }>
  }> = []
  for (const entry of primerListEntries) {
    const relative = normalizeRelativePath(entry.relativePath)
    const name = fileNameOf(relative)
    onProgress?.(workIndex, workTotal, name)
    workIndex += 1
    const text = new TextDecoder().decode(entry.bytes)
    if (!isPrimerListTabText(text)) continue
    const parsed = parsePrimerDataTsv(text, { requireTab: true })
    const dir = relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : ''
    const folderId = await ensureDir(dir)
    if (!folderId) continue
    primerDrafts.push({
      folderId,
      relativePath: relative,
      primers: parsed.map((primer) => ({
        name: primer.name,
        sequence: primer.sequence,
        description: `Imported from ${name}`,
      })),
    })
  }

  const primerSync = await syncFolderPrimerLists(primerDrafts, {
    rootFolderId,
    cleanup,
  })

  // Notification is flushed by resumeLibraryChangeNotifications() in the wrapper.
  onProgress?.(workTotal, workTotal, 'done')

  return {
    rootFolderId,
    projectsAdded,
    projectsUpdated,
    projectsSkipped,
    projectsRemoved,
    primersSaved: primerSync.primersSaved,
    primersSkipped: 0,
    primersRemoved: primerSync.primersRemoved,
    foldersCreated,
    failed,
  }
}
