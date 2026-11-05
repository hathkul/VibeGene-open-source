import type { MwLadder } from '../domain/mwLadders'
import { coerceSnapGeneFileNameForMolecule } from '../domain/projectSaveSemantics'
import type { MoleculeType, Topology } from '../domain/types'
import { listFolders, resolveFolderSyncMapping, type StoredFolder } from './projectLibrary'
import {
  getProject,
  getProjectFileBaseline,
  getProjectFileBlob,
  listProjectSummaries,
  type ProjectFileFormat,
  type StoredProjectSummary,
} from './projects'
import { hashConstructSemanticRecord } from './databaseImport'
import { normalizeFolderSyncRelativePath } from './databaseSync'

export const DATABASE_EXPORT_FORMAT = 'vibegene-database-export'
export const DATABASE_EXPORT_VERSION = 2
export const DATABASE_EXPORT_MANIFEST_NAME = 'vibegene-database.json'

export type DatabaseExportFolder = {
  id: string
  name: string
  parentId: string | null
}

export type DatabaseExportProject = {
  id: string
  name: string
  /** Original construct name (may differ from file base name after sanitization). */
  constructName: string
  folderId: string | null
  tags: string[]
  topology: Topology
  sequenceLength: number
  /** Path relative to the export root, using `/` separators. */
  relativePath: string
  /** Retained source basename; never an absolute path. */
  fileName?: string
  fileFormat?: ProjectFileFormat
  contentHash?: string
  semanticRecordHash?: string
  customMwLadders?: MwLadder[]
}

export type DatabaseExportManifest = {
  format: typeof DATABASE_EXPORT_FORMAT
  version: typeof DATABASE_EXPORT_VERSION
  exportedAt: string
  folders: DatabaseExportFolder[]
  projects: DatabaseExportProject[]
}

export type DatabaseExportFile = {
  relativePath: string
  bytes: Uint8Array
  /** Construct `updatedAt` used by Sync to folder to skip unchanged files. */
  updatedAt?: string
}

export type DatabaseExportBundle = {
  manifest: DatabaseExportManifest
  files: DatabaseExportFile[]
}

export function retainedExactBytesForExport(
  _project: Pick<StoredProjectSummary, 'fileSyncState' | 'updatedAt'>,
  blob: Awaited<ReturnType<typeof getProjectFileBlob>>,
  baseline: Awaited<ReturnType<typeof getProjectFileBaseline>>,
  semanticRecordHash: string,
): Uint8Array | null {
  if (!blob) return null
  const isCurrent =
    baseline?.semanticRecordHash === semanticRecordHash &&
    blob.contentHash === baseline.contentHash
  return isCurrent ? new Uint8Array(blob.bytes) : null
}

const INVALID_PATH_CHARS = /[<>:"/\\|?*]/g

export function sanitizePathSegment(raw: string, fallback = 'Untitled'): string {
  const safe = [...raw]
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('')
  const trimmed = safe.trim().replace(INVALID_PATH_CHARS, '_').replace(/\s+/g, ' ').replace(/^\.+/, '')
  const cleaned = trimmed.replace(/[. ]+$/g, '')
  return cleaned || fallback
}

function folderRelativeDir(
  folders: Array<Pick<StoredFolder, 'id' | 'name' | 'parentId'>>,
  folderId: string | null | undefined,
): string {
  if (!folderId) return ''
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const parts: string[] = []
  let cursor: string | null | undefined = folderId
  const guard = new Set<string>()
  while (cursor && !guard.has(cursor)) {
    guard.add(cursor)
    const folder = byId.get(cursor)
    if (!folder) break
    parts.unshift(sanitizePathSegment(folder.name, 'Folder'))
    cursor = folder.parentId
  }
  return parts.join('/')
}

/** Folder path relative to an optional sync/export root folder (root itself → ""). */
export function folderPathRelativeToRoot(
  folders: Array<Pick<StoredFolder, 'id' | 'name' | 'parentId'>>,
  folderId: string | null | undefined,
  rootFolderId?: string | null,
): string {
  if (!folderId) return ''
  if (rootFolderId && folderId === rootFolderId) return ''
  const full = folderRelativeDir(folders, folderId)
  if (!rootFolderId) return full
  const rootPath = folderRelativeDir(folders, rootFolderId)
  if (!rootPath) return full
  if (full === rootPath) return ''
  const prefix = `${rootPath}/`
  if (full.toLowerCase().startsWith(prefix.toLowerCase())) {
    return full.slice(rootPath.length + 1)
  }
  return full
}

export function collectFolderSubtreeIds(
  folders: Array<Pick<StoredFolder, 'id' | 'parentId'>>,
  rootFolderId: string,
): Set<string> {
  const ids = new Set<string>([rootFolderId])
  let grew = true
  while (grew) {
    grew = false
    for (const folder of folders) {
      if (ids.has(folder.id)) continue
      if (folder.parentId && ids.has(folder.parentId)) {
        ids.add(folder.id)
        grew = true
      }
    }
  }
  return ids
}

/** Match an OS folder basename to a unique top-level DB folder (Import folder ↔ Sync). */
export function matchTopLevelFolderByName(
  folders: Array<Pick<StoredFolder, 'id' | 'name' | 'parentId'>>,
  folderName: string,
): string | null {
  const needle = sanitizePathSegment(folderName, '').toLowerCase()
  if (!needle) return null
  const matches = folders.filter(
    (folder) =>
      (folder.parentId ?? null) === null &&
      sanitizePathSegment(folder.name, 'Folder').toLowerCase() === needle,
  )
  return matches.length === 1 ? matches[0]!.id : null
}

export function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

function uniqueRelativePath(preferred: string, used: Set<string>): string {
  if (!used.has(preferred.toLowerCase())) {
    used.add(preferred.toLowerCase())
    return preferred
  }
  const dot = preferred.lastIndexOf('.')
  const stem = dot > 0 ? preferred.slice(0, dot) : preferred
  const ext = dot > 0 ? preferred.slice(dot) : ''
  let index = 2
  while (true) {
    const candidate = `${stem} (${index})${ext}`
    if (!used.has(candidate.toLowerCase())) {
      used.add(candidate.toLowerCase())
      return candidate
    }
    index += 1
  }
}

function dnaFileName(summary: StoredProjectSummary): string {
  const base = sanitizePathSegment(
    summary.name.replace(/\.(dna|prot|gb|gbk|genbank|fasta|fa|json)$/i, ''),
    'Untitled',
  )
  const extension = summary.molecule === 'protein' ? 'prot' : 'dna'
  return `${base}.${extension}`
}

/**
 * File basename for Export database / Sync index.
 * Prefer the original Sync source filename (e.g. `pcDNA3-DN-p73-alpha.gb`) over the
 * construct/LOCUS name, which GenBank often truncates to ~16 characters.
 */
export function exportFileNameForSummary(summary: StoredProjectSummary): string {
  const storedFileName = summary.fileName?.trim() || summary.syncRelativePath?.trim()
  if (storedFileName) {
    const normalized = storedFileName.replace(/\\/g, '/')
    const raw = normalized.includes('/')
      ? normalized.slice(normalized.lastIndexOf('/') + 1)
      : normalized
    const extMatch = raw.match(/(\.[A-Za-z0-9]+)$/u)
    const ext = (extMatch?.[1] || '.dna').toLowerCase()
    const stemRaw = extMatch ? raw.slice(0, -extMatch[1]!.length) : raw
    const stem = sanitizePathSegment(stemRaw, 'Untitled')
    return coerceSnapGeneFileNameForMolecule(`${stem}${ext}`, summary.molecule)
  }
  return dnaFileName(summary)
}

export type BuildDatabaseExportOptions = {
  /**
   * When set, only export this DB folder's subtree and write paths relative to it
   * (so syncing into the imported OS folder does not nest `Name/Name/...`).
   */
  rootFolderId?: string | null
}

export type DatabaseExportIndexEntry = {
  projectId: string
  name: string
  constructName: string
  folderId: string | null
  tags: string[]
  topology: Topology
  sequenceLength: number
  /** dna | protein — drives SnapGene .dna vs .prot export/sync names. */
  molecule: MoleculeType
  relativePath: string
  updatedAt: string
  /** SHA-256 of last synced on-disk bytes, when known. */
  syncSourceHash?: string
  /** Original Sync/import relative path on disk, when known. */
  syncRelativePath?: string
  customMwLadders?: MwLadder[]
}

export type DatabaseExportIndex = {
  rootFolderId: string | null
  folders: DatabaseExportFolder[]
  projects: DatabaseExportIndexEntry[]
}

/** List export paths/metadata without loading sequence bodies (fast sync planning). */
export async function listDatabaseExportIndex(
  options?: BuildDatabaseExportOptions,
): Promise<DatabaseExportIndex> {
  const rootFolderId = options?.rootFolderId ?? null
  const [folders, summaries] = await Promise.all([listFolders(), listProjectSummaries()])
  const subtreeIds = rootFolderId ? collectFolderSubtreeIds(folders, rootFolderId) : null
  const usedPaths = new Set<string>()

  const scopedSummaries = subtreeIds
    ? summaries.filter((summary) => {
        const folderId = summary.folderId ?? null
        return folderId != null && subtreeIds.has(folderId)
      })
    : summaries

  const projects: DatabaseExportIndexEntry[] = []
  for (const summary of scopedSummaries) {
    const dir = folderPathRelativeToRoot(folders, summary.folderId, rootFolderId)
    const fileName = exportFileNameForSummary(summary)
    const relativePath = uniqueRelativePath(dir ? `${dir}/${fileName}` : fileName, usedPaths)
    const exportFolderId =
      rootFolderId && summary.folderId === rootFolderId ? null : (summary.folderId ?? null)
    projects.push({
      projectId: summary.id,
      name: summary.name,
      constructName: summary.name,
      folderId: exportFolderId,
      tags: summary.tags ?? [],
      topology: summary.topology,
      sequenceLength: summary.sequenceLength,
      molecule: summary.molecule ?? 'dna',
      relativePath,
      updatedAt: summary.updatedAt,
      ...(summary.syncSourceHash ? { syncSourceHash: summary.syncSourceHash } : {}),
      ...(summary.syncRelativePath
        ? {
            syncRelativePath: coerceSnapGeneFileNameForMolecule(
              summary.syncRelativePath,
              summary.molecule,
            ),
          }
        : {}),
      ...(summary.customMwLadders?.length ? { customMwLadders: summary.customMwLadders } : {}),
    })
  }

  const manifestFolders = (subtreeIds
    ? folders.filter((folder) => subtreeIds.has(folder.id) && folder.id !== rootFolderId)
    : folders
  ).map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId:
      rootFolderId && folder.parentId === rootFolderId ? null : (folder.parentId ?? null),
  }))

  return { rootFolderId, folders: manifestFolders, projects }
}

export function buildManifestFromExportIndex(index: DatabaseExportIndex): DatabaseExportManifest {
  return {
    format: DATABASE_EXPORT_FORMAT,
    version: DATABASE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    folders: index.folders,
    projects: index.projects.map((project) => ({
      id: project.projectId,
      name: project.name,
      constructName: project.constructName,
      folderId: project.folderId,
      tags: project.tags,
      topology: project.topology,
      sequenceLength: project.sequenceLength,
      relativePath: project.relativePath,
      ...(project.customMwLadders?.length ? { customMwLadders: project.customMwLadders } : {}),
    })),
  }
}

/** Build folder tree of sequence files + a reimportable manifest (loads bodies one at a time). */
export async function buildDatabaseExportBundle(
  onProgress?: (done: number, total: number, name: string) => void,
  options?: BuildDatabaseExportOptions,
): Promise<DatabaseExportBundle> {
  const { encodeRecordForSyncRelativePath } = await import('./databaseSync')
  const index = await listDatabaseExportIndex(options)
  const files: DatabaseExportFile[] = []
  const projects: DatabaseExportProject[] = []

  for (let indexNo = 0; indexNo < index.projects.length; indexNo += 1) {
    const entry = index.projects[indexNo]!
    onProgress?.(indexNo, index.projects.length, entry.name)
    const project = await getProject(entry.projectId)
    if (!project) continue

    const [blob, baseline, semanticRecordHash] = await Promise.all([
      getProjectFileBlob(project.id),
      getProjectFileBaseline(project.id),
      hashConstructSemanticRecord(project.record),
    ])
    const retainedBytes = retainedExactBytesForExport(
      project,
      blob,
      baseline,
      semanticRecordHash,
    )
    const bytes = retainedBytes
      ? retainedBytes
      : encodeRecordForSyncRelativePath(entry.relativePath, project.record)
    files.push({
      relativePath: entry.relativePath,
      bytes,
      updatedAt: project.updatedAt || entry.updatedAt,
    })
    projects.push({
      id: project.id,
      name: project.name,
      constructName: project.record.name,
      folderId: entry.folderId,
      tags: project.tags ?? [],
      topology: project.topology,
      sequenceLength: project.sequenceLength,
      relativePath: entry.relativePath,
      ...(project.fileName ? { fileName: project.fileName } : {}),
      ...(project.fileFormat ? { fileFormat: project.fileFormat } : {}),
      ...(retainedBytes && blob?.contentHash
        ? { contentHash: blob.contentHash }
        : {}),
      semanticRecordHash,
      ...(project.customMwLadders?.length ? { customMwLadders: project.customMwLadders } : {}),
    })
  }
  onProgress?.(index.projects.length, index.projects.length, 'manifest')

  return {
    manifest: {
      ...buildManifestFromExportIndex(index),
      projects,
    },
    files,
  }
}

export function encodeDatabaseExportManifest(manifest: DatabaseExportManifest): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`)
}

function joinMappedFolderPath(root: string, relativePath: string): string {
  const normalized = normalizeFolderSyncRelativePath(relativePath)
  if (!normalized || normalized.split('/').includes('..')) {
    throw new Error('Unsafe folder sync relative path')
  }
  const separator = root.includes('\\') ? '\\' : '/'
  return [
    root.replace(/[/\\]+$/, ''),
    ...normalized.split('/').filter(Boolean),
  ].join(separator)
}

function parentRelativeDir(relativePath: string): string {
  const normalized = normalizeFolderSyncRelativePath(relativePath).replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  return slash >= 0 ? normalized.slice(0, slash) : ''
}

/**
 * When a database construct lives under a mapped sync folder, suggest the on-disk
 * directory that mirrors its database/sync path for native Save / Save as dialogs.
 */
export async function resolveMappedFolderDefaultSavePath(input: {
  projectId: string
  fileName: string
}): Promise<string | null> {
  const project = await getProject(input.projectId)
  if (!project?.folderId) return null

  const resolved = await resolveFolderSyncMapping(project.folderId)
  if (!resolved) return null

  const folders = await listFolders()

  const directory = folderPathRelativeToRoot(folders, project.folderId, resolved.rootFolder.id)
  const relativePath = directory
    ? `${directory}/${project.fileName ?? input.fileName}`
    : (project.fileName ?? input.fileName)
  if (!relativePath) return null

  const parent = parentRelativeDir(relativePath)
  const targetRelative = parent ? `${parent}/${input.fileName}` : input.fileName

  try {
    return joinMappedFolderPath(resolved.mapping.externalPath, targetRelative)
  } catch {
    return null
  }
}
