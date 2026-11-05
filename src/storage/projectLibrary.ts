import { createId, nowIso } from '../domain/sequence'
import { inferProjectFileFormat } from '../domain/fileFormats'
import {
  db,
  deleteProject,
  isSessionDraftId,
  normalizeProjectFileName,
  normalizeStoredProjectSummary,
  type StoredFolderSyncMapping,
  type StoredProjectFileBaseline,
  type StoredProjectFileTombstone,
  type StoredProjectSummary,
} from './projects'
import { notifyLibraryChanged } from './libraryEvents'
import {
  deleteManagedDatabaseFile,
  readManagedDatabaseFile,
  writeManagedDatabaseFile,
} from './managedDatabaseMirror'

export type StoredFolder = {
  id: string
  name: string
  /** Parent folder id, or null for a root-level folder. */
  parentId: string | null
  updatedAt: string
}

export const UNFILED_FOLDER_ID = '__unfiled__'

export async function listFolders(): Promise<StoredFolder[]> {
  return db.folders.orderBy('name').toArray()
}

/** Resolve any nested folder to its owning top-level database folder. */
export function resolveTopLevelFolder(
  folders: readonly StoredFolder[],
  folderId: string | null | undefined,
): StoredFolder | null {
  if (!folderId) return null
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const visited = new Set<string>()
  let cursor: string | null = folderId
  while (cursor) {
    if (visited.has(cursor)) return null
    visited.add(cursor)
    const folder = byId.get(cursor)
    if (!folder) return null
    if (folder.parentId === null) return folder
    cursor = folder.parentId
  }
  return null
}

export type ResolvedFolderSyncMapping = {
  rootFolder: StoredFolder
  mapping: StoredFolderSyncMapping
}

function pendingRowForProject(
  project: StoredProjectSummary,
  folders: readonly StoredFolder[],
  mappedRootIds: ReadonlySet<string>,
  queuedAt = nowIso(),
) {
  const root = resolveTopLevelFolder(folders, project.folderId)
  return root && mappedRootIds.has(root.id)
    ? { id: `${root.id}\0${project.id}`, rootFolderId: root.id, projectId: project.id, queuedAt }
    : null
}

/** Nested folders inherit the mapping owned by their top-level ancestor. */
export async function resolveFolderSyncMapping(
  folderId: string | null | undefined,
): Promise<ResolvedFolderSyncMapping | null> {
  const folders = await listFolders()
  const rootFolder = resolveTopLevelFolder(folders, folderId)
  if (!rootFolder) return null
  const mapping = await db.folderSyncMappings.get(rootFolder.id)
  return mapping ? { rootFolder, mapping } : null
}

export type SetFolderSyncMappingOptions = {
  lastSyncedAt?: string | null
  /** The source files were just imported and their stored hashes are the initial common baseline. */
  importedContentsAreBaseline?: boolean
}

export function folderSyncSourcePathChanged(
  existingPath: string | null | undefined,
  nextPath: string,
): boolean {
  if (!existingPath) return false
  const normalize = (value: string) =>
    value.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  return normalize(existingPath) !== normalize(nextPath)
}

/** Detach source-specific metadata while retaining identity, format, and exact bytes. */
export function detachProjectFromFolderSyncSource(
  project: StoredProjectSummary,
): StoredProjectSummary {
  const next: StoredProjectSummary = {
    ...project,
    fileSyncState: 'local-only',
    ...(project.fileProvenance === 'sync-folder'
      ? { fileProvenance: 'imported' as const }
      : {}),
  }
  delete next.syncSourceHash
  delete next.syncRelativePath
  return next
}

export type PreparedProjectPathMutation = {
  project: StoredProjectSummary
  tombstone: StoredProjectFileTombstone | null
}

/**
 * Prepare a construct for a user-initiated database path change. The exact
 * blob is intentionally outside this plan and remains untouched by callers.
 */
export function prepareProjectPathMutation(input: {
  project: StoredProjectSummary
  baseline: StoredProjectFileBaseline | null
  oldRootFolderId: string | null
  oldRootIsMapped: boolean
  updatedAt: string
  tombstoneId: string
}): PreparedProjectPathMutation {
  const { project, baseline } = input
  const relativePath = baseline?.relativePath ?? project.syncRelativePath
  const tombstone =
    input.oldRootIsMapped &&
    input.oldRootFolderId &&
    project.fileSyncState !== 'local-only' &&
    relativePath
      ? {
          id: input.tombstoneId,
          rootFolderId: input.oldRootFolderId,
          relativePath,
          fileName: project.fileName ?? baseline?.fileName ?? relativePath.split('/').pop()!,
          fileFormat: project.fileFormat ?? baseline?.fileFormat ?? 'unknown',
          deletedAt: input.updatedAt,
          reason: 'path-change' as const,
          projectId: project.id,
          ...(baseline?.contentHash ?? project.syncSourceHash
            ? { contentHash: baseline?.contentHash ?? project.syncSourceHash }
            : {}),
        }
      : null
  return {
    project: {
      ...detachProjectFromFolderSyncSource(project),
      updatedAt: input.updatedAt,
    },
    tombstone,
  }
}

function collectFolderSubtreeIds(
  folders: readonly StoredFolder[],
  rootFolderId: string,
): Set<string> {
  const ids = new Set<string>([rootFolderId])
  let changed = true
  while (changed) {
    changed = false
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id)
        changed = true
      }
    }
  }
  return ids
}

export function assertFolderMappingAllowsMove(
  folder: Pick<StoredFolder, 'parentId'>,
  parentId: string | null,
  ownsMapping: boolean,
): void {
  if (folder.parentId === null && parentId !== null && ownsMapping) {
    throw new Error(
      'Mapped top-level folders cannot be moved inside another folder. Remove its sync mapping first.',
    )
  }
}

async function prepareSubtreePathMutation(input: {
  folders: readonly StoredFolder[]
  subtreeRootId: string
  oldRootFolderId: string | null
  oldRootIsMapped: boolean
  updatedAt: string
}): Promise<{
  projects: StoredProjectSummary[]
  projectIds: string[]
  tombstones: StoredProjectFileTombstone[]
}> {
  const subtreeIds = collectFolderSubtreeIds(input.folders, input.subtreeRootId)
  const projects = await db.projects.where('folderId').anyOf([...subtreeIds]).toArray()
  const baselines = await db.projectFileBaselines.bulkGet(projects.map((project) => project.id))
  const prepared = projects.map((project, index) =>
    prepareProjectPathMutation({
      project,
      baseline: baselines[index] ?? null,
      oldRootFolderId: input.oldRootFolderId,
      oldRootIsMapped: input.oldRootIsMapped,
      updatedAt: input.updatedAt,
      tombstoneId: createId('tombstone'),
    }),
  )
  return {
    projects: prepared.map((item) => item.project),
    projectIds: projects.map((project) => project.id),
    tombstones: prepared.flatMap((item) => (item.tombstone ? [item.tombstone] : [])),
  }
}

/** Create/update a mapping; nested folders are rejected because they inherit their root. */
export async function setTopLevelFolderSyncMapping(
  folderId: string,
  externalPath: string,
  options: SetFolderSyncMappingOptions = {},
): Promise<StoredFolderSyncMapping> {
  const folder = await db.folders.get(folderId)
  if (!folder) throw new Error('Folder not found')
  if (folder.parentId !== null) {
    throw new Error('Only top-level folders can own sync mappings')
  }
  const path = externalPath.trim()
  if (!path) throw new Error('Sync folder path is required')
  const existing = await db.folderSyncMappings.get(folderId)
  const sourceChanged = folderSyncSourcePathChanged(existing?.externalPath, path)
  const preserveImportedBaseline = !existing && options.importedContentsAreBaseline === true
  const updatedAt = nowIso()
  const mapping: StoredFolderSyncMapping = {
    folderId,
    externalPath: path,
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
    ...(!sourceChanged && options.lastSyncedAt !== undefined
      ? options.lastSyncedAt
        ? { lastSyncedAt: options.lastSyncedAt }
        : {}
      : !sourceChanged && existing?.lastSyncedAt
        ? { lastSyncedAt: existing.lastSyncedAt }
        : {}),
  }
  if (!sourceChanged && existing) {
    await db.folderSyncMappings.put(mapping)
    return mapping
  }

  await db.transaction(
    'rw',
    [
      db.folderSyncMappings,
      db.folders,
      db.projects,
      db.projectFileBaselines,
      db.projectFileTombstones,
      db.folderSyncPending,
    ],
    async () => {
      const folders = await db.folders.toArray()
      const subtreeIds = new Set<string>([folderId])
      let changed = true
      while (changed) {
        changed = false
        for (const candidate of folders) {
          if (
            candidate.parentId &&
            subtreeIds.has(candidate.parentId) &&
            !subtreeIds.has(candidate.id)
          ) {
            subtreeIds.add(candidate.id)
            changed = true
          }
        }
      }
      const projects = await db.projects
        .where('folderId')
        .anyOf([...subtreeIds])
        .toArray()
      if (projects.length > 0 && !preserveImportedBaseline) {
        await db.projects.bulkPut(
          projects.map((project) => ({
            ...detachProjectFromFolderSyncSource(project),
            updatedAt,
          })),
        )
        await db.projectFileBaselines.bulkDelete(projects.map((project) => project.id))
        await db.folderSyncPending.bulkPut(projects.map((project) => ({
          id: `${folderId}\0${project.id}`,
          rootFolderId: folderId,
          projectId: project.id,
          queuedAt: updatedAt,
        })))
      }
      await db.projectFileTombstones.where('rootFolderId').equals(folderId).delete()
      await db.folderSyncMappings.put(mapping)
    },
  )
  notifyLibraryChanged()
  return mapping
}

export async function deleteTopLevelFolderSyncMapping(folderId: string): Promise<boolean> {
  const existed = await db.transaction(
    'rw',
    [
      db.folderSyncMappings,
      db.folders,
      db.projects,
      db.projectFileBaselines,
      db.projectFileTombstones,
      db.folderSyncPending,
    ],
    async () => {
      const folder = await db.folders.get(folderId)
      if (!folder || folder.parentId !== null) return false
      if (!(await db.folderSyncMappings.get(folderId))) return false
      const folders = await db.folders.toArray()
      const subtreeIds = collectFolderSubtreeIds(folders, folderId)
      const projects = await db.projects
        .where('folderId')
        .anyOf([...subtreeIds])
        .toArray()
      const updatedAt = nowIso()
      if (projects.length > 0) {
        await db.projects.bulkPut(
          projects.map((project) => ({
            ...detachProjectFromFolderSyncSource(project),
            updatedAt,
          })),
        )
        await db.projectFileBaselines.bulkDelete(projects.map((project) => project.id))
      }
      await db.projectFileTombstones.where('rootFolderId').equals(folderId).delete()
      // Unmapping explicitly detaches this subtree from filesystem sync. Its
      // construct data remains in the Database and will be re-queued if mapped again.
      await db.folderSyncPending.where('rootFolderId').equals(folderId).delete()
      await db.folderSyncMappings.delete(folderId)
      return true
    },
  )
  if (existed) notifyLibraryChanged()
  return existed
}

export async function setFolderSyncMappingLastSyncedAt(
  folderId: string,
  lastSyncedAt: string,
): Promise<StoredFolderSyncMapping | null> {
  const resolved = await resolveFolderSyncMapping(folderId)
  if (!resolved) return null
  const next = {
    ...resolved.mapping,
    lastSyncedAt,
    updatedAt: nowIso(),
  }
  await db.folderSyncMappings.put(next)
  return next
}

export async function createFolder(name: string, parentId: string | null = null): Promise<StoredFolder> {
  const trimmed = name.trim() || 'Untitled folder'
  const folder: StoredFolder = {
    id: createId('folder'),
    name: trimmed,
    parentId,
    updatedAt: nowIso(),
  }
  await db.folders.put(folder)
  return folder
}

/** Find a child folder by name (case-insensitive), or create it. */
export async function ensureChildFolder(
  name: string,
  parentId: string | null = null,
): Promise<StoredFolder> {
  const trimmed = name.trim() || 'Untitled folder'
  const siblings = (await listFolders()).filter((folder) => (folder.parentId ?? null) === parentId)
  const existing = siblings.find((folder) => folder.name.toLowerCase() === trimmed.toLowerCase())
  if (existing) return existing
  return createFolder(trimmed, parentId)
}

export async function renameFolder(id: string, name: string): Promise<StoredFolder | null> {
  const trimmed = name.trim()
  let changed = false
  const next = await db.transaction(
    'rw',
    [
      db.folders,
      db.folderSyncMappings,
      db.projects,
      db.projectFileBaselines,
      db.projectFileTombstones,
      db.folderSyncPending,
    ],
    async () => {
      const folder = await db.folders.get(id)
      if (!folder || !trimmed || folder.name === trimmed) return folder ?? null
      const updatedAt = nowIso()
      const renamed = { ...folder, name: trimmed, updatedAt }
      const folders = await db.folders.toArray()
      const oldRoot = resolveTopLevelFolder(folders, folder.id)
      const oldRootIsMapped = oldRoot
        ? Boolean(await db.folderSyncMappings.get(oldRoot.id))
        : false
      const pathChangesInsideMappedRoot = folder.parentId !== null && oldRootIsMapped
      if (pathChangesInsideMappedRoot) {
        const prepared = await prepareSubtreePathMutation({
          folders,
          subtreeRootId: folder.id,
          oldRootFolderId: oldRoot?.id ?? null,
          oldRootIsMapped,
          updatedAt,
        })
        if (prepared.projects.length > 0) await db.projects.bulkPut(prepared.projects)
        if (oldRoot) {
          await db.folderSyncPending.bulkDelete(
            prepared.projects.map((project) => `${oldRoot.id}\0${project.id}`),
          )
        }
        if (prepared.projectIds.length > 0) {
          await db.projectFileBaselines.bulkDelete(prepared.projectIds)
        }
        if (prepared.tombstones.length > 0) {
          await db.projectFileTombstones.bulkPut(prepared.tombstones)
        }
        if (oldRootIsMapped && oldRoot) {
          await db.folderSyncPending.bulkPut(prepared.projects.map((project) => ({
            id: `${oldRoot.id}\0${project.id}`,
            rootFolderId: oldRoot.id,
            projectId: project.id,
            queuedAt: updatedAt,
          })))
        }
      }
      await db.folders.put(renamed)
      changed = true
      return renamed
    },
  )
  if (changed) notifyLibraryChanged()
  return next
}

/** Rename a saved construct in both the summary index and the sequence body. */
export async function renameProject(id: string, name: string): Promise<StoredProjectSummary | null> {
  if (isSessionDraftId(id)) return null
  const trimmed = name.trim()
  if (!trimmed) return null
  const [summary, body] = await Promise.all([db.projects.get(id), db.projectRecords.get(id)])
  if (!summary || !body?.record) return null
  const requestedFormat = inferProjectFileFormat(trimmed)
  const currentFormat =
    summary.fileFormat ?? inferProjectFileFormat(summary.fileName ?? summary.name)
  if (requestedFormat !== 'unknown' && requestedFormat !== currentFormat) {
    throw new Error(
      `Rename cannot change the stored file format from ${currentFormat} to ${requestedFormat}.`,
    )
  }
  const updatedAt = nowIso()
  const nextSummary = { ...summary, name: trimmed, updatedAt }
  const nextRecord = { ...body.record, name: trimmed, updatedAt }
  await db.transaction('rw', [db.projects, db.projectRecords, db.folders, db.folderSyncMappings, db.folderSyncPending], async () => {
    await db.projects.put(nextSummary)
    await db.projectRecords.put({ id, record: nextRecord })
    const [folders, mappings] = await Promise.all([db.folders.toArray(), db.folderSyncMappings.toArray()])
    const pending = pendingRowForProject(nextSummary, folders, new Set(mappings.map((row) => row.folderId)), updatedAt)
    if (pending) await db.folderSyncPending.put(pending)
  })
  return nextSummary
}

/**
 * Rename the Database file basename (`fileName`) without changing the construct name.
 * Keeps the stored format; updates blobs/baselines and the basename of syncRelativePath.
 */
export async function renameProjectFileName(
  id: string,
  nextFileName: string,
  nextConstructName?: string,
): Promise<StoredProjectSummary | null> {
  if (isSessionDraftId(id)) return null
  const summary = await db.projects.get(id)
  if (!summary) return null

  const fileName = normalizeProjectFileName(nextFileName, summary.name, summary.molecule)
  if (!fileName.trim()) return null
  const constructName = nextConstructName?.trim() || summary.name

  const currentFileName = normalizeProjectFileName(
    summary.fileName ?? summary.syncRelativePath,
    summary.name,
    summary.molecule,
  )
  if (
    fileName.normalize('NFC').toLowerCase() === currentFileName.normalize('NFC').toLowerCase()
    && constructName === summary.name
  ) {
    return summary
  }

  const requestedFormat = inferProjectFileFormat(fileName)
  const currentFormat = summary.fileFormat ?? inferProjectFileFormat(currentFileName)
  if (requestedFormat !== 'unknown' && requestedFormat !== currentFormat) {
    throw new Error(
      `Rename cannot change the stored file format from ${currentFormat} to ${requestedFormat}.`,
    )
  }

  const folderId = summary.folderId ?? null
  const siblings = (await db.projects.toArray()).filter(
    (project) => project.id !== id && (project.folderId ?? null) === folderId,
  )
  const conflict = siblings.some((project) => {
    const siblingName = normalizeProjectFileName(
      project.fileName ?? project.syncRelativePath,
      project.name,
      project.molecule,
    )
    return siblingName.normalize('NFC').toLowerCase() === fileName.normalize('NFC').toLowerCase()
  })
  if (conflict) {
    throw new Error(`A file named “${fileName}” already exists in that folder.`)
  }

  const updatedAt = nowIso()
  const nextSummary: StoredProjectSummary = detachProjectFromFolderSyncSource({
    ...summary,
    name: constructName,
    fileName,
    fileFormat: requestedFormat === 'unknown' ? currentFormat : requestedFormat,
    updatedAt,
  })

  await db.transaction(
    'rw',
    [db.projects, db.projectRecords, db.projectFileBlobs, db.projectFileBaselines,
      db.folders, db.folderSyncMappings, db.folderSyncPending, db.projectFileTombstones],
    async () => {
      await db.projects.put(nextSummary)
      if (nextConstructName !== undefined) {
        const body = await db.projectRecords.get(id)
        if (body?.record) {
          await db.projectRecords.put({
            id,
            record: { ...body.record, name: constructName, updatedAt },
          })
        }
      }
      const blob = await db.projectFileBlobs.get(id)
      if (blob) {
        await db.projectFileBlobs.put({
          ...blob,
          fileName,
          fileFormat: nextSummary.fileFormat ?? blob.fileFormat,
          updatedAt,
        })
      }
      const baseline = await db.projectFileBaselines.get(id)
      if (baseline) {
        const oldPath = baseline.relativePath ?? summary.syncRelativePath
        const folders = await db.folders.toArray()
        const root = resolveTopLevelFolder(folders, summary.folderId)
        if (oldPath && root && await db.folderSyncMappings.get(root.id)) {
          await db.projectFileTombstones.put({
            id: createId('tombstone'), rootFolderId: root.id,
            relativePath: oldPath, fileName: baseline.fileName,
            fileFormat: baseline.fileFormat, deletedAt: updatedAt,
            projectId: id, contentHash: baseline.contentHash, reason: 'path-change',
          })
        }
        await db.projectFileBaselines.delete(id)
      }
      const [folders, mappings] = await Promise.all([db.folders.toArray(), db.folderSyncMappings.toArray()])
      const pending = pendingRowForProject(nextSummary, folders, new Set(mappings.map((row) => row.folderId)), updatedAt)
      if (pending) await db.folderSyncPending.put(pending)
    },
  )

  if (summary.fileSyncState === 'local-only' || !summary.fileSyncState) {
    try {
      const folders = await db.folders.toArray()
      const root = resolveTopLevelFolder(folders, folderId)
      const rootFolderId = root?.id ?? 'unfiled'
      const hasExternalMapping = root
        ? Boolean(await db.folderSyncMappings.get(root.id))
        : false
      if (!hasExternalMapping) {
        const oldPath = `${id}/${currentFileName}`
        const newPath = `${id}/${fileName}`
        const bytes = await readManagedDatabaseFile(rootFolderId, oldPath)
        if (bytes) {
          await writeManagedDatabaseFile(rootFolderId, newPath, bytes)
          if (oldPath !== newPath) {
            await deleteManagedDatabaseFile(rootFolderId, oldPath)
          }
        }
      }
    } catch (error) {
      console.warn('Could not rename managed database mirror', error)
    }
  }

  notifyLibraryChanged()
  return nextSummary
}

export async function moveFolder(id: string, parentId: string | null): Promise<StoredFolder | null> {
  if (id === parentId) return null
  let changed = false
  const next = await db.transaction(
    'rw',
    [
      db.folders,
      db.folderSyncMappings,
      db.projects,
      db.projectFileBaselines,
      db.projectFileTombstones,
      db.folderSyncPending,
    ],
    async () => {
      const folder = await db.folders.get(id)
      if (!folder) return null
      if (folder.parentId === parentId) return folder
      const folders = await db.folders.toArray()
      const byId = new Map(folders.map((candidate) => [candidate.id, candidate]))
      if (parentId && !byId.has(parentId)) throw new Error('Destination folder not found')
      if (parentId) {
        // Prevent cycles: parentId must not be this folder or a descendant.
        let cursor: string | null = parentId
        while (cursor) {
          if (cursor === id) return null
          cursor = byId.get(cursor)?.parentId ?? null
        }
      }
      const ownsMapping = Boolean(await db.folderSyncMappings.get(id))
      assertFolderMappingAllowsMove(folder, parentId, ownsMapping)
      const oldRoot = resolveTopLevelFolder(folders, folder.id)
      const targetRoot = parentId ? resolveTopLevelFolder(folders, parentId) : null
      const [oldRootIsMapped, targetRootIsMapped] = await Promise.all([
        oldRoot ? db.folderSyncMappings.get(oldRoot.id).then(Boolean) : false,
        targetRoot ? db.folderSyncMappings.get(targetRoot.id).then(Boolean) : false,
      ])
      const updatedAt = nowIso()
      const moved = { ...folder, parentId, updatedAt }
      if (oldRootIsMapped || targetRootIsMapped) {
        const prepared = await prepareSubtreePathMutation({
          folders,
          subtreeRootId: folder.id,
          oldRootFolderId: oldRoot?.id ?? null,
          oldRootIsMapped,
          updatedAt,
        })
        if (prepared.projects.length > 0) await db.projects.bulkPut(prepared.projects)
        if (prepared.projectIds.length > 0) {
          await db.projectFileBaselines.bulkDelete(prepared.projectIds)
        }
        if (prepared.tombstones.length > 0) {
          await db.projectFileTombstones.bulkPut(prepared.tombstones)
        }
        if (oldRootIsMapped && oldRoot && oldRoot.id !== targetRoot?.id) {
          await db.folderSyncPending.bulkDelete(prepared.projects.map((project) => `${oldRoot.id}\0${project.id}`))
        }
        if (targetRootIsMapped && targetRoot) {
          await db.folderSyncPending.bulkPut(prepared.projects.map((project) => ({
            id: `${targetRoot.id}\0${project.id}`,
            rootFolderId: targetRoot.id,
            projectId: project.id,
            queuedAt: updatedAt,
          })))
        }
      }
      await db.folders.put(moved)
      changed = true
      return moved
    },
  )
  if (changed) notifyLibraryChanged()
  return next
}

/** Delete a folder and its complete database subtree without touching external disk folders. */
export async function deleteFolder(id: string): Promise<void> {
  const [folder, folders] = await Promise.all([
    db.folders.get(id),
    db.folders.toArray(),
  ])
  if (!folder) return

  const subtreeIds = collectFolderSubtreeIds(folders, id)
  const projects = await db.projects.where('folderId').anyOf([...subtreeIds]).toArray()

  // Use the established project deletion path so mapped source files receive
  // tombstones and are not re-imported on the next folder sync.
  for (const project of projects) {
    await deleteProject(project.id)
  }

  await db.transaction('rw', [db.folders, db.folderSyncMappings, db.folderSyncPending], async () => {
    await db.folders.bulkDelete([...subtreeIds])
    await db.folderSyncMappings.delete(id)
    // Project deletion clears project-specific pending rows; this also removes
    // any stale queue entries left for the deleted folder's sync root.
    await db.folderSyncPending.where('rootFolderId').equals(id).delete()
  })
  notifyLibraryChanged()
}

export async function moveProjectToFolder(
  projectId: string,
  folderId: string | null,
): Promise<StoredProjectSummary | null> {
  if (isSessionDraftId(projectId)) return null
  const moved = await moveProjectRowsToFolder([projectId], folderId)
  return moved[0] ?? (await db.projects.get(projectId)) ?? null
}

export async function moveProjectsToFolder(projectIds: string[], folderId: string | null): Promise<number> {
  return (await moveProjectRowsToFolder(projectIds, folderId)).length
}

async function moveProjectRowsToFolder(
  projectIds: readonly string[],
  folderId: string | null,
): Promise<StoredProjectSummary[]> {
  const ids = [...new Set(projectIds)].filter((id) => !isSessionDraftId(id))
  if (ids.length === 0) return []
  const moved = await db.transaction(
    'rw',
    [
      db.folders,
      db.folderSyncMappings,
      db.projects,
      db.projectFileBaselines,
      db.projectFileTombstones,
      db.folderSyncPending,
    ],
    async () => {
      const folders = await db.folders.toArray()
      if (folderId && !folders.some((folder) => folder.id === folderId)) {
        throw new Error('Destination folder not found')
      }
      const [projects, mappings, baselines] = await Promise.all([
        db.projects.bulkGet(ids),
        db.folderSyncMappings.toArray(),
        db.projectFileBaselines.bulkGet(ids),
      ])
      const mappedRootIds = new Set(mappings.map((mapping) => mapping.folderId))
      const updatedAt = nowIso()
      const nextProjects: StoredProjectSummary[] = []
      const movedProjectIds: string[] = []
      const tombstones: StoredProjectFileTombstone[] = []
      const pendingRows: NonNullable<ReturnType<typeof pendingRowForProject>>[] = []
      const stalePendingIds: string[] = []
      projects.forEach((project, index) => {
        if (!project || (project.folderId ?? null) === folderId) return
        const oldRoot = resolveTopLevelFolder(folders, project.folderId)
        const newRoot = resolveTopLevelFolder(folders, folderId)
        const prepared = prepareProjectPathMutation({
          project,
          baseline: baselines[index] ?? null,
          oldRootFolderId: oldRoot?.id ?? null,
          oldRootIsMapped: oldRoot ? mappedRootIds.has(oldRoot.id) : false,
          updatedAt,
          tombstoneId: createId('tombstone'),
        })
        nextProjects.push({ ...prepared.project, folderId })
        const pending = pendingRowForProject({ ...prepared.project, folderId }, folders, mappedRootIds, updatedAt)
        if (pending) pendingRows.push(pending)
        if (oldRoot && oldRoot.id !== newRoot?.id && mappedRootIds.has(oldRoot.id)) {
          stalePendingIds.push(`${oldRoot.id}\0${project.id}`)
        }
        movedProjectIds.push(project.id)
        if (prepared.tombstone) tombstones.push(prepared.tombstone)
      })
      if (nextProjects.length > 0) await db.projects.bulkPut(nextProjects)
      if (movedProjectIds.length > 0) {
        await db.projectFileBaselines.bulkDelete(movedProjectIds)
      }
      if (stalePendingIds.length > 0) await db.folderSyncPending.bulkDelete(stalePendingIds)
      if (tombstones.length > 0) await db.projectFileTombstones.bulkPut(tombstones)
      if (pendingRows.length > 0) await db.folderSyncPending.bulkPut(pendingRows)
      return nextProjects
    },
  )
  if (moved.length > 0) notifyLibraryChanged()
  return moved
}

export async function setProjectTags(
  projectId: string,
  tags: string[],
): Promise<StoredProjectSummary | null> {
  if (isSessionDraftId(projectId)) return null
  const project = await db.projects.get(projectId)
  if (!project) return null
  const cleaned = normalizeTags(tags)
  const next = normalizeStoredProjectSummary({ ...project, tags: cleaned, updatedAt: nowIso() })
  await db.projects.put(next)
  notifyLibraryChanged()
  return next
}

export async function setProjectsTags(projectIds: string[], tags: string[]): Promise<number> {
  let updated = 0
  for (const projectId of projectIds) {
    const result = await setProjectTags(projectId, tags)
    if (result) updated += 1
  }
  return updated
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ')
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result.sort((a, b) => a.localeCompare(b))
}

/** Tags present on every project in the list (case-insensitive intersection, canonical casing from first). */
export function commonTags(projects: StoredProjectSummary[]): string[] {
  if (projects.length === 0) return []
  const [first, ...rest] = projects
  const intersection = new Map((first.tags ?? []).map((tag) => [tag.toLowerCase(), tag]))
  for (const project of rest) {
    const keys = new Set((project.tags ?? []).map((tag) => tag.toLowerCase()))
    for (const key of [...intersection.keys()]) {
      if (!keys.has(key)) intersection.delete(key)
    }
  }
  return [...intersection.values()].sort((a, b) => a.localeCompare(b))
}

export function collectAllTags(projects: StoredProjectSummary[]): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const project of projects) {
    for (const tag of project.tags ?? []) {
      const key = tag.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      tags.push(tag)
    }
  }
  return tags.sort((a, b) => a.localeCompare(b))
}

export type FolderTreeNode = StoredFolder & { children: FolderTreeNode[] }

export function buildFolderTree(folders: StoredFolder[]): FolderTreeNode[] {
  const byParent = new Map<string | null, StoredFolder[]>()
  for (const folder of folders) {
    const key = folder.parentId
    const list = byParent.get(key) ?? []
    list.push(folder)
    byParent.set(key, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }
  function build(parentId: string | null): FolderTreeNode[] {
    return (byParent.get(parentId) ?? []).map((folder) => ({
      ...folder,
      children: build(folder.id),
    }))
  }
  return build(null)
}

export function folderPathLabel(folders: StoredFolder[], folderId: string | null | undefined): string {
  if (!folderId) return 'Unfiled'
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const parts: string[] = []
  let cursor: string | null | undefined = folderId
  const guard = new Set<string>()
  while (cursor && !guard.has(cursor)) {
    guard.add(cursor)
    const folder = byId.get(cursor)
    if (!folder) break
    parts.unshift(folder.name)
    cursor = folder.parentId
  }
  return parts.length ? parts.join(' / ') : 'Unfiled'
}
