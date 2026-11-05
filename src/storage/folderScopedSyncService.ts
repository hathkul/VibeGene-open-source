import {
  normalizeFolderSyncRelativePath,
  planFolderScopedSync,
  type FolderSyncAction,
  type FolderSyncDbFile,
  type FolderSyncDirection,
  type FolderSyncDiskFile,
  type FolderSyncPlan,
  type FolderSyncTombstone,
} from './databaseSync'
import { hashSyncSourceBytes } from './syncSourceHash'
import {
  pauseLibraryChangeNotifications,
  resumeLibraryChangeNotifications,
} from './libraryEvents'
import type { SequenceRecord } from '../domain/types'
import type { ProjectFileFormat } from '../domain/fileFormats'

export type FolderScopedSyncScannedFile = FolderSyncDiskFile & {
  bytes: Uint8Array
}

export type FolderScopedSyncFolderScan = {
  diskFiles: FolderScopedSyncScannedFile[]
  primerListFiles: FolderScopedSyncScannedFile[]
}

export type FolderScopedSyncTombstone = FolderSyncTombstone & {
  reason?: 'database-delete' | 'path-change' | 'disk-delete'
}

export type FolderScopedSyncDatabaseFile = FolderSyncDbFile & {
  /** Full semantic record collected for this root-scoped preflight. */
  record?: SequenceRecord
  /** Exact retained source/last-written bytes, when available. */
  exactBytes?: Uint8Array
  fileFormat?: ProjectFileFormat
}

export type FolderScopedSyncScope = {
  folderId: string
  externalPath: string
  dbFiles: FolderScopedSyncDatabaseFile[]
  tombstones: FolderScopedSyncTombstone[]
}

export type FolderScopedMirrorResult = {
  unchanged: number
  importedFromDisk: number
  writtenToDisk: number
  diskDeleted: number
  conflictCopies: number
  skipped: number
  failures: FolderScopedSyncApplyFailure[]
}

export type FolderScopedSyncConflict = Extract<FolderSyncAction, { kind: 'conflict' }> & {
  id: string
}

export type FolderScopedSyncPreflight = {
  folderId: string
  externalPath: string
  direction: FolderSyncDirection
  cleanup: boolean
  dbFiles: FolderScopedSyncDatabaseFile[]
  diskFiles: FolderScopedSyncScannedFile[]
  primerListFiles: FolderScopedSyncScannedFile[]
  tombstones: FolderSyncTombstone[]
  plan: FolderSyncPlan
  conflicts: FolderScopedSyncConflict[]
}

export type FolderScopedSyncConflictChoice = 'database' | 'filesystem'

export type FolderScopedSyncConflictResolution = {
  conflictId: string
  choice: FolderScopedSyncConflictChoice
}

export type FolderScopedSyncApplyOptions = {
  resolutions?: readonly FolderScopedSyncConflictResolution[]
  onProgress?: (done: number, total: number, name: string) => void
}

export type FolderScopedSyncApplyFailure = {
  relativePath: string
  error: string
  action?: FolderSyncAction
}

export type FolderScopedSyncApplyResult = {
  applied: number
  addedToDb: number
  updatedInDb: number
  writtenToDisk: number
  removedFromDb: number
  ignored: number
  primersSaved: number
  primersRemoved: number
  primerListsSaved: number
  primerListsRemoved: number
  unresolvedConflicts: FolderScopedSyncConflict[]
  failures: FolderScopedSyncApplyFailure[]
}

export type FolderScopedSyncDatabaseWrite = {
  projectId: string
  relativePath: string
  bytes: Uint8Array
  semanticRecordHash: string
  sourceUpdatedAt?: string
  sourceContentKey?: string
}

export type FolderScopedSyncDependencies = {
  loadScope(folderId: string, direction?: FolderSyncDirection, externalPath?: string): Promise<FolderScopedSyncScope>
  scanFolder(externalPath: string): Promise<FolderScopedSyncFolderScan>
  readFile(externalPath: string, relativePath: string): Promise<Uint8Array>
  /**
   * Must create parent directories, write safely, verify the resulting bytes,
   * and return their hash. It must never delete a user filesystem file.
   */
  writeFile(
    externalPath: string,
    relativePath: string,
    bytes: Uint8Array,
  ): Promise<{ contentHash: string }>
  addToDb(folderId: string, file: FolderScopedSyncScannedFile): Promise<string>
  updateDb(projectId: string, folderId: string, file: FolderScopedSyncScannedFile): Promise<void>
  getDatabaseWrite(projectId: string, relativePath: string): Promise<FolderScopedSyncDatabaseWrite>
  acceptDatabaseWrite(
    write: FolderScopedSyncDatabaseWrite,
    contentHash: string,
    rootFolderId: string,
  ): Promise<void>
  removeFromDb(projectId: string): Promise<void>
  syncPrimerLists(
    folderId: string,
    files: readonly FolderScopedSyncScannedFile[],
    options: { cleanup: boolean },
  ): Promise<{
    listsSaved: number
    primersSaved: number
    listsRemoved: number
    primersRemoved: number
  }>
  markSynced(folderId: string, syncedAt: string): Promise<void>
  /** Duplicate the current Database version as a separately linked record. */
  createConflictCopy?(input: {
    projectId: string
    folderId: string
    relativePath: string
    bytes: Uint8Array
    contentHash: string
    semanticRecordHash: string
  }): Promise<FolderScopedSyncDatabaseWrite>
  removeConflictCopy?(projectId: string): Promise<void>
  /** Record a disk deletion without deleting the Database record. */
  recordDiskDeletion?(input: {
    projectId: string
    folderId: string
    relativePath: string
    contentHash: string
  }): Promise<void>
  clearDiskDeletion?(projectId: string, folderId: string, relativePath: string): Promise<void>
  now?: () => Date
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function folderScopedSyncConflictId(
  conflict: Pick<
    Extract<FolderSyncAction, { kind: 'conflict' }>,
    'projectId' | 'relativePath' | 'reason'
  >,
): string {
  return [
    conflict.projectId ?? 'disk',
    normalizeFolderSyncRelativePath(conflict.relativePath).toLowerCase(),
    conflict.reason,
  ].join('\0')
}

function isScannedFileSupported(file: FolderScopedSyncScannedFile): boolean {
  return Boolean(
    normalizeFolderSyncRelativePath(file.relativePath) &&
      file.contentHash &&
      file.bytes instanceof Uint8Array,
  )
}

function normalizeScannedFiles(
  files: readonly FolderScopedSyncScannedFile[],
): FolderScopedSyncScannedFile[] {
  return files
    .filter(isScannedFileSupported)
    .map((file) => ({
      ...file,
      relativePath: normalizeFolderSyncRelativePath(file.relativePath),
      bytes: new Uint8Array(file.bytes),
    }))
    .sort(
      (left, right) =>
        compareText(left.relativePath.toLowerCase(), right.relativePath.toLowerCase()) ||
        compareText(left.contentHash, right.contentHash),
    )
}

async function verifyScannedFile(
  dependencies: FolderScopedSyncDependencies,
  preflight: FolderScopedSyncPreflight,
  file: FolderScopedSyncScannedFile,
): Promise<FolderScopedSyncScannedFile> {
  if (file.bytes instanceof Uint8Array && file.bytes.byteLength > 0 && file.contentHash) {
    return file
  }
  const bytes = await dependencies.readFile(preflight.externalPath, file.relativePath)
  const contentHash = await hashSyncSourceBytes(bytes)
  if (file.contentHash && contentHash !== file.contentHash) {
    throw new Error(`File changed after preflight: ${file.relativePath}`)
  }
  return { ...file, bytes, contentHash }
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

export function folderScopedSyncDiskFilesByPath(
  diskFiles: readonly FolderScopedSyncScannedFile[],
): Map<string, FolderScopedSyncScannedFile[]> {
  const result = new Map<string, FolderScopedSyncScannedFile[]>()
  for (const file of diskFiles) {
    const key = normalizeFolderSyncRelativePath(file.relativePath).toLowerCase()
    const values = result.get(key) ?? []
    values.push(file)
    values.sort((left, right) => compareText(left.relativePath, right.relativePath))
    result.set(key, values)
  }
  return result
}

function scannedByPath(
  preflight: FolderScopedSyncPreflight,
): Map<string, FolderScopedSyncScannedFile[]> {
  return folderScopedSyncDiskFilesByPath(preflight.diskFiles)
}

function diskCandidateForConflict(
  conflict: Pick<FolderScopedSyncConflict, 'relativePath' | 'conflictingPaths'>,
  byPath: Map<string, FolderScopedSyncScannedFile[]>,
): FolderScopedSyncScannedFile | null {
  const exact = byPath.get(
    normalizeFolderSyncRelativePath(conflict.relativePath).toLowerCase(),
  )?.[0]
  if (exact) return exact
  for (const path of conflict.conflictingPaths ?? []) {
    const candidate = byPath.get(normalizeFolderSyncRelativePath(path).toLowerCase())?.[0]
    if (candidate) return candidate
  }
  return null
}

export function folderScopedSyncConflictHasDiskFile(
  conflict: Pick<FolderScopedSyncConflict, 'relativePath' | 'conflictingPaths'>,
  byPath: Map<string, FolderScopedSyncScannedFile[]>,
): boolean {
  return diskCandidateForConflict(conflict, byPath) !== null
}

export function isFolderScopedSyncConflictResolvable(
  conflict: Pick<FolderScopedSyncConflict, 'projectId' | 'reason'>,
  direction: FolderSyncDirection,
  cleanup = false,
  hasDiskFile = true,
): boolean {
  return folderScopedSyncConflictChoices(conflict, direction, cleanup, hasDiskFile).length > 0
}

export function folderScopedSyncConflictChoices(
  conflict: Pick<FolderScopedSyncConflict, 'projectId' | 'reason'>,
  _direction: FolderSyncDirection,
  cleanup = false,
  hasDiskFile = true,
): FolderScopedSyncConflictChoice[] {
  if (
    conflict.projectId === null ||
    conflict.reason === 'database-path-collision' ||
    conflict.reason === 'disk-path-collision' ||
    conflict.reason === 'invalid-relative-path'
  ) {
    return []
  }
  if (!hasDiskFile && !cleanup) return ['database']
  return ['database', 'filesystem']
}

export function createFolderScopedSyncService(dependencies: FolderScopedSyncDependencies) {
  async function preflight(
    folderId: string,
    options: { direction: FolderSyncDirection; cleanup?: boolean; externalPath?: string },
  ): Promise<FolderScopedSyncPreflight> {
    const scope = await dependencies.loadScope(folderId, options.direction, options.externalPath)
    if (scope.folderId !== folderId) {
      throw new Error('Folder sync scope did not resolve to the requested top-level folder')
    }
    const scan = await dependencies.scanFolder(scope.externalPath)
    const diskFiles = normalizeScannedFiles(scan.diskFiles)
    const primerListFiles = normalizeScannedFiles(scan.primerListFiles)
    const cleanup = options.cleanup === true
    if (cleanup && options.direction !== 'from') {
      throw new Error('Folder cleanup is only valid for sync from source')
    }
    const plan = planFolderScopedSync({
      direction: options.direction,
      dbFiles: scope.dbFiles,
      diskFiles,
      tombstones: scope.tombstones,
      cleanup,
    })
    const conflicts = plan.actions
      .filter(
        (action): action is Extract<FolderSyncAction, { kind: 'conflict' }> =>
          action.kind === 'conflict',
      )
      .map((conflict) => ({ ...conflict, id: folderScopedSyncConflictId(conflict) }))
    return {
      folderId,
      externalPath: scope.externalPath,
      direction: options.direction,
      cleanup,
      dbFiles: scope.dbFiles,
      diskFiles,
      primerListFiles,
      tombstones: scope.tombstones,
      plan,
      conflicts,
    }
  }

  async function apply(
    preflightResult: FolderScopedSyncPreflight,
    options: FolderScopedSyncApplyOptions = {},
  ): Promise<FolderScopedSyncApplyResult> {
    if (preflightResult.plan.direction !== preflightResult.direction) {
      throw new Error('Folder sync preflight direction does not match its plan')
    }
    const result: FolderScopedSyncApplyResult = {
      applied: 0,
      addedToDb: 0,
      updatedInDb: 0,
      writtenToDisk: 0,
      removedFromDb: 0,
      ignored: 0,
      primersSaved: 0,
      primersRemoved: 0,
      primerListsSaved: 0,
      primerListsRemoved: 0,
      unresolvedConflicts: [],
      failures: [],
    }
    const resolutions = new Map(
      (options.resolutions ?? []).map((resolution) => [
        resolution.conflictId,
        resolution.choice,
      ]),
    )
    const byPath = scannedByPath(preflightResult)
    const conflictById = new Map(
      preflightResult.conflicts.map((conflict) => [conflict.id, conflict]),
    )
    const workActions = preflightResult.plan.actions.filter((action) => action.kind !== 'ignore')
    const primerListFiles =
      preflightResult.direction === 'from' ? preflightResult.primerListFiles : []
    const total = Math.max(1, workActions.length + primerListFiles.length)
    let done = 0

    async function noteProgress(name: string): Promise<void> {
      done += 1
      options.onProgress?.(done, total, name)
      await yieldToUi()
    }

    async function importNew(file: FolderScopedSyncScannedFile): Promise<void> {
      const verified = await verifyScannedFile(dependencies, preflightResult, file)
      await dependencies.addToDb(preflightResult.folderId, verified)
      result.addedToDb += 1
      result.applied += 1
    }

    async function importReplacement(
      projectId: string,
      file: FolderScopedSyncScannedFile,
    ): Promise<void> {
      const verified = await verifyScannedFile(dependencies, preflightResult, file)
      await dependencies.updateDb(projectId, preflightResult.folderId, verified)
      result.updatedInDb += 1
      result.applied += 1
    }

    async function writeDatabase(
      projectId: string,
      relativePath: string,
    ): Promise<void> {
      const normalizedPath = normalizeFolderSyncRelativePath(relativePath)
      const write = await dependencies.getDatabaseWrite(projectId, normalizedPath)
      const verified = await dependencies.writeFile(
        preflightResult.externalPath,
        normalizedPath,
        write.bytes,
      )
      await dependencies.acceptDatabaseWrite(
        { ...write, relativePath: normalizedPath },
        verified.contentHash,
        preflightResult.folderId,
      )
      result.writtenToDisk += 1
      result.applied += 1
    }

    async function applyConflict(
      conflict: FolderScopedSyncConflict,
      choice: FolderScopedSyncConflictChoice,
    ): Promise<void> {
      const disk = diskCandidateForConflict(conflict, byPath)
      const allowed = folderScopedSyncConflictChoices(
        conflict,
        preflightResult.direction,
        preflightResult.cleanup,
        Boolean(disk),
      )
      if (!allowed.includes(choice)) {
        throw new Error(
          `Conflict choice ${choice} is not allowed for sync ${preflightResult.direction}`,
        )
      }
      if (choice === 'database') {
        if (!conflict.projectId) throw new Error('Conflict has no database construct')
        if (preflightResult.direction === 'from') {
          result.ignored += 1
          return
        }
        await writeDatabase(conflict.projectId, conflict.relativePath)
        return
      }
      if (choice === 'filesystem') {
        if (!conflict.projectId) throw new Error('Conflict has no database construct')
        if (preflightResult.direction === 'to') {
          result.ignored += 1
          return
        }
        if (!disk) {
          if (!preflightResult.cleanup) {
            throw new Error('Conflict has no filesystem file to accept')
          }
          await dependencies.removeFromDb(conflict.projectId)
          result.removedFromDb += 1
          result.applied += 1
          return
        }
        await importReplacement(conflict.projectId, disk)
        return
      }
    }

    pauseLibraryChangeNotifications()
    try {
      for (const action of preflightResult.plan.actions) {
        try {
          if (action.kind === 'ignore') {
            result.ignored += 1
            continue
          }
          await noteProgress(action.relativePath)
          if (action.kind === 'conflict') {
            const id = folderScopedSyncConflictId(action)
            const conflict = conflictById.get(id) ?? { ...action, id }
            const choice = resolutions.get(id)
            if (!choice) {
              result.unresolvedConflicts.push(conflict)
              continue
            }
            await applyConflict(conflict, choice)
            continue
          }
          if (action.kind === 'addToDb') {
            if (preflightResult.direction !== 'from') {
              throw new Error('Outbound folder sync cannot add database rows')
            }
            const file = byPath.get(action.relativePath.toLowerCase())?.[0]
            if (!file) throw new Error('File missing from preflight scan')
            await importNew(file)
            continue
          }
          if (action.kind === 'updateDb') {
            if (preflightResult.direction !== 'from') {
              throw new Error('Outbound folder sync cannot update database rows')
            }
            const file = byPath.get(action.relativePath.toLowerCase())?.[0]
            if (!file) throw new Error('File missing from preflight scan')
            await importReplacement(action.projectId, file)
            continue
          }
          if (action.kind === 'createOnDisk' || action.kind === 'overwriteDisk') {
            if (preflightResult.direction !== 'to') {
              throw new Error('Inbound folder sync cannot write filesystem files')
            }
            await writeDatabase(action.projectId, action.relativePath)
            continue
          }
          if (preflightResult.direction !== 'from' || !preflightResult.cleanup) {
            throw new Error('Database cleanup requires inbound cleanup intent')
          }
          await dependencies.removeFromDb(action.projectId)
          result.removedFromDb += 1
          result.applied += 1
        } catch (error) {
          result.failures.push({
            action,
            relativePath: action.relativePath,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      if (
        preflightResult.direction === 'from' &&
        (primerListFiles.length > 0 || preflightResult.cleanup)
      ) {
        try {
          for (const file of primerListFiles) {
            await noteProgress(file.relativePath)
          }
          const primerSync = await dependencies.syncPrimerLists(
            preflightResult.folderId,
            primerListFiles,
            { cleanup: preflightResult.cleanup },
          )
          result.primerListsSaved = primerSync.listsSaved
          result.primersSaved = primerSync.primersSaved
          result.primerListsRemoved = primerSync.listsRemoved
          result.primersRemoved = primerSync.primersRemoved
          result.applied += primerSync.listsSaved + primerSync.listsRemoved
        } catch (error) {
          result.failures.push({
            relativePath: 'primer lists',
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      if (result.failures.length === 0 && result.unresolvedConflicts.length === 0) {
        await dependencies.markSynced(preflightResult.folderId, new Date().toISOString())
      }
      return result
    } finally {
      resumeLibraryChangeNotifications()
    }
  }

  async function reconcileMapped(folderId: string): Promise<FolderScopedMirrorResult> {
    const scope = await dependencies.loadScope(folderId)
    if (scope.folderId !== folderId) {
      throw new Error('Folder sync scope did not resolve to the requested top-level folder')
    }
    const scan = await dependencies.scanFolder(scope.externalPath)
    const diskFiles = normalizeScannedFiles(scan.diskFiles)
    const byPath = folderScopedSyncDiskFilesByPath(diskFiles)
    const tombstoneKeys = new Set(scope.tombstones.map((row) =>
      normalizeFolderSyncRelativePath(row.relativePath).toLowerCase(),
    ))
    const handledDisk = new Set<string>()
    async function currentDiskFile(file: FolderScopedSyncScannedFile) {
      const bytes = await dependencies.readFile(scope.externalPath, file.relativePath)
      if (await hashSyncSourceBytes(bytes) !== file.contentHash) {
        throw new Error(`File changed during reconciliation: ${file.relativePath}`)
      }
      return { ...file, bytes }
    }
    const result: FolderScopedMirrorResult = {
      unchanged: 0,
      importedFromDisk: 0,
      writtenToDisk: 0,
      diskDeleted: 0,
      conflictCopies: 0,
      skipped: 0,
      failures: [],
    }

    function timestamp(): string {
      const date = (dependencies.now ?? (() => new Date()))()
      const pad = (value: number) => String(value).padStart(2, '0')
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}-${pad(date.getUTCSeconds())}`
    }

    function conflictPathFor(relativePath: string, occupied: Set<string>): string {
      const normalized = normalizeFolderSyncRelativePath(relativePath)
      const slash = normalized.lastIndexOf('/')
      const directory = slash >= 0 ? normalized.slice(0, slash + 1) : ''
      const fileName = slash >= 0 ? normalized.slice(slash + 1) : normalized
      const dot = fileName.lastIndexOf('.')
      const stem = dot > 0 ? fileName.slice(0, dot) : fileName
      const extension = dot > 0 ? fileName.slice(dot) : ''
      const base = `${directory}${stem} VibeGene's conflicted copy ${timestamp()}`
      let candidate = `${base}${extension}`
      let suffix = 2
      while (occupied.has(candidate.toLowerCase())) {
        candidate = `${base} ${suffix}${extension}`
        suffix += 1
      }
      return candidate
    }

    pauseLibraryChangeNotifications()
    try {
      for (const dbFile of [...scope.dbFiles].sort((a, b) => compareText(a.relativePath, b.relativePath))) {
        const path = normalizeFolderSyncRelativePath(dbFile.relativePath)
        const pathKey = path.toLowerCase()
        try {
        const disk = byPath.get(pathKey)?.[0]
        const existingTombstone = scope.tombstones.find((row) =>
          normalizeFolderSyncRelativePath(row.relativePath).toLowerCase() === pathKey,
        )
        if (disk) handledDisk.add(pathKey)
        const baselineDiskHash = dbFile.baselineDiskHash ?? null
        const baselineSemanticHash = dbFile.baselineSemanticRecordHash ?? null
        const dbChanged = baselineSemanticHash
          ? dbFile.semanticRecordHash !== baselineSemanticHash
          : dbFile.syncState !== 'synced'

        if (!disk) {
          if (existingTombstone?.reason === 'disk-delete') {
            result.skipped += 1
            continue
          }
          if (dbFile.syncState === 'local-only' && !baselineDiskHash) {
            const write = await dependencies.getDatabaseWrite(dbFile.projectId, path)
            const verified = await dependencies.writeFile(scope.externalPath, path, write.bytes)
            await dependencies.acceptDatabaseWrite(write, verified.contentHash, folderId)
            result.writtenToDisk += 1
            continue
          }
          if (baselineDiskHash) {
            if (!dependencies.recordDiskDeletion) {
              throw new Error('Mapped mirror does not support disk-deletion tombstones')
            }
            await dependencies.recordDiskDeletion({
              projectId: dbFile.projectId,
              folderId,
              relativePath: path,
              contentHash: baselineDiskHash,
            })
            result.diskDeleted += 1
          } else {
            result.skipped += 1
          }
          continue
        }

        if (!baselineDiskHash || !baselineSemanticHash) {
          if (dbFile.syncState === 'local-only') {
            // There is no common version to compare. Preserve both records
            // rather than silently choosing one as the linked source.
            result.skipped += 1
            continue
          }
          if (dbFile.exactBytes && dbFile.exactBytes.byteLength > 0) {
            const exactHash = await hashSyncSourceBytes(dbFile.exactBytes)
            if (exactHash === disk.contentHash) {
              await dependencies.updateDb(dbFile.projectId, folderId, await currentDiskFile(disk))
              result.importedFromDisk += 1
              continue
            }
          }
          result.skipped += 1
          continue
        }

        const diskChanged = disk.contentHash !== baselineDiskHash
        if (existingTombstone && existingTombstone.reason !== 'disk-delete') {
          result.skipped += 1
          continue
        }
        if (existingTombstone?.reason === 'disk-delete') {
          // A file that reappeared is reconciled against the retained common
          // baseline below, so an unrelated Database edit is still detected.
          await dependencies.clearDiskDeletion?.(dbFile.projectId, folderId, path)
        }
        if (!diskChanged && !dbChanged) {
          result.unchanged += 1
          continue
        }
        if (!diskChanged && dbChanged) {
          const write = await dependencies.getDatabaseWrite(dbFile.projectId, path)
          const verified = await dependencies.writeFile(scope.externalPath, path, write.bytes)
          await dependencies.acceptDatabaseWrite(write, verified.contentHash, folderId)
          result.writtenToDisk += 1
          continue
        }
        if (diskChanged && !dbChanged) {
          await dependencies.updateDb(dbFile.projectId, folderId, await currentDiskFile(disk))
          result.importedFromDisk += 1
          continue
        }

        if (!dependencies.createConflictCopy) {
          throw new Error('Mapped mirror does not support preserving simultaneous edits')
        }
        const write = await dependencies.getDatabaseWrite(dbFile.projectId, path)
        const occupied = new Set([
          ...diskFiles.map((file) => normalizeFolderSyncRelativePath(file.relativePath).toLowerCase()),
          ...scope.dbFiles.map((file) => normalizeFolderSyncRelativePath(file.relativePath).toLowerCase()),
        ])
        const conflictPath = conflictPathFor(path, occupied)
        const conflictBytes = new Uint8Array(write.bytes)
        const conflictHash = await hashSyncSourceBytes(conflictBytes)
        const copyWrite = await dependencies.createConflictCopy({
          projectId: dbFile.projectId,
          folderId,
          relativePath: conflictPath,
          bytes: conflictBytes,
          contentHash: conflictHash,
          semanticRecordHash: write.semanticRecordHash,
        })
        let conflictWritten = false
        try {
          const verified = await dependencies.writeFile(scope.externalPath, conflictPath, conflictBytes)
          if (verified.contentHash !== conflictHash) {
            throw new Error(`Conflict copy verification failed: ${conflictPath}`)
          }
          conflictWritten = true
          await dependencies.acceptDatabaseWrite(copyWrite, verified.contentHash, folderId)
        } catch (error) {
          if (!conflictWritten) await dependencies.removeConflictCopy?.(copyWrite.projectId)
          throw error
        }
        await dependencies.updateDb(dbFile.projectId, folderId, await currentDiskFile(disk))
        result.conflictCopies += 1
        } catch (error) {
          result.failures.push({
            relativePath: path,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      for (const disk of diskFiles) {
        const pathKey = normalizeFolderSyncRelativePath(disk.relativePath).toLowerCase()
        if (handledDisk.has(pathKey) || tombstoneKeys.has(pathKey)) continue
        try {
          await dependencies.addToDb(folderId, await currentDiskFile(disk))
          result.importedFromDisk += 1
        } catch (error) {
          result.failures.push({
            relativePath: disk.relativePath,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      if (result.failures.length === 0) {
        await dependencies.markSynced(folderId, new Date().toISOString())
      }
    } catch (error) {
      result.failures.push({
        relativePath: scope.externalPath,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      resumeLibraryChangeNotifications()
    }
    return result
  }

  return { preflight, apply, reconcileMapped }
}
