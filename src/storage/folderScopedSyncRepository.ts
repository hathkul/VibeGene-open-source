import {
  collectFolderSubtreeIds,
  folderPathRelativeToRoot,
} from './databaseExport'
import {
  hashConstructSemanticRecord,
  hashConstructSemanticRecordWithoutHistory,
  hashUnversionedConstructSemanticRecord,
  hashImportedFileSemanticRecord,
  importBytesIntoLibrary,
  importBytesReplacingProject,
} from './databaseImport'
import { constructSyncContentKey } from './databaseImportSemanticHash'
import { isPrimerListTabText, parsePrimerDataTsv } from '../domain/primerExport'
import { encodeRecordForSyncRelativePath, normalizeFolderSyncRelativePath, sequenceFileStem } from './databaseSync'
import { hashSyncSourceBytes } from './syncSourceHash'
import { syncFolderPrimerLists } from './folderPrimerLists'
import {
  createFolder,
  listFolders,
  setFolderSyncMappingLastSyncedAt,
} from './projectLibrary'
import {
  acceptProjectFileSync,
  deleteProjectForSyncCleanup,
  getFolderSyncMapping,
  listFolderSyncPendingProjects,
  deleteProjectFileTombstone,
  getProject,
  getProjectFileBaseline,
  getProjectFileBlob,
  inferProjectFileFormat,
  listProjectFileTombstones,
  putProjectFileTombstone,
  putProjectFileBaseline,
  listProjectSummaries,
  restoreImportedProjectFileBaseline,
  type ProjectFileFormat,
  type StoredProjectFileBaseline,
  type StoredProjectFileBlob,
} from './projects'
import type {
  FolderScopedSyncDatabaseWrite,
  FolderScopedSyncDependencies,
  FolderScopedSyncScannedFile,
  FolderScopedSyncScope,
} from './folderScopedSyncService'
import { createFolderScopedSyncService } from './folderScopedSyncService'

function fileNameOf(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1) || normalized
}

/**
 * Repair queues created by the old folder-import mapping path. That path
 * detached imported rows and deleted their baselines, even though their exact
 * source bytes were already retained in the Database.
 */
export async function restoreLegacyImportedFolderSyncBaselines(
  rootFolderId: string,
): Promise<number> {
  const mapping = await getFolderSyncMapping(rootFolderId)
  // Folder imports created the mapping once, with lastSyncedAt set. Manual
  // mappings and remapped folders must keep their pending outbound work.
  if (!mapping || mapping.createdAt !== mapping.updatedAt || !mapping.lastSyncedAt) return 0
  const [folders, pending] = await Promise.all([
    listFolders(),
    listFolderSyncPendingProjects(rootFolderId),
  ])
  const subtreeIds = collectFolderSubtreeIds(folders, rootFolderId)
  let restored = 0
  for (const summary of pending) {
    if (
      summary.fileSyncState !== 'local-only' ||
      summary.fileProvenance !== 'imported' ||
      !summary.folderId ||
      !subtreeIds.has(summary.folderId) ||
      !summary.fileName ||
      !summary.fileFormat
    ) continue
    const [project, blob] = await Promise.all([
      getProject(summary.id),
      getProjectFileBlob(summary.id),
    ])
    if (
      !project ||
      !blob?.contentHash ||
      blob.fileName !== summary.fileName ||
      blob.fileFormat !== summary.fileFormat
    ) continue
    const importedSemanticHash = await hashImportedFileSemanticRecord(blob.fileName, blob.bytes)
    if (!importedSemanticHash) continue
    const currentSemanticHash = await hashConstructSemanticRecord(project.record)
    if (currentSemanticHash !== importedSemanticHash) continue
    const directory = folderPathRelativeToRoot(folders, summary.folderId, rootFolderId)
    const relativePath = normalizeFolderSyncRelativePath(
      directory ? `${directory}/${summary.fileName}` : summary.fileName,
    )
    if (await restoreImportedProjectFileBaseline({
      projectId: summary.id,
      rootFolderId,
      relativePath,
      fileName: summary.fileName,
      fileFormat: summary.fileFormat as ProjectFileFormat,
      contentHash: blob.contentHash,
      semanticRecordHash: importedSemanticHash,
      expectedUpdatedAt: summary.updatedAt,
      expectedMappingUpdatedAt: mapping.updatedAt,
    })) {
      restored += 1
    }
  }
  return restored
}

export function retainedExactBytesForFolderSyncWrite(
  blob: StoredProjectFileBlob | null,
  baseline: StoredProjectFileBaseline | null,
  targetFormat: ProjectFileFormat,
  semanticRecordHash: string,
): Uint8Array | null {
  if (
    !blob ||
    !baseline ||
    blob.fileFormat !== targetFormat ||
    blob.contentHash !== baseline.contentHash ||
    baseline.semanticRecordHash !== semanticRecordHash
  ) {
    return null
  }
  return new Uint8Array(blob.bytes)
}

async function ensureDatabaseFolderPath(
  rootFolderId: string,
  relativePath: string,
): Promise<string> {
  const slash = relativePath.lastIndexOf('/')
  if (slash < 0) return rootFolderId
  const parts = relativePath.slice(0, slash).split('/').filter(Boolean)
  let folders = await listFolders()
  let parentId = rootFolderId
  for (const part of parts) {
    const existing = folders.find(
      (folder) =>
        folder.parentId === parentId &&
        folder.name.normalize('NFC').toLowerCase() === part.normalize('NFC').toLowerCase(),
    )
    if (existing) {
      parentId = existing.id
      continue
    }
    const created = await createFolder(part, parentId)
    folders = [...folders, created]
    parentId = created.id
  }
  return parentId
}

async function loadScope(
  folderId: string,
  direction?: 'from' | 'to',
  externalPathOverride?: string,
): Promise<FolderScopedSyncScope> {
  const mapping = await getFolderSyncMapping(folderId)
  if (!mapping && !externalPathOverride) {
    throw new Error('The selected top-level database folder has no external sync mapping')
  }
  const [folders, summaries, tombstones] = await Promise.all([
    listFolders(),
    listProjectSummaries(),
    listProjectFileTombstones(folderId),
  ])
  const root = folders.find((folder) => folder.id === folderId)
  if (!root || root.parentId !== null) {
    throw new Error('Folder-scoped sync requires a top-level database folder')
  }
  const subtreeIds = collectFolderSubtreeIds(folders, folderId)
  const scoped = summaries.filter(
    (summary) => summary.folderId != null && subtreeIds.has(summary.folderId),
  )
  const dbFiles: FolderScopedSyncScope['dbFiles'] = []
  // Bound memory: a library may contain many gigabytes of exact source blobs.
  // Synced summaries can use their semantic baseline without loading bodies.
  for (const summary of scoped) {
      const baseline = await getProjectFileBaseline(summary.id)
      const clean = summary.fileSyncState === 'synced' && baseline?.semanticRecordHash.startsWith('sync-v2:')
      const project = clean ? null : await getProject(summary.id)
      if (!clean && !project) continue
      const semanticRecordHash = clean ? baseline!.semanticRecordHash : await hashConstructSemanticRecord(project!.record)
      let baselineSemanticRecordHash = baseline?.semanticRecordHash ?? null
      if (baseline && !baseline.semanticRecordHash.startsWith('sync-v2:') && project) {
        const [unversionedCurrentHash, legacyCurrentHash] = await Promise.all([
          hashUnversionedConstructSemanticRecord(project.record),
          hashConstructSemanticRecordWithoutHistory(project.record),
        ])
        const hasAnyHistory = Boolean(
          project.record.history ||
          project.record.snapGeneNativeHistory?.treePayload ||
          project.record.snapGeneNativeHistory?.nodePackets.length,
        )
        // 1.6.7 wrote history-aware hashes without a schema prefix; accept those
        // directly. Older baselines omitted history, so only auto-upgrade them
        // when the record has no history to preserve.
        const baselineAlreadyIncludesHistory = baseline.semanticRecordHash === unversionedCurrentHash
        const legacyBaselineIsSafe = !hasAnyHistory && baseline.semanticRecordHash === legacyCurrentHash
        if (baselineAlreadyIncludesHistory || legacyBaselineIsSafe) {
          baselineSemanticRecordHash = semanticRecordHash
          await putProjectFileBaseline({ ...baseline, semanticRecordHash })
        }
      }
      const directory = folderPathRelativeToRoot(folders, summary.folderId, folderId)
      const generatedPath = directory
        ? `${directory}/${summary.fileName}`
        : summary.fileName!
      const relativePath = direction === 'to'
        ? generatedPath
        : baseline?.relativePath ?? summary.syncRelativePath ?? generatedPath
      dbFiles.push({
        projectId: summary.id,
        relativePath,
        fileName: summary.fileName!,
        syncState: summary.fileSyncState ?? 'local-only',
        semanticRecordHash,
        baselineDiskHash: baseline?.contentHash ?? null,
        baselineSemanticRecordHash,
        ...(project ? { record: project.record } : {}),
        fileFormat: summary.fileFormat,
      })
  }
  return {
    folderId,
    externalPath: externalPathOverride ?? mapping!.externalPath,
    dbFiles,
    tombstones: tombstones.map((tombstone) => ({
      relativePath: tombstone.relativePath,
      ...(tombstone.projectId ? { projectId: tombstone.projectId } : {}),
      ...(tombstone.contentHash ? { contentHash: tombstone.contentHash } : {}),
      ...(tombstone.reason ? { reason: tombstone.reason } : {}),
    })),
  }
}

async function addToDb(
  folderId: string,
  file: FolderScopedSyncScannedFile,
): Promise<string> {
  const targetFolderId = await ensureDatabaseFolderPath(folderId, file.relativePath)
  const name = fileNameOf(file.relativePath)
  const result = await importBytesIntoLibrary(name, file.bytes, {
    folderId: targetFolderId,
    tags: [],
    constructName: sequenceFileStem(name),
    syncRelativePath: file.relativePath,
    contentHash: file.contentHash,
  })
  if (!result.ok) throw new Error(result.error)
  return result.id
}

async function updateDb(
  projectId: string,
  folderId: string,
  file: FolderScopedSyncScannedFile,
): Promise<void> {
  const [project, blob] = await Promise.all([
    getProject(projectId),
    getProjectFileBlob(projectId),
  ])
  if (!project) throw new Error('Construct not found in database')
  const name = fileNameOf(file.relativePath)
  if (blob?.contentHash && file.contentHash && blob.contentHash === file.contentHash) {
    const semanticRecordHash = await hashConstructSemanticRecord(project.record)
    await acceptProjectFileSync({
      projectId,
      rootFolderId: folderId,
      relativePath: file.relativePath,
      bytes: file.bytes,
      contentHash: file.contentHash,
      semanticRecordHash,
      fileName: name,
    })
    return
  }
  const targetFolderId = await ensureDatabaseFolderPath(folderId, file.relativePath)
  const result = await importBytesReplacingProject(projectId, name, file.bytes, {
    folderId: targetFolderId,
    constructName: sequenceFileStem(name),
    syncRelativePath: file.relativePath,
    contentHash: file.contentHash,
  })
  if (!result.ok) throw new Error(result.error)
}

async function getDatabaseWrite(
  projectId: string,
  relativePath: string,
): Promise<FolderScopedSyncDatabaseWrite> {
  const [project, blob, baseline] = await Promise.all([
    getProject(projectId),
    getProjectFileBlob(projectId),
    getProjectFileBaseline(projectId),
  ])
  if (!project) throw new Error('Construct not found in database')
  const semanticRecordHash = await hashConstructSemanticRecord(project.record)
  const targetFormat = inferProjectFileFormat(relativePath)
  const retainedBytes = retainedExactBytesForFolderSyncWrite(
    blob,
    baseline,
    targetFormat,
    semanticRecordHash,
  )
  const bytes = retainedBytes
    ? retainedBytes
    : encodeRecordForSyncRelativePath(relativePath, project.record)
  return {
    projectId,
    relativePath,
    bytes,
    semanticRecordHash,
    sourceUpdatedAt: project.updatedAt,
    sourceContentKey: constructSyncContentKey(project.record),
  }
}

async function acceptDatabaseWrite(
  write: FolderScopedSyncDatabaseWrite,
  contentHash: string,
  rootFolderId: string,
  retiredSourcePath?: string | null,
): Promise<void> {
  await acceptProjectFileSync({
    projectId: write.projectId,
    rootFolderId,
    relativePath: write.relativePath,
    bytes: write.bytes,
    contentHash,
    semanticRecordHash: write.semanticRecordHash,
    sourceUpdatedAt: write.sourceUpdatedAt,
    sourceContentKey: write.sourceContentKey,
    ...(retiredSourcePath ? { retiredSourcePath } : {}),
  })
}

async function syncPrimerLists(
  folderId: string,
  files: readonly FolderScopedSyncScannedFile[],
  options: { cleanup: boolean },
): Promise<{
  listsSaved: number
  primersSaved: number
  listsRemoved: number
  primersRemoved: number
}> {
  const drafts: Array<{
    folderId: string
    relativePath: string
    primers: Array<{ name: string; sequence: string; description: string }>
  }> = []
  for (const file of files) {
    const text = new TextDecoder().decode(file.bytes)
    if (!isPrimerListTabText(text)) continue
    const parsed = parsePrimerDataTsv(text, { requireTab: true })
    const relativePath = normalizeFolderSyncRelativePath(file.relativePath)
    const name = fileNameOf(relativePath)
    const targetFolderId = await ensureDatabaseFolderPath(folderId, relativePath)
    drafts.push({
      folderId: targetFolderId,
      relativePath,
      primers: parsed.map((primer) => ({
        name: primer.name,
        sequence: primer.sequence,
        description: `Imported from ${name}`,
      })),
    })
  }
  return syncFolderPrimerLists(drafts, {
    rootFolderId: folderId,
    cleanup: options.cleanup,
  })
}

export function createFolderScopedSyncRepositoryDependencies(
  io: Pick<
    FolderScopedSyncDependencies,
    'scanFolder' | 'readFile' | 'writeFile'
  >,
): FolderScopedSyncDependencies {
  return {
    ...io,
    loadScope,
    addToDb,
    updateDb,
    getDatabaseWrite,
    acceptDatabaseWrite,
    removeFromDb: deleteProjectForSyncCleanup,
    removeConflictCopy: deleteProjectForSyncCleanup,
    syncPrimerLists,
    async createConflictCopy(input) {
      const project = await getProject(input.projectId)
      if (!project) throw new Error('Construct not found in database')
      const targetFolderId = await ensureDatabaseFolderPath(input.folderId, input.relativePath)
      const name = fileNameOf(input.relativePath)
      const imported = await importBytesIntoLibrary(name, input.bytes, {
        folderId: targetFolderId,
        tags: project.tags,
        constructName: sequenceFileStem(name),
      })
      if (!imported.ok) throw new Error(imported.error)
      const duplicate = await getProject(imported.id)
      if (!duplicate) throw new Error('Could not load the preserved conflict copy')
      return {
        projectId: imported.id,
        relativePath: input.relativePath,
        bytes: new Uint8Array(input.bytes),
        semanticRecordHash: await hashConstructSemanticRecord(duplicate.record),
        sourceUpdatedAt: duplicate.updatedAt,
        sourceContentKey: constructSyncContentKey(duplicate.record),
      }
    },
    async recordDiskDeletion(input) {
      const existing = (await listProjectFileTombstones(input.folderId)).find((row) =>
        row.reason === 'disk-delete' && row.projectId === input.projectId &&
        normalizeFolderSyncRelativePath(row.relativePath).toLowerCase() ===
          normalizeFolderSyncRelativePath(input.relativePath).toLowerCase(),
      )
      if (existing) return
      const fileName = fileNameOf(input.relativePath)
      await putProjectFileTombstone({
        rootFolderId: input.folderId,
        relativePath: normalizeFolderSyncRelativePath(input.relativePath),
        fileName,
        fileFormat: inferProjectFileFormat(fileName),
        deletedAt: new Date().toISOString(),
        projectId: input.projectId,
        contentHash: input.contentHash,
        reason: 'disk-delete',
      })
    },
    async clearDiskDeletion(projectId, folderId, relativePath) {
      const rows = await listProjectFileTombstones(folderId)
      await Promise.all(rows.filter((row) =>
        row.reason === 'disk-delete' && row.projectId === projectId &&
        normalizeFolderSyncRelativePath(row.relativePath).toLowerCase() ===
          normalizeFolderSyncRelativePath(relativePath).toLowerCase(),
      ).map((row) => deleteProjectFileTombstone(row.id)))
    },
    async markSynced(folderId, syncedAt) {
      await setFolderSyncMappingLastSyncedAt(folderId, syncedAt)
    },
  }
}

/** Reconcile an already linked folder in both directions against its common baselines. */
export async function reconcileMappedFolder(
  folderId: string,
  io: Pick<FolderScopedSyncDependencies, 'scanFolder' | 'readFile' | 'writeFile'> & {
    fileExists?: (root: string, path: string) => Promise<boolean>
    deleteFile?: (root: string, path: string) => Promise<void>
  },
) {
  // A rename has a durable historical-path tombstone. Commit and verify the
  // destination before retiring the old path; a crash must leave one full copy.
  const mapping = await getFolderSyncMapping(folderId)
  if (!mapping) throw new Error('Linked folder mapping is missing')
  if (io.fileExists && io.deleteFile) {
    const tombstones = (await listProjectFileTombstones(folderId)).filter((row) => row.reason === 'path-change')
    const folders = tombstones.length ? await listFolders() : []
    for (const row of tombstones) {
      if (!row.projectId) continue
      const project = await getProject(row.projectId)
      if (!project?.fileName) continue
      const directory = folderPathRelativeToRoot(folders, project.folderId, folderId)
      const target = normalizeFolderSyncRelativePath(directory ? `${directory}/${project.fileName}` : project.fileName)
      if (target === row.relativePath) continue
      const write = await getDatabaseWrite(project.id, target)
      const expected = await hashSyncSourceBytes(write.bytes)
      if (await io.fileExists(mapping.externalPath, target)) {
        const presentHash = await hashSyncSourceBytes(await io.readFile(mapping.externalPath, target))
        const baseline = await getProjectFileBaseline(project.id)
        if (presentHash !== expected && presentHash !== baseline?.contentHash) {
          throw new Error(`Rename destination already exists: ${target}`)
        }
      }
      const verified = await io.writeFile(mapping.externalPath, target, write.bytes)
      if (verified.contentHash !== expected) throw new Error(`Rename verification failed: ${target}`)
      await acceptDatabaseWrite(write, expected, folderId)
      if (await io.fileExists(mapping.externalPath, row.relativePath)) {
        const oldBytes = await io.readFile(mapping.externalPath, row.relativePath)
        const oldHash = await hashSyncSourceBytes(oldBytes)
        if (oldHash === row.contentHash) {
          await io.deleteFile(mapping.externalPath, row.relativePath)
        } else {
          // Preserve a simultaneous outside edit at the original path in DB.
          await addToDb(folderId, { relativePath: row.relativePath, bytes: oldBytes, contentHash: oldHash })
        }
      }
      await deleteProjectFileTombstone(row.id)
    }
  }
  return createFolderScopedSyncService(createFolderScopedSyncRepositoryDependencies(io))
    .reconcileMapped(folderId)
}

/** Restore one disk-deletion tombstone by writing the retained Database record back to disk. */
export async function restoreMappedDiskDeletion(
  rootFolderId: string,
  tombstoneId: string,
  io: Pick<FolderScopedSyncDependencies, 'writeFile'>,
): Promise<boolean> {
  const [mapping, tombstones] = await Promise.all([
    getFolderSyncMapping(rootFolderId),
    listProjectFileTombstones(rootFolderId),
  ])
  const tombstone = tombstones.find((row) => row.id === tombstoneId)
  if (!mapping || !tombstone || tombstone.reason !== 'disk-delete' || !tombstone.projectId) {
    return false
  }
  const write = await getDatabaseWrite(tombstone.projectId, tombstone.relativePath)
  const verified = await io.writeFile(mapping.externalPath, tombstone.relativePath, write.bytes)
  if (verified.contentHash !== await hashSyncSourceBytes(write.bytes)) {
    throw new Error(`Could not verify restored file ${tombstone.relativePath}`)
  }
  await acceptDatabaseWrite(write, verified.contentHash, rootFolderId)
  await deleteProjectFileTombstone(tombstone.id)
  return true
}

/** Flush the durable outbound queue without scanning unrelated DB rows or disk files. */
export async function flushPendingFolderSync(
  folderId: string,
  io: Pick<FolderScopedSyncDependencies, 'readFile' | 'writeFile'> & {
    /** Sequential, bounded lookup used only after target and historical-path misses. */
    findFilesByContentHash?: (
      path: string,
      contentHash: string,
    ) => Promise<string[] | null>
    fileExists(path: string, relativePath: string): Promise<boolean>
    deleteFile(path: string, relativePath: string): Promise<void>
  },
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<{ written: number; conflicts: number; skipped: number; path: string }> {
  const mapping = await getFolderSyncMapping(folderId)
  if (!mapping) throw new Error('The selected top-level database folder has no external sync mapping')
  const [folders, pending] = await Promise.all([
    listFolders(),
    listFolderSyncPendingProjects(folderId),
  ])
  const subtreeIds = collectFolderSubtreeIds(folders, folderId)
  const total = pending.length
  let written = 0
  let conflicts = 0
  let skipped = 0
  // Only path changes authorize removing an old file, and only when it still
  // has the exact bytes recorded at the common baseline.
  const pathTombstones = (await listProjectFileTombstones(folderId)).filter(
    (tombstone) => tombstone.reason === 'path-change',
  )
  for (let index = 0; index < pending.length; index += 1) {
    const summary = pending[index]!
    if (!summary.folderId || !subtreeIds.has(summary.folderId) || !summary.fileName) {
      skipped += 1
      onProgress?.(index + 1, total, summary.name)
      continue
    }
    const baseline = await getProjectFileBaseline(summary.id)
    const directory = folderPathRelativeToRoot(folders, summary.folderId, folderId)
    // The Database hierarchy and basename define where outbound data belongs.
    // Baseline paths are historical locations used only to prove the source bytes.
    const relativePath = normalizeFolderSyncRelativePath(
      directory ? `${directory}/${summary.fileName}` : summary.fileName,
    )
    const exists = await io.fileExists(mapping.externalPath, relativePath)
    const diskHash = exists
      ? await hashSyncSourceBytes(await io.readFile(mapping.externalPath, relativePath))
      : null
    let retiredSourcePath: string | null = null
    let safeToWrite = baseline
      ? diskHash === baseline.contentHash
      : summary.fileSyncState === 'local-only' && diskHash === null

    // A missing target is not permission to recreate a synced file: first prove
    // that its exact baseline still exists at the recorded historical path.
    // Only on a miss do we scan the mapped folder, and recovery requires one
    // unique hash match. Ambiguous, missing, or externally changed bytes conflict.
    if (baseline && !exists) {
      const historicalPath = normalizeFolderSyncRelativePath(
        baseline.relativePath ?? summary.syncRelativePath ?? '',
      )
      if (historicalPath && historicalPath !== relativePath &&
          await io.fileExists(mapping.externalPath, historicalPath)) {
        const historicalHash = await hashSyncSourceBytes(
          await io.readFile(mapping.externalPath, historicalPath),
        )
        if (historicalHash === baseline.contentHash) {
          safeToWrite = true
          retiredSourcePath = historicalPath
        }
      }
      if (!safeToWrite && io.findFilesByContentHash) {
        const matches = await io.findFilesByContentHash(mapping.externalPath, baseline.contentHash)
        if (matches?.length === 1 && matches[0] !== relativePath) {
          safeToWrite = true
          retiredSourcePath = normalizeFolderSyncRelativePath(matches[0]!)
        }
      }
    }
    if (!safeToWrite) {
      conflicts += 1
      onProgress?.(index + 1, total, relativePath)
      continue
    }
    const write = await getDatabaseWrite(summary.id, relativePath)
    const verified = await io.writeFile(mapping.externalPath, relativePath, write.bytes)
    // acceptProjectFileSync commits the repaired paths and guarded old-path
    // tombstone together, after the new target write has been verified.
    await acceptDatabaseWrite(
      { ...write, relativePath },
      verified.contentHash,
      folderId,
      retiredSourcePath,
    )
    written += 1
    onProgress?.(index + 1, total, relativePath)
  }
  for (const tombstone of pathTombstones) {
    // Retire a source only after the destination has a committed baseline.
    const baseline = tombstone.projectId ? await getProjectFileBaseline(tombstone.projectId) : null
    if (!baseline?.relativePath || baseline.relativePath === tombstone.relativePath) continue
    if (!await io.fileExists(mapping.externalPath, baseline.relativePath)) continue
    const targetHash = await hashSyncSourceBytes(await io.readFile(mapping.externalPath, baseline.relativePath))
    if (targetHash !== baseline.contentHash) continue
    if (await io.fileExists(mapping.externalPath, tombstone.relativePath)) {
      const currentHash = await hashSyncSourceBytes(await io.readFile(mapping.externalPath, tombstone.relativePath))
      if (!tombstone.contentHash || currentHash !== tombstone.contentHash) {
        conflicts += 1
        continue
      }
      await io.deleteFile(mapping.externalPath, tombstone.relativePath)
    }
    await deleteProjectFileTombstone(tombstone.id)
  }
  return { written, conflicts, skipped, path: mapping.externalPath }
}
