import { useCallback } from 'react'
import { applySaveFileNameToStubLibraryName } from '../../domain/dnaLibrary'
import { withPackedLibraryMemberFeatures } from '../../domain/libraryMemberFeatures'
import { chooseDatabaseCopyFileName, prepareDatabaseProjectSave, projectFileStem, snapGeneExtensionForMolecule, snapGeneFormatForMolecule, workspaceSaveDisposition } from '../../domain/projectSaveSemantics'
import type { ProjectFileFormat, ProjectFileSerializeOptions } from '../../domain/fileFormats'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { StoredProject, StoredProjectSummary, SaveProjectExtras } from '../../application/ports/projectPersistence'
import type { DisplaySettings } from '../sequence'
import { createId, nowIso } from '../../domain/sequence'
import type { WorkspaceDocumentOrigin } from '../../domain/workspaceDocumentOrigin'
import { saveLibraryMemberToParent } from '../../application/libraryMemberSave/saveLibraryMemberToParent'

export type DatabasePersistenceOptions = {
  record: SequenceRecord
  projects: StoredProjectSummary[]
  displaySettings: DisplaySettings
  libraryFolderId: string | null | undefined
  documentSaveBinding: 'disk' | 'database' | 'new'
  documentOrigin: WorkspaceDocumentOrigin
  traceDocument: boolean
  workspaceDiskPath: string | null
  databaseSaveBusy: boolean
  nativeFormatSaveProject: StoredProjectSummary | null
  databaseSaveAsCopyRef: { current: boolean }
  pendingSaveCompletionRef: { current: (() => void | Promise<void>) | null }
  traceFilesForSave: () => TraceFileRecord[]
  onTraceFilesChange: (traces: TraceFileRecord[]) => void
  setRecord: (record: SequenceRecord) => void
  setTraceFiles: (recordId: string, traces: TraceFileRecord[]) => void
  setLibraryFolderId: (folderId: string | null | undefined) => void
  setWorkspaceDiskPath: (path: string | null) => void
  setDocumentOrigin: (origin: WorkspaceDocumentOrigin) => void
  setRenameFileDialogOpen: (open: boolean) => void
  setSaveToDialogOpen: (open: boolean) => void
  setNativeFormatSaveProject: (project: StoredProjectSummary | null) => void
  setDatabaseSaveBusy: (busy: boolean) => void
  markClean: (record: SequenceRecord, traces: TraceFileRecord[]) => void
  refreshProjects: () => Promise<void>
  touchRecentDatabaseProject: (id: string, name: string) => void
  touchRecentLocalFile: (path: string, fileName: string) => void
  setStatus: (status: string) => void
  getProject: (id: string) => Promise<StoredProject | null>
  listProjectSummaries: () => Promise<StoredProjectSummary[]>
  listFolders: () => Promise<Array<{ id: string; name: string; parentId?: string | null }>>
  folderPathLabel: (folders: Array<{ id: string; name: string; parentId?: string | null }>, folderId: string) => string
  saveProject: (record: SequenceRecord, options: SaveProjectExtras) => Promise<SequenceRecord>
  renameProjectFileName: (id: string, fileName: string) => Promise<{ fileName?: string } | null>
  renameDesktopFile: (path: string, fileName: string) => Promise<string>
  normalizeProjectFileName: (fileName: string | null | undefined, fallbackName: string, molecule: SequenceRecord['molecule']) => string
  customMwLadders: () => NonNullable<StoredProjectSummary['customMwLadders']>
  serializeProjectFile: (format: ProjectFileFormat, record: SequenceRecord, options?: ProjectFileSerializeOptions) => { ok: true; bytes: Uint8Array } | { ok: false; error: string }
  snapGeneExportOptions: (displaySettings: DisplaySettings, record: SequenceRecord) => ProjectFileSerializeOptions['snapGene']
  actionProfileAsync: <T>(name: string, category: string, run: () => Promise<T>, detail: string) => Promise<T>
  saveDiskFile: (options?: { forceDialog?: boolean }) => Promise<boolean>
  isNativeDesktop: () => boolean
  writeHybridPayload: (surface: string, payload: unknown) => void
  notifyHybridPayloadUpdated: (surface: string) => Promise<void> | void
}

/** Owns database save/copy/native-format/rename coordination; persistence APIs are ports. */
export function useDatabasePersistenceController(options: DatabasePersistenceOptions) {
  const { pendingSaveCompletionRef, databaseSaveAsCopyRef } = options
  const completeDatabaseSave = useCallback(async () => {
    const completion = pendingSaveCompletionRef.current
    pendingSaveCompletionRef.current = null
    if (completion) await completion()
  }, [pendingSaveCompletionRef])

  const cancelDatabaseSaveFlow = useCallback(() => {
    options.setSaveToDialogOpen(false)
    options.setNativeFormatSaveProject(null)
    databaseSaveAsCopyRef.current = false
    pendingSaveCompletionRef.current = null
  }, [options, databaseSaveAsCopyRef, pendingSaveCompletionRef])

  const finalizeSavedDatabaseRecord = useCallback(async (
    savedRecord: SequenceRecord,
    tracesForSave: TraceFileRecord[],
    folderId: string | null,
    message: string,
  ) => {
    await options.refreshProjects()
    options.setLibraryFolderId(folderId)
    options.setWorkspaceDiskPath(null)
    options.setDocumentOrigin({ kind: 'database', projectId: savedRecord.id, folderId })
    options.setSaveToDialogOpen(false)
    options.setNativeFormatSaveProject(null)
    options.setTraceFiles(savedRecord.id, tracesForSave)
    options.setRecord(savedRecord)
    options.markClean(savedRecord, tracesForSave)
    options.touchRecentDatabaseProject(savedRecord.id, savedRecord.name)
    if (options.isNativeDesktop()) {
      options.writeHybridPayload('database', { currentRecordId: savedRecord.id })
      void options.notifyHybridPayloadUpdated('database')
    }
    options.setStatus(message)
    await completeDatabaseSave()
  }, [options, completeDatabaseSave])

  const saveSnapGeneToDatabaseFolder = useCallback(async (
    folderId: string | null,
    existing: StoredProjectSummary | null,
    preferredFileName?: string | null,
    saveOptions?: { asCopy?: boolean },
  ) => {
    const tracesForSave = options.traceFilesForSave()
    const namedRecord = applySaveFileNameToStubLibraryName(options.record, preferredFileName)
    const copyRequested = saveOptions?.asCopy === true && Boolean(existing)
    const copyTimestamp = nowIso()
    const recordForSave = copyRequested
      ? { ...namedRecord, id: createId('project'), createdAt: copyTimestamp, updatedAt: copyTimestamp }
      : namedRecord
    const exportRecord = withPackedLibraryMemberFeatures({ ...recordForSave, traceFiles: tracesForSave }, tracesForSave)
    const format = snapGeneFormatForMolecule(exportRecord.molecule)
    const extension = snapGeneExtensionForMolecule(exportRecord.molecule)
    const serialized = options.serializeProjectFile(format, exportRecord, {
      snapGene: options.snapGeneExportOptions(options.displaySettings, exportRecord),
    })
    if (!serialized.ok) throw new Error(serialized.error)
    const summaries = await options.listProjectSummaries()
    const occupied = summaries
      .filter((project) => project.id !== recordForSave.id && (project.folderId ?? null) === folderId)
      .map((project) => project.fileName ?? `${project.name}.${extension}`)
    let requestedName = preferredFileName?.trim()
      ? options.normalizeProjectFileName(preferredFileName, namedRecord.name, namedRecord.molecule)
      : null
    if (requestedName) {
      const normalizedRequestedName = requestedName.normalize('NFC').toLowerCase()
      const taken = occupied.some((name) => name.normalize('NFC').toLowerCase() === normalizedRequestedName)
      if (taken) {
        const originalName = existing?.fileName
        const isSameNameAsSource = copyRequested && (existing?.folderId ?? null) === folderId && Boolean(originalName)
          && originalName!.normalize('NFC').toLowerCase() === normalizedRequestedName
        if (isSameNameAsSource) requestedName = null
        else throw new Error(`A file named “${requestedName}” already exists in that folder.`)
      }
    }
    const fileName = requestedName ?? (copyRequested ? undefined : existing?.fileName) ?? chooseDatabaseCopyFileName(
      `${projectFileStem(namedRecord.name)}.${extension}`,
      occupied,
      extension,
    )
    let savedRecord = recordForSave
    await options.actionProfileAsync('saveProject', 'persistence', async () => {
      savedRecord = await options.saveProject(exportRecord, {
        customMwLadders: options.customMwLadders(),
        folderId,
        ...(copyRequested && existing?.tags ? { tags: existing.tags } : {}),
        fileName,
        fileFormat: format,
        fileBytes: serialized.bytes,
        ...(existing && !copyRequested ? {} : {
          syncSourceHash: null,
          syncRelativePath: null,
          fileSyncState: 'local-only',
          fileProvenance: 'created',
          baseline: null,
        }),
      })
    }, `${recordForSave.sequence.length} bp · ${tracesForSave.length} traces`)
    const folders = await options.listFolders()
    const location = folderId ? options.folderPathLabel(folders, folderId) : 'Unfiled'
    await finalizeSavedDatabaseRecord(
      savedRecord,
      tracesForSave,
      folderId,
      copyRequested
        ? `Saved ${fileName} as a new database copy (${location}); the original was unchanged.`
        : `Saved ${fileName} to database (${location}).`,
    )
  }, [options, finalizeSavedDatabaseRecord])

  const saveNativeFormatDecision = useCallback(async (decision: 'copy' | 'overwrite') => {
    const existing = options.nativeFormatSaveProject
    if (!existing || options.databaseSaveBusy) return
    options.setDatabaseSaveBusy(true)
    try {
      const tracesForSave = options.traceFilesForSave()
      const exportRecord = withPackedLibraryMemberFeatures({ ...options.record, traceFiles: tracesForSave }, tracesForSave)
      const summaries = await options.listProjectSummaries()
      const timestamp = nowIso()
      const freshProjectId = createId('project')
      const extension = snapGeneExtensionForMolecule(exportRecord.molecule)
      const copyFormat = snapGeneFormatForMolecule(exportRecord.molecule)
      const copyFileName = chooseDatabaseCopyFileName(
        existing.fileName ?? `${projectFileStem(existing.name)}.${extension}`,
        summaries.filter((project) => (project.folderId ?? null) === (existing.folderId ?? null)).map((project) => project.fileName ?? `${project.name}.${extension}`),
        extension,
      )
      const recordForSerialization = decision === 'copy' ? { ...exportRecord, id: freshProjectId, createdAt: timestamp, updatedAt: timestamp } : exportRecord
      const format = decision === 'copy' ? copyFormat : (existing.fileFormat ?? 'unknown') as ProjectFileFormat
      const serialized = options.serializeProjectFile(format, recordForSerialization, {
        snapGene: decision === 'copy' ? options.snapGeneExportOptions(options.displaySettings, recordForSerialization) : undefined,
      })
      if (!serialized.ok) throw new Error(serialized.error)
      const prepared = prepareDatabaseProjectSave({
        record: exportRecord,
        existing,
        decision,
        bytes: serialized.bytes,
        copyFileName,
        copyFileFormat: copyFormat,
        freshProjectId,
        createdAt: timestamp,
      })
      const savedRecord = await options.saveProject(prepared.record, {
        customMwLadders: options.customMwLadders(),
        folderId: prepared.folderId,
        tags: prepared.tags,
        fileName: prepared.fileName,
        fileFormat: prepared.fileFormat,
        fileBytes: prepared.fileBytes,
        fileSyncState: prepared.fileSyncState,
        fileProvenance: prepared.fileProvenance,
        ...(prepared.clearSourceMetadata ? { syncSourceHash: null, syncRelativePath: null, baseline: null } : {}),
      })
      await finalizeSavedDatabaseRecord(savedRecord, tracesForSave, prepared.folderId, decision === 'copy'
        ? `Saved ${prepared.fileName} as a new database copy; ${existing.fileName ?? existing.name} was unchanged.`
        : `Saved changes to ${prepared.fileName}; folder sync will update the external file.`)
    } catch (error) {
      options.setStatus(`Could not save: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      databaseSaveAsCopyRef.current = false
      options.setDatabaseSaveBusy(false)
    }
  }, [options, databaseSaveAsCopyRef, finalizeSavedDatabaseRecord])

  const handleSaveToFolder = useCallback(async (folderId: string | null, preferredFileName?: string | null) => {
    try {
      const existing = await options.getProject(options.record.id)
      if (workspaceSaveDisposition(existing) === 'choose-native-save') {
        options.setSaveToDialogOpen(false)
        options.setNativeFormatSaveProject(existing)
        return
      }
      options.setDatabaseSaveBusy(true)
      await saveSnapGeneToDatabaseFolder(folderId, existing, preferredFileName, { asCopy: databaseSaveAsCopyRef.current })
      databaseSaveAsCopyRef.current = false
    } catch (error) {
      databaseSaveAsCopyRef.current = false
      pendingSaveCompletionRef.current = null
      options.setStatus(`Could not save: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      options.setDatabaseSaveBusy(false)
    }
  }, [options, databaseSaveAsCopyRef, pendingSaveCompletionRef, saveSnapGeneToDatabaseFolder])

  const handleSaveToDatabase = useCallback(() => {
    if (options.traceDocument) {
      options.setStatus('Trace documents are read-only. Open as sequence before saving.')
      return
    }
    databaseSaveAsCopyRef.current = true
    options.setSaveToDialogOpen(true)
  }, [options, databaseSaveAsCopyRef])

  const currentDocumentFileName = useCallback(() => {
    const extension = snapGeneExtensionForMolecule(options.record.molecule)
    if (options.documentSaveBinding === 'disk' && options.workspaceDiskPath) {
      const parts = options.workspaceDiskPath.replace(/\\/g, '/').split('/')
      return parts[parts.length - 1] || `${options.record.name}.${extension}`
    }
    const existing = options.projects.find((project) => project.id === options.record.id)
    return existing?.fileName
      ? options.normalizeProjectFileName(existing.fileName, options.record.name, options.record.molecule)
      : options.normalizeProjectFileName(null, options.record.name, options.record.molecule)
  }, [options])

  const canRenameCurrentFile = useCallback(() => {
    if (options.documentSaveBinding === 'disk') return Boolean(options.workspaceDiskPath)
    if (options.documentSaveBinding === 'database') return options.projects.some((project) => project.id === options.record.id)
    return false
  }, [options])

  const handleRenameFile = useCallback(async (nextFileName: string) => {
    const normalized = options.normalizeProjectFileName(nextFileName, options.record.name, options.record.molecule)
    if (options.documentSaveBinding === 'disk' && options.workspaceDiskPath) {
      const nextPath = await options.renameDesktopFile(options.workspaceDiskPath, normalized)
      options.setWorkspaceDiskPath(nextPath)
      options.touchRecentLocalFile(nextPath, normalized)
      options.setRenameFileDialogOpen(false)
      options.setStatus(`Renamed file to “${normalized}”.`)
      return
    }
    if (options.documentSaveBinding !== 'database') throw new Error('Save the file to the database before renaming it.')
    const renamed = await options.renameProjectFileName(options.record.id, normalized)
    await options.refreshProjects()
    options.setRenameFileDialogOpen(false)
    options.setStatus(`Renamed file to “${renamed?.fileName ?? normalized}”. Construct name remains “${options.record.name}”.`)
  }, [options])

  const handleSave = useCallback(async (afterSave?: () => void | Promise<void>) => {
    if (options.traceDocument) {
      options.setStatus('Trace documents are read-only. Open as sequence before saving.')
      return
    }
    if (afterSave) pendingSaveCompletionRef.current = afterSave
    try {
      if (options.documentOrigin.kind === 'library-member') {
        options.setDatabaseSaveBusy(true)
        const saved = await saveLibraryMemberToParent(options.record, options.documentOrigin, {
          getProject: options.getProject,
          saveProject: options.saveProject,
        })
        options.setDocumentOrigin(saved.origin)
        const traces = options.traceFilesForSave()
        options.markClean(options.record, traces)
        await options.refreshProjects()
        options.setStatus(`Saved “${options.record.name}” back to its DNA library.`)
        await completeDatabaseSave()
        return
      }
      if (options.isNativeDesktop() && options.documentSaveBinding !== 'database') {
        const saved = await options.saveDiskFile()
        if (!saved) pendingSaveCompletionRef.current = null
        return
      }
      const existing = await options.getProject(options.record.id)
      const disposition = workspaceSaveDisposition(existing)
      if (disposition === 'choose-database-folder') {
        databaseSaveAsCopyRef.current = false
        options.setSaveToDialogOpen(true)
        options.setStatus('Choose where to save this construct in the database.')
        return
      }
      if (disposition === 'choose-native-save') {
        options.setNativeFormatSaveProject(existing)
        return
      }
      if (!existing) throw new Error('Database project metadata is unavailable.')
      databaseSaveAsCopyRef.current = false
      await handleSaveToFolder(existing.folderId ?? null)
    } catch (error) {
      pendingSaveCompletionRef.current = null
      options.setStatus(`Could not save: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (options.documentOrigin.kind === 'library-member') options.setDatabaseSaveBusy(false)
    }
  }, [options, databaseSaveAsCopyRef, pendingSaveCompletionRef, handleSaveToFolder, completeDatabaseSave])

  const resolvedLibraryFolderId = useCallback(() => {
    if (options.libraryFolderId !== undefined) return options.libraryFolderId
    const existing = options.projects.find((project) => project.id === options.record.id)
    return existing ? existing.folderId ?? null : undefined
  }, [options])

  return { completeDatabaseSave, cancelDatabaseSaveFlow, saveNativeFormatDecision, handleSaveToFolder, handleSaveToDatabase, currentDocumentFileName, canRenameCurrentFile, handleRenameFile, handleSave, resolvedLibraryFolderId }
}
