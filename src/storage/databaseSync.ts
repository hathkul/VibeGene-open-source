import {
  inferProjectFileFormat,
  serializeProjectFile,
  SEQUENCE_OPEN_EXTENSIONS,
} from '../domain/fileFormats'
import { coerceSnapGeneFileNameForMolecule } from '../domain/projectSaveSemantics'
import type { MoleculeType } from '../domain/types'
import {
  DATABASE_EXPORT_MANIFEST_NAME,
  buildManifestFromExportIndex,
  encodeDatabaseExportManifest,
  type DatabaseExportFile,
  type DatabaseExportIndex,
  type DatabaseExportIndexEntry,
} from './databaseExport'

export type DatabaseSyncWriteReason = 'modified' | 'manifest'

export type DatabaseSyncWrite = DatabaseExportFile & {
  reason: DatabaseSyncWriteReason
  projectId?: string
}

export type DatabaseSyncCandidate = DatabaseExportIndexEntry & {
  reason: 'modified'
}

export type DatabaseSyncCandidatePlan = {
  candidates: DatabaseSyncCandidate[]
  skippedUnchanged: number
}

export type InboundSyncDiskFile = {
  relativePath: string
  mtimeMs: number | null
  /** SHA-256 of file bytes when available. */
  contentHash?: string | null
}

export type InboundSyncLibraryFile = {
  projectId: string
  /** Export/.dna-style path (may use construct name, not original filename). */
  relativePath: string
  /** Original Sync/import path on disk when known (preferred for matching). */
  syncRelativePath?: string | null
  /** Construct `updatedAt` — used when there is no sync watermark yet. */
  updatedAt?: string | null
  /** SHA-256 of the last synced on-disk bytes for this construct. */
  syncSourceHash?: string | null
}

export type InboundSyncAction =
  | { kind: 'add'; relativePath: string; key: string }
  | { kind: 'update'; relativePath: string; key: string; projectId: string }
  | {
      kind: 'skip'
      relativePath: string
      key: string
      reason: 'unchanged' | 'duplicate-stem'
      projectId?: string
    }

export type InboundSyncPlan = {
  actions: InboundSyncAction[]
  skippedUnchanged: number
  skippedDuplicates: number
  /** Library constructs matched to a disk file (path or content hash). */
  matchedProjectIds: string[]
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

export type FolderSyncDbFile = {
  projectId: string
  /** Current path within this mapped root. */
  relativePath: string
  fileName: string
  syncState: 'local-only' | 'synced' | 'modified' | 'conflict'
  /** SHA-256 (or another stable digest) of the current semantic SequenceRecord. */
  semanticRecordHash: string
  /** SHA-256 of the exact bytes last accepted from/written to disk. */
  baselineDiskHash?: string | null
  /** Semantic record hash captured at the same common baseline. */
  baselineSemanticRecordHash?: string | null
}

export type FolderSyncDiskFile = {
  relativePath: string
  /** SHA-256 of the exact scanned bytes. mtime is intentionally not an input. */
  contentHash: string
}

export type FolderSyncTombstone = {
  relativePath: string
  projectId?: string
  contentHash?: string
}

export type FolderSyncDirection = 'from' | 'to'

export type FolderSyncConflictReason =
  | 'ambiguous-rename'
  | 'both-changed'
  | 'database-changed-disk-missing'
  | 'database-path-collision'
  | 'disk-path-collision'
  | 'existing-conflict'
  | 'invalid-relative-path'
  | 'local-only-path-collision'
  | 'missing-baseline'
  | 'tombstone-project-collision'

export type FolderSyncAction =
  | {
      kind: 'addToDb'
      relativePath: string
      diskContentHash: string
    }
  | {
      kind: 'updateDb'
      reason: 'disk-changed' | 'disk-renamed'
      projectId: string
      relativePath: string
      previousRelativePath?: string
      diskContentHash: string
    }
  | {
      kind: 'createOnDisk'
      reason: 'local-only'
      projectId: string
      relativePath: string
    }
  | {
      kind: 'overwriteDisk'
      reason: 'database-changed'
      projectId: string
      relativePath: string
    }
  | {
      kind: 'removeFromDb'
      reason: 'disk-missing'
      projectId: string
      relativePath: string
    }
  | {
      kind: 'ignore'
      reason:
        | 'ambiguous-rename-candidate'
        | 'database-changed'
        | 'disk-changed'
        | 'disk-only'
        | 'disk-renamed'
        | 'local-only'
        | 'missing-on-disk'
        | 'tombstoned'
        | 'unchanged'
      projectId?: string
      relativePath: string
    }
  | {
      kind: 'conflict'
      reason: FolderSyncConflictReason
      /** Null only for a collision involving disk inputs with no DB project. */
      projectId: string | null
      relativePath: string
      conflictingPaths?: string[]
    }

export type FolderSyncPlanInput = {
  direction: FolderSyncDirection
  dbFiles: readonly FolderSyncDbFile[]
  diskFiles: readonly FolderSyncDiskFile[]
  tombstones: readonly FolderSyncTombstone[]
  cleanup?: boolean
}

export type FolderSyncActionKind = FolderSyncAction['kind']

export type FolderSyncPlan = {
  direction: FolderSyncDirection
  actions: FolderSyncAction[]
  counts: Record<FolderSyncActionKind, number>
}

type NormalizedDbFile = FolderSyncDbFile & {
  path: string
  pathKey: string
}

type NormalizedDiskFile = FolderSyncDiskFile & {
  path: string
  pathKey: string
}

/**
 * Normalize a path for planner output. Identity is separately case-folded, so
 * output retains the spelling/casing supplied by the DB or folder scan.
 */
export function normalizeFolderSyncRelativePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/')
    .normalize('NFC')
}

function folderSyncPathKey(path: string): string {
  return normalizeFolderSyncRelativePath(path).toLowerCase()
}

function isSafeFolderSyncRelativePath(path: string): boolean {
  const normalized = normalizeFolderSyncRelativePath(path)
  return Boolean(normalized) && !normalized.split('/').includes('..')
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const value of values) {
    const key = keyOf(value)
    const group = groups.get(key) ?? []
    group.push(value)
    groups.set(key, group)
  }
  return groups
}

/**
 * Return the preferred path when free, otherwise the lowest available
 * case-insensitive `name (N).ext` path. Input ordering never affects the result.
 */
export function chooseFolderSyncKeepBothPath(
  preferredRelativePath: string,
  occupiedRelativePaths: readonly string[],
): string {
  const preferred = normalizeFolderSyncRelativePath(preferredRelativePath)
  const occupied = new Set(occupiedRelativePaths.map(folderSyncPathKey))
  if (!occupied.has(folderSyncPathKey(preferred))) return preferred

  const slash = preferred.lastIndexOf('/')
  const directory = slash >= 0 ? preferred.slice(0, slash + 1) : ''
  const basename = slash >= 0 ? preferred.slice(slash + 1) : preferred
  const dot = basename.lastIndexOf('.')
  const hasExtension = dot > 0
  const stem = hasExtension ? basename.slice(0, dot) : basename
  const extension = hasExtension ? basename.slice(dot) : ''
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${directory}${stem} (${suffix})${extension}`
    if (!occupied.has(folderSyncPathKey(candidate))) return candidate
  }
}

function emptyFolderSyncCounts(): Record<FolderSyncActionKind, number> {
  return {
    addToDb: 0,
    updateDb: 0,
    createOnDisk: 0,
    overwriteDisk: 0,
    removeFromDb: 0,
    ignore: 0,
    conflict: 0,
  }
}

function hasCompleteFolderSyncBaseline(file: FolderSyncDbFile): boolean {
  return Boolean(file.baselineDiskHash && file.baselineSemanticRecordHash)
}

/**
 * Pure per-root three-way planner.
 *
 * Matching is case-insensitive path identity first, followed only by a unique
 * exact baseline-byte-hash rename match. No timestamp, stem, or fuzzy matching
 * participates in a decision.
 */
export function planFolderScopedSync(input: FolderSyncPlanInput): FolderSyncPlan {
  if (input.cleanup && input.direction !== 'from') {
    throw new Error('Folder cleanup is only valid for sync from source')
  }
  const cleanup = input.direction === 'from' && input.cleanup === true
  const actions: FolderSyncAction[] = []
  const handledProjects = new Set<string>()
  const handledDisk = new Set<NormalizedDiskFile>()

  const dbFiles: NormalizedDbFile[] = input.dbFiles
    .map((file) => ({
      ...file,
      path: normalizeFolderSyncRelativePath(file.relativePath),
      pathKey: folderSyncPathKey(file.relativePath),
    }))
    .sort((left, right) => compareText(left.pathKey, right.pathKey) || compareText(left.projectId, right.projectId))
  const diskFiles: NormalizedDiskFile[] = input.diskFiles
    .map((file) => ({
      ...file,
      path: normalizeFolderSyncRelativePath(file.relativePath),
      pathKey: folderSyncPathKey(file.relativePath),
    }))
    .sort((left, right) => compareText(left.pathKey, right.pathKey) || compareText(left.contentHash, right.contentHash))

  for (const file of dbFiles) {
    if (isSafeFolderSyncRelativePath(file.relativePath)) continue
    actions.push({
      kind: 'conflict',
      reason: 'invalid-relative-path',
      projectId: file.projectId,
      relativePath: file.path || file.relativePath,
    })
    handledProjects.add(file.projectId)
  }
  for (const file of diskFiles) {
    if (isSafeFolderSyncRelativePath(file.relativePath)) continue
    actions.push({
      kind: 'conflict',
      reason: 'invalid-relative-path',
      projectId: null,
      relativePath: file.path || file.relativePath,
    })
    handledDisk.add(file)
  }

  const dbByPath = groupBy(
    dbFiles.filter((file) => !handledProjects.has(file.projectId)),
    (file) => file.pathKey,
  )
  const diskByPath = groupBy(
    diskFiles.filter((file) => !handledDisk.has(file)),
    (file) => file.pathKey,
  )
  const tombstoneKeys = new Set(
    input.tombstones
      .filter((tombstone) => isSafeFolderSyncRelativePath(tombstone.relativePath))
      .map((tombstone) => folderSyncPathKey(tombstone.relativePath)),
  )

  // Tombstones are authoritative at their path. A still-present file is left
  // alone and cannot take part in path or hash matching.
  for (const disk of diskFiles) {
    if (handledDisk.has(disk) || !tombstoneKeys.has(disk.pathKey)) continue
    actions.push({ kind: 'ignore', reason: 'tombstoned', relativePath: disk.path })
    handledDisk.add(disk)
    for (const dbFile of dbByPath.get(disk.pathKey) ?? []) {
      if (handledProjects.has(dbFile.projectId)) continue
      actions.push({
        kind: 'conflict',
        reason: 'tombstone-project-collision',
        projectId: dbFile.projectId,
        relativePath: dbFile.path,
      })
      handledProjects.add(dbFile.projectId)
    }
  }

  for (const [pathKey, files] of dbByPath) {
    const remaining = files.filter((file) => !handledProjects.has(file.projectId))
    if (remaining.length <= 1) continue
    const conflictingPaths = remaining.map((file) => file.path).sort(compareText)
    for (const file of remaining) {
      actions.push({
        kind: 'conflict',
        reason: 'database-path-collision',
        projectId: file.projectId,
        relativePath: file.path,
        conflictingPaths,
      })
      handledProjects.add(file.projectId)
    }
    for (const disk of diskByPath.get(pathKey) ?? []) handledDisk.add(disk)
  }

  for (const [pathKey, files] of diskByPath) {
    const remaining = files.filter((file) => !handledDisk.has(file))
    if (remaining.length <= 1) continue
    const dbFile = (dbByPath.get(pathKey) ?? []).find(
      (file) => !handledProjects.has(file.projectId),
    )
    const conflictingPaths = remaining.map((file) => file.path).sort(compareText)
    actions.push({
      kind: 'conflict',
      reason: 'disk-path-collision',
      projectId: dbFile?.projectId ?? null,
      relativePath: dbFile?.path ?? remaining[0]!.path,
      conflictingPaths,
    })
    if (dbFile) handledProjects.add(dbFile.projectId)
    for (const disk of remaining) handledDisk.add(disk)
  }

  function evaluatePathMatch(dbFile: NormalizedDbFile, diskFile: NormalizedDiskFile): void {
    if (dbFile.syncState === 'conflict') {
      actions.push({
        kind: 'conflict',
        reason: 'existing-conflict',
        projectId: dbFile.projectId,
        relativePath: diskFile.path,
      })
      return
    }
    if (dbFile.syncState === 'local-only') {
      actions.push({
        kind: 'conflict',
        reason: 'local-only-path-collision',
        projectId: dbFile.projectId,
        relativePath: diskFile.path,
      })
      return
    }
    if (!hasCompleteFolderSyncBaseline(dbFile)) {
      actions.push({
        kind: 'conflict',
        reason: 'missing-baseline',
        projectId: dbFile.projectId,
        relativePath: diskFile.path,
      })
      return
    }

    const dbChanged = dbFile.semanticRecordHash !== dbFile.baselineSemanticRecordHash
    const diskChanged = diskFile.contentHash !== dbFile.baselineDiskHash
    if (dbChanged && diskChanged) {
      actions.push({
        kind: 'conflict',
        reason: 'both-changed',
        projectId: dbFile.projectId,
        relativePath: diskFile.path,
      })
    } else if (diskChanged) {
      actions.push({
        kind: 'updateDb',
        reason: 'disk-changed',
        projectId: dbFile.projectId,
        relativePath: diskFile.path,
        diskContentHash: diskFile.contentHash,
      })
    } else if (dbChanged) {
      actions.push({
        kind: 'overwriteDisk',
        reason: 'database-changed',
        projectId: dbFile.projectId,
        relativePath: diskFile.path,
      })
    } else {
      actions.push({
        kind: 'ignore',
        reason: 'unchanged',
        projectId: dbFile.projectId,
        relativePath: diskFile.path,
      })
    }
  }

  // Exact path identity always claims files before any hash-based rename pass.
  for (const dbFile of dbFiles) {
    if (handledProjects.has(dbFile.projectId)) continue
    const disk = (diskByPath.get(dbFile.pathKey) ?? []).find((file) => !handledDisk.has(file))
    if (!disk) continue
    evaluatePathMatch(dbFile, disk)
    handledProjects.add(dbFile.projectId)
    handledDisk.add(disk)
  }

  const renameDbByHash = groupBy(
    dbFiles.filter(
      (file) =>
        !handledProjects.has(file.projectId) &&
        file.syncState !== 'local-only' &&
        Boolean(file.baselineDiskHash),
    ),
    (file) => file.baselineDiskHash!,
  )
  const renameDiskByHash = groupBy(
    diskFiles.filter((file) => !handledDisk.has(file)),
    (file) => file.contentHash,
  )

  const renameHashes = [...renameDbByHash.keys()]
    .filter((hash) => renameDiskByHash.has(hash))
    .sort(compareText)
  for (const hash of renameHashes) {
    const dbCandidates = renameDbByHash.get(hash) ?? []
    const diskCandidates = renameDiskByHash.get(hash) ?? []
    if (dbCandidates.length === 1 && diskCandidates.length === 1) {
      const dbFile = dbCandidates[0]!
      const disk = diskCandidates[0]!
      if (dbFile.syncState === 'conflict') {
        actions.push({
          kind: 'conflict',
          reason: 'existing-conflict',
          projectId: dbFile.projectId,
          relativePath: disk.path,
        })
      } else if (!hasCompleteFolderSyncBaseline(dbFile)) {
        actions.push({
          kind: 'conflict',
          reason: 'missing-baseline',
          projectId: dbFile.projectId,
          relativePath: disk.path,
        })
      } else if (dbFile.semanticRecordHash !== dbFile.baselineSemanticRecordHash) {
        actions.push({
          kind: 'conflict',
          reason: 'both-changed',
          projectId: dbFile.projectId,
          relativePath: disk.path,
          conflictingPaths: [dbFile.path, disk.path].sort(compareText),
        })
      } else {
        actions.push({
          kind: 'updateDb',
          reason: 'disk-renamed',
          projectId: dbFile.projectId,
          relativePath: disk.path,
          previousRelativePath: dbFile.path,
          diskContentHash: disk.contentHash,
        })
      }
      handledProjects.add(dbFile.projectId)
      handledDisk.add(disk)
      continue
    }

    const conflictingPaths = [
      ...dbCandidates.map((file) => file.path),
      ...diskCandidates.map((file) => file.path),
    ].sort(compareText)
    for (const dbFile of dbCandidates) {
      actions.push({
        kind: 'conflict',
        reason: 'ambiguous-rename',
        projectId: dbFile.projectId,
        relativePath: dbFile.path,
        conflictingPaths,
      })
      handledProjects.add(dbFile.projectId)
    }
    for (const disk of diskCandidates) {
      actions.push({
        kind: 'ignore',
        reason: 'ambiguous-rename-candidate',
        relativePath: disk.path,
      })
      handledDisk.add(disk)
    }
  }

  for (const dbFile of dbFiles) {
    if (handledProjects.has(dbFile.projectId)) continue
    if (dbFile.syncState === 'local-only') {
      actions.push({
        kind: 'createOnDisk',
        reason: 'local-only',
        projectId: dbFile.projectId,
        relativePath: dbFile.path,
      })
    } else if (dbFile.syncState === 'conflict') {
      actions.push({
        kind: 'conflict',
        reason: 'existing-conflict',
        projectId: dbFile.projectId,
        relativePath: dbFile.path,
      })
    } else if (!hasCompleteFolderSyncBaseline(dbFile)) {
      actions.push({
        kind: 'conflict',
        reason: 'missing-baseline',
        projectId: dbFile.projectId,
        relativePath: dbFile.path,
      })
    } else if (dbFile.semanticRecordHash !== dbFile.baselineSemanticRecordHash) {
      actions.push({
        kind: 'conflict',
        reason: 'database-changed-disk-missing',
        projectId: dbFile.projectId,
        relativePath: dbFile.path,
      })
    } else if (cleanup) {
      actions.push({
        kind: 'removeFromDb',
        reason: 'disk-missing',
        projectId: dbFile.projectId,
        relativePath: dbFile.path,
      })
    } else {
      actions.push({
        kind: 'ignore',
        reason: 'missing-on-disk',
        projectId: dbFile.projectId,
        relativePath: dbFile.path,
      })
    }
    handledProjects.add(dbFile.projectId)
  }

  for (const disk of diskFiles) {
    if (handledDisk.has(disk)) continue
    actions.push({
      kind: 'addToDb',
      relativePath: disk.path,
      diskContentHash: disk.contentHash,
    })
    handledDisk.add(disk)
  }

  const directionalActions = actions.map((action): FolderSyncAction => {
    if (input.direction === 'from') {
      if (action.kind === 'createOnDisk') {
        return {
          kind: 'ignore',
          reason: 'local-only',
          projectId: action.projectId,
          relativePath: action.relativePath,
        }
      }
      if (action.kind === 'overwriteDisk') {
        return {
          kind: 'ignore',
          reason: 'database-changed',
          projectId: action.projectId,
          relativePath: action.relativePath,
        }
      }
      return action
    }
    if (action.kind === 'addToDb') {
      return {
        kind: 'ignore',
        reason: 'disk-only',
        relativePath: action.relativePath,
      }
    }
    if (action.kind === 'updateDb') {
      return {
        kind: 'ignore',
        reason: action.reason === 'disk-renamed' ? 'disk-renamed' : 'disk-changed',
        projectId: action.projectId,
        relativePath: action.relativePath,
      }
    }
    if (action.kind === 'removeFromDb') {
      throw new Error('Outbound folder sync cannot remove database rows')
    }
    return action
  })

  const actionOrder: Record<FolderSyncActionKind, number> = {
    conflict: 0,
    addToDb: 1,
    updateDb: 2,
    createOnDisk: 3,
    overwriteDisk: 4,
    removeFromDb: 5,
    ignore: 6,
  }
  directionalActions.sort(
    (left, right) =>
      compareText(folderSyncPathKey(left.relativePath), folderSyncPathKey(right.relativePath)) ||
      actionOrder[left.kind] - actionOrder[right.kind] ||
      compareText('projectId' in left ? (left.projectId ?? '') : '', 'projectId' in right ? (right.projectId ?? '') : ''),
  )

  const counts = emptyFolderSyncCounts()
  for (const action of directionalActions) counts[action.kind] += 1
  return { direction: input.direction, actions: directionalActions, counts }
}

/** Strip a known sequence extension for Sync to database matching. */
export function sequenceFileStem(fileName: string): string {
  const lower = fileName.toLowerCase()
  const extensions = [...SEQUENCE_OPEN_EXTENSIONS].sort((a, b) => b.length - a.length)
  for (const ext of extensions) {
    if (lower.endsWith(ext)) return fileName.slice(0, -ext.length)
  }
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/**
 * Match key for OS file ↔ library construct: relative dir + basename stem
 * (so `Gateway/pUC.gb` matches export path `Gateway/pUC.dna`).
 * When `stripExportDisambiguator` is set, trailing ` (N)` from
 * `uniqueRelativePath` export names is ignored — never use that for real
 * on-disk / syncRelativePath names, which may legitimately end in ` (2)`.
 */
export function constructSyncKey(
  relativePath: string,
  options?: { stripExportDisambiguator?: boolean },
): string {
  const normalized = normalizeRelativePath(relativePath)
  const slash = normalized.lastIndexOf('/')
  const dir = slash >= 0 ? normalized.slice(0, slash) : ''
  const name = slash >= 0 ? normalized.slice(slash + 1) : normalized
  let stem = sequenceFileStem(name)
  if (options?.stripExportDisambiguator) {
    stem = stem.replace(/ \(\d+\)$/u, '')
  }
  return (dir ? `${dir}/${stem}` : stem).toLowerCase()
}

const PREFERRED_SEQUENCE_EXTENSIONS = [
  '.dna',
  '.prot',
  '.gb',
  '.gbk',
  '.genbank',
  '.gbff',
  '.ape',
  '.fasta',
  '.fa',
  '.json',
] as const

function extensionPreference(fileName: string): number {
  const lower = fileName.toLowerCase()
  const index = PREFERRED_SEQUENCE_EXTENSIONS.findIndex((ext) => lower.endsWith(ext))
  return index >= 0 ? index : PREFERRED_SEQUENCE_EXTENSIONS.length
}

function fileNameOf(relativePath: string): string {
  const parts = normalizeRelativePath(relativePath).split('/')
  return parts[parts.length - 1] || relativePath
}

/**
 * True when mtime alone says the on-disk file is newer than the last sync.
 * Without a watermark, mtime never forces an update (byte hashes handle that).
 */
export function inboundDiskIsNewerThanLibrary(
  mtimeMs: number | null,
  lastSyncedAt: string | null,
  _libraryUpdatedAt?: string | null,
): boolean {
  void _libraryUpdatedAt
  if (mtimeMs == null || !Number.isFinite(mtimeMs)) return false
  const watermarkMs = lastSyncedAt ? Date.parse(lastSyncedAt) : Number.NaN
  if (!Number.isFinite(watermarkMs)) return false
  return mtimeMs > watermarkMs
}

/**
 * Keys used to match a library construct to an on-disk file.
 * When `syncRelativePath` is known it is authoritative — export/construct
 * names often collide after truncation and must not steal another file's key.
 */
export function libraryConstructSyncKeys(file: InboundSyncLibraryFile): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  const push = (key: string) => {
    if (seen.has(key)) return
    seen.add(key)
    keys.push(key)
  }
  if (file.syncRelativePath) {
    push(constructSyncKey(file.syncRelativePath))
    return keys
  }
  if (file.relativePath) {
    push(constructSyncKey(file.relativePath))
    push(constructSyncKey(file.relativePath, { stripExportDisambiguator: true }))
  }
  return keys
}

/**
 * Plan Sync to database construct work: add missing files, update when on-disk
 * bytes differ from the last synced hash (or mtime is newer when no hash yet),
 * skip otherwise.
 */
export function planInboundConstructSync(
  diskFiles: readonly InboundSyncDiskFile[],
  libraryFiles: readonly InboundSyncLibraryFile[],
  lastSyncedAt: string | null,
): InboundSyncPlan {
  const libraryByKey = new Map<string, InboundSyncLibraryFile>()
  for (const file of libraryFiles) {
    for (const key of libraryConstructSyncKeys(file)) {
      if (!libraryByKey.has(key)) libraryByKey.set(key, file)
    }
  }

  const bestByKey = new Map<string, InboundSyncDiskFile>()
  const variantsByKey = new Map<string, InboundSyncDiskFile[]>()
  const duplicates: InboundSyncDiskFile[] = []
  for (const file of diskFiles) {
    const key = constructSyncKey(file.relativePath)
    const variants = variantsByKey.get(key) ?? []
    variants.push(file)
    variantsByKey.set(key, variants)

    const existing = bestByKey.get(key)
    if (!existing) {
      bestByKey.set(key, file)
      continue
    }
    const preferNew =
      extensionPreference(fileNameOf(file.relativePath)) <
      extensionPreference(fileNameOf(existing.relativePath))
    if (preferNew) {
      duplicates.push(existing)
      bestByKey.set(key, file)
    } else {
      duplicates.push(file)
    }
  }

  // VibeGene Sync-to-folder used to invent truncated construct-name .dna twins
  // (e.g. pcDNA3-DN-.dna beside pcDNA3-DN-p73-alpha.gb). Prefer the longer stem.
  const preferredInDir = new Map<string, string[]>()
  for (const file of bestByKey.values()) {
    const normalized = normalizeRelativePath(file.relativePath)
    const slash = normalized.lastIndexOf('/')
    const dir = (slash >= 0 ? normalized.slice(0, slash) : '').toLowerCase()
    const stem = sequenceFileStem(fileNameOf(normalized)).toLowerCase()
    const list = preferredInDir.get(dir) ?? []
    list.push(stem)
    preferredInDir.set(dir, list)
  }
  for (const [key, file] of [...bestByKey.entries()]) {
    const normalized = normalizeRelativePath(file.relativePath)
    const slash = normalized.lastIndexOf('/')
    const dir = (slash >= 0 ? normalized.slice(0, slash) : '').toLowerCase()
    const stem = sequenceFileStem(fileNameOf(normalized)).toLowerCase()
    const looksTruncated = /[-_]$/u.test(stem) || stem.length <= 10
    if (!looksTruncated || stem.length < 6) continue
    const longer = (preferredInDir.get(dir) ?? []).some(
      (other) => other !== stem && other.startsWith(stem) && other.length >= stem.length + 3,
    )
    if (!longer) continue
    duplicates.push(file)
    bestByKey.delete(key)
  }

  const hashesByKey = new Map<string, Set<string>>()
  for (const [key, variants] of variantsByKey) {
    const hashes = new Set<string>()
    for (const variant of variants) {
      if (variant.contentHash) hashes.add(variant.contentHash)
    }
    if (hashes.size > 0) hashesByKey.set(key, hashes)
  }

  const actions: InboundSyncAction[] = []
  let skippedUnchanged = 0
  let skippedDuplicates = 0
  const claimedProjectIds = new Set<string>()

  for (const file of duplicates) {
    skippedDuplicates += 1
    actions.push({
      kind: 'skip',
      relativePath: normalizeRelativePath(file.relativePath),
      key: constructSyncKey(file.relativePath),
      reason: 'duplicate-stem',
    })
  }

  for (const [key, file] of bestByKey) {
    const relativePath = normalizeRelativePath(file.relativePath)
    let library = libraryByKey.get(key) ?? null
    if (library && claimedProjectIds.has(library.projectId)) library = null
    if (!library) {
      actions.push({ kind: 'add', relativePath, key })
      continue
    }
    claimedProjectIds.add(library.projectId)

    const libraryHash = library.syncSourceHash ?? null
    const keyHashes = hashesByKey.get(key)
    // Prefer .dna over .gb, but a library hash from either encoding means unchanged.
    if (libraryHash && keyHashes?.has(libraryHash)) {
      skippedUnchanged += 1
      actions.push({ kind: 'skip', relativePath, key, reason: 'unchanged', projectId: library.projectId })
      continue
    }
    // Hash disagrees: only re-parse when the file is newer than the last sync.
    // Stale/wrong stored hashes are common after .gb↔.dna preference flips —
    // adopt the on-disk hash on skip instead of re-importing thousands of files.
    if (libraryHash && keyHashes && keyHashes.size > 0 && !keyHashes.has(libraryHash)) {
      if (inboundDiskIsNewerThanLibrary(file.mtimeMs, lastSyncedAt)) {
        actions.push({ kind: 'update', relativePath, key, projectId: library.projectId })
        continue
      }
      skippedUnchanged += 1
      actions.push({ kind: 'skip', relativePath, key, reason: 'unchanged', projectId: library.projectId })
      continue
    }
    // No stored hash yet (or disk hash unavailable): keep the construct, adopt hash later.
    skippedUnchanged += 1
    actions.push({ kind: 'skip', relativePath, key, reason: 'unchanged', projectId: library.projectId })
  }

  // Path keys often disagree when the construct was named from GenBank LOCUS but
  // the file stem differs. Rematch remaining disk files by content hash (any
  // same-stem encoding: .gb / .dna / …).
  const libraryByHash = new Map<string, InboundSyncLibraryFile>()
  for (const file of libraryFiles) {
    const hash = file.syncSourceHash
    if (!hash || claimedProjectIds.has(file.projectId)) continue
    if (!libraryByHash.has(hash)) libraryByHash.set(hash, file)
  }
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]!
    if (action.kind !== 'add') continue
    const variants = variantsByKey.get(action.key) ?? []
    let library: InboundSyncLibraryFile | null = null
    for (const variant of variants) {
      const hash = variant.contentHash
      if (!hash) continue
      const match = libraryByHash.get(hash)
      if (!match || claimedProjectIds.has(match.projectId)) continue
      library = match
      break
    }
    if (!library) continue
    claimedProjectIds.add(library.projectId)
    libraryByHash.delete(library.syncSourceHash!)
    skippedUnchanged += 1
    actions[index] = {
      kind: 'skip',
      relativePath: action.relativePath,
      key: action.key,
      reason: 'unchanged',
      projectId: library.projectId,
    }
  }

  // Same-folder stem rematch: export/construct names are often truncated GenBank
  // LOCUS labels (e.g. disk pET-TEV-Sesn2.gb vs library pET-TEV-Se.dna).
  const unmatchedLibrary = libraryFiles.filter((file) => !claimedProjectIds.has(file.projectId))
  const libraryByDir = new Map<string, InboundSyncLibraryFile[]>()
  for (const file of unmatchedLibrary) {
    const pathForDir = file.syncRelativePath || file.relativePath
    const normalized = normalizeRelativePath(pathForDir)
    const slash = normalized.lastIndexOf('/')
    const dir = (slash >= 0 ? normalized.slice(0, slash) : '').toLowerCase()
    const list = libraryByDir.get(dir) ?? []
    list.push(file)
    libraryByDir.set(dir, list)
  }

  function stemForMatch(relativePath: string): string {
    const normalized = normalizeRelativePath(relativePath)
    const name = normalized.includes('/') ? normalized.slice(normalized.lastIndexOf('/') + 1) : normalized
    return sequenceFileStem(name).replace(/_/g, ' ').trim().toLowerCase()
  }

  function stemsCompatible(diskStem: string, libStem: string): boolean {
    if (!diskStem || !libStem) return false
    if (diskStem === libStem) return true
    // Real on-disk "Name (2)" files must not fuzzy-match "Name".
    if (/\(\d+\)$/u.test(diskStem) || /\(\d+\)$/u.test(libStem)) return false
    // GenBank LOCUS truncation / shortened construct names.
    if (libStem.length >= 8 && diskStem.startsWith(libStem)) return true
    if (diskStem.length >= 8 && libStem.startsWith(diskStem)) return true
    return false
  }

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]!
    if (action.kind !== 'add') continue
    const slash = action.relativePath.lastIndexOf('/')
    const dir = (slash >= 0 ? action.relativePath.slice(0, slash) : '').toLowerCase()
    const diskStem = stemForMatch(action.relativePath)
    const candidates = (libraryByDir.get(dir) ?? []).filter((file) => !claimedProjectIds.has(file.projectId))
    const scored = candidates
      .map((file) => {
        const libStem = stemForMatch(file.syncRelativePath || file.relativePath)
        const exportStem = stemForMatch(file.relativePath)
        const ok = stemsCompatible(diskStem, libStem) || stemsCompatible(diskStem, exportStem)
        const bestLib = stemsCompatible(diskStem, libStem) ? libStem : exportStem
        const score = !ok
          ? -1
          : diskStem === bestLib
            ? 3000 + bestLib.length
            : 1000 + Math.min(diskStem.length, bestLib.length)
        return { file, score }
      })
      .filter((row) => row.score >= 0)
      .sort((a, b) => b.score - a.score)

    if (scored.length === 0) continue
    // Require a unique best score so we don't glue the wrong plasmids together.
    if (scored.length > 1 && scored[0]!.score === scored[1]!.score) continue
    const library = scored[0]!.file
    claimedProjectIds.add(library.projectId)
    skippedUnchanged += 1
    actions[index] = {
      kind: 'skip',
      relativePath: action.relativePath,
      key: action.key,
      reason: 'unchanged',
      projectId: library.projectId,
    }
  }

  return {
    actions,
    skippedUnchanged,
    skippedDuplicates,
    matchedProjectIds: [...claimedProjectIds],
  }
}

/**
 * Project ids in the library that have no matching sequence file on disk.
 * When `matchedProjectIds` is provided (from {@link planInboundConstructSync}),
 * those ids are kept even if path keys disagree (hash rematch).
 */
export function planInboundCleanupRemovals(
  diskFiles: readonly InboundSyncDiskFile[],
  libraryFiles: readonly InboundSyncLibraryFile[],
  matchedProjectIds?: readonly string[],
): string[] {
  const bestByKey = new Map<string, InboundSyncDiskFile>()
  for (const file of diskFiles) {
    const key = constructSyncKey(file.relativePath)
    const existing = bestByKey.get(key)
    if (!existing) {
      bestByKey.set(key, file)
      continue
    }
    const preferNew =
      extensionPreference(fileNameOf(file.relativePath)) <
      extensionPreference(fileNameOf(existing.relativePath))
    if (preferNew) bestByKey.set(key, file)
  }

  const diskKeys = new Set(bestByKey.keys())
  const matched = new Set(matchedProjectIds ?? [])
  const removals: string[] = []
  const seen = new Set<string>()

  for (const file of libraryFiles) {
    if (seen.has(file.projectId)) continue
    seen.add(file.projectId)
    if (matched.has(file.projectId)) continue
    const pathMatched = libraryConstructSyncKeys(file).some((key) => diskKeys.has(key))
    if (pathMatched) continue
    removals.push(file.projectId)
  }

  // Keep one library row per identical syncRelativePath (re-import bloat).
  // Do not collapse distinct on-disk names that only share a stripped export key.
  const bySyncPath = new Map<string, InboundSyncLibraryFile[]>()
  const seenForDup = new Set<string>()
  for (const file of libraryFiles) {
    if (seenForDup.has(file.projectId)) continue
    seenForDup.add(file.projectId)
    const syncPath = file.syncRelativePath ? normalizeRelativePath(file.syncRelativePath).toLowerCase() : ''
    if (!syncPath) continue
    const group = bySyncPath.get(syncPath) ?? []
    group.push(file)
    bySyncPath.set(syncPath, group)
  }
  for (const group of bySyncPath.values()) {
    if (group.length <= 1) continue
    const keeper = group.find((file) => matched.has(file.projectId)) ?? group[0]!
    for (const file of group) {
      if (file.projectId !== keeper.projectId && !removals.includes(file.projectId)) {
        removals.push(file.projectId)
      }
    }
  }
  return removals
}

/**
 * On-disk path for Sync database → folder.
 * Prefer the original import/sync source path so we overwrite `foo.gb` in place
 * instead of inventing a truncated construct-name `foo.dna` beside it.
 */
export function outboundSyncRelativePath(project: {
  relativePath: string
  syncRelativePath?: string | null
  molecule?: MoleculeType | null
}): string {
  const preferred = project.syncRelativePath?.trim() || project.relativePath
  return normalizeRelativePath(
    coerceSnapGeneFileNameForMolecule(preferred, project.molecule ?? undefined),
  )
}

/**
 * Pick an existing on-disk file to overwrite for Sync to folder.
 * Never invents a new basename — missing targets are skipped so we do not
 * recreate truncated construct-name `.dna` twins after cleanup.
 */
export function resolveExistingOutboundPath(
  preferredPath: string,
  existingNamesInDir: readonly string[],
): string | null {
  const preferred = normalizeRelativePath(preferredPath)
  const slash = preferred.lastIndexOf('/')
  const dir = slash >= 0 ? preferred.slice(0, slash) : ''
  const name = slash >= 0 ? preferred.slice(slash + 1) : preferred
  const stem = sequenceFileStem(name)
  const stemLower = stem.toLowerCase()
  const existing = existingNamesInDir.map((entry) => ({
    name: entry,
    stem: sequenceFileStem(entry),
    lower: entry.toLowerCase(),
  }))

  if (existing.some((entry) => entry.lower === name.toLowerCase())) {
    return preferred
  }

  const sameStem = existing.find((entry) => entry.stem.toLowerCase() === stemLower)
  if (sameStem) {
    return dir ? `${dir}/${sameStem.name}` : sameStem.name
  }

  // Truncated construct names (pcDNA3-DN-.dna) → longer original (pcDNA3-DN-p73-alpha.gb)
  const looksTruncated = /[-_]$/u.test(stem) || stem.length <= 12
  if (looksTruncated && stem.length >= 6) {
    const longer = existing
      .filter(
        (entry) =>
          entry.stem.toLowerCase().startsWith(stemLower) && entry.stem.length >= stem.length + 3,
      )
      .sort((a, b) => a.stem.length - b.stem.length)
    if (longer.length === 1) {
      return dir ? `${dir}/${longer[0]!.name}` : longer[0]!.name
    }
  }

  return null
}

/**
 * Encode a construct for writing back to a sync-folder path.
 * Extension selects format so `.gb` stays GenBank and `.dna` stays SnapGene.
 */
export function encodeRecordForSyncRelativePath(
  relativePath: string,
  record: import('../domain/types').SequenceRecord,
): Uint8Array {
  const format = inferProjectFileFormat(fileNameOf(relativePath))
  const serialized = serializeProjectFile(format, record)
  if (!serialized.ok) {
    throw new Error(
      `Cannot write ${relativePath}: ${serialized.error}`,
    )
  }
  return serialized.bytes
}

/**
 * Decide which constructs need exporting for Sync to folder.
 *
 * Only constructs with `updatedAt` newer than the last successful sync are
 * written. Unchanged constructs are skipped even if a `.dna` export is missing
 * on disk (Import folder leaves original filenames/formats in place).
 *
 * When `lastSyncedAt` is null (never synced), every construct is a candidate.
 */
export function planDatabaseSyncCandidates(
  projects: readonly DatabaseExportIndexEntry[],
  lastSyncedAt: string | null,
): DatabaseSyncCandidatePlan {
  const candidates: DatabaseSyncCandidate[] = []
  let skippedUnchanged = 0

  for (const project of projects) {
    const relativePath = outboundSyncRelativePath(project)
    const entry = { ...project, relativePath }
    if (!lastSyncedAt || !project.updatedAt || project.updatedAt > lastSyncedAt) {
      candidates.push({ ...entry, reason: 'modified' })
      continue
    }
    skippedUnchanged += 1
  }

  return { candidates, skippedUnchanged }
}

export function buildDatabaseSyncManifestWrite(index: DatabaseExportIndex): DatabaseSyncWrite {
  return {
    relativePath: DATABASE_EXPORT_MANIFEST_NAME,
    bytes: encodeDatabaseExportManifest(buildManifestFromExportIndex(index)),
    reason: 'manifest',
  }
}
