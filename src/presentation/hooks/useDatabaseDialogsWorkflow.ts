import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import type { ComponentProps } from 'react'
import {
  remoteSequenceImportStatusMessage,
  remoteSequenceProviderDisplayName,
} from '../../application/databaseLibrary/remoteSequenceImportPresentation'
import type {
  DatabaseAlignmentConstruct,
  DatabaseAlignmentPick,
  DatabaseLibraryMemberPick,
} from '../../application/ports/hybridWindows'
import type { StoredProjectSummary } from '../../application/ports/projectPersistence'
import type { DatabaseManagerDialog } from '../../DatabaseManagerDialog'
import type { SequenceDatabaseImportDialog } from '../../SequenceDatabaseImportDialog'
import type { HybridWindowResult } from '../../application/ports/hybridWindows'
import type { LibraryPrimer } from '../../domain/libraryPrimer'
import type { SequenceRecord } from '../../domain/types'

type HybridDatabasePrimerPayload = Extract<
  HybridWindowResult,
  { kind: 'database'; type: 'add-primers' }
>['primers']

type DatabaseManagerDialogProps = ComponentProps<typeof DatabaseManagerDialog>
type SequenceDatabaseImportDialogProps = ComponentProps<typeof SequenceDatabaseImportDialog>

export type DatabaseManagerDialogControllerOptions = {
  projects: StoredProjectSummary[]
  currentRecordId: string
  alignmentPick: DatabaseAlignmentPick | null
  libraryMemberPick: DatabaseLibraryMemberPick | null
  refreshProjects: () => void | Promise<void>
  focusExistingDatabaseProject: (projectId: string) => Promise<boolean>
  openDatabaseProjectInNewTab: DatabaseManagerDialogProps['onOpenProject']
  addDatabasePrimers: DatabaseManagerDialogProps['onAddPrimersToCurrent']
  applyDatabaseConstructsToAlignment: (
    mode: DatabaseAlignmentPick['mode'],
    constructs: DatabaseAlignmentConstruct[],
  ) => void | Promise<void>
  addLibraryMembersFromDatabase: (projectIds: string[]) => void | Promise<void>
  convertOpenConstructToLibraryFromDatabase: (projectIds: string[]) => void | Promise<void>
  deleteProjects: (projectIds: string[]) => Promise<void>
  removeRecentDatabaseProject: (projectId: string) => void
  setStatus: (message: string) => void
  setDatabaseOpen: (open: boolean) => void
  clearDatabasePicks: () => void
}

/** Database manager dialog actions for in-app and hybrid routing. */
export function useDatabaseManagerDialogController({
  projects,
  currentRecordId,
  alignmentPick,
  libraryMemberPick,
  refreshProjects,
  focusExistingDatabaseProject,
  openDatabaseProjectInNewTab,
  addDatabasePrimers,
  applyDatabaseConstructsToAlignment,
  addLibraryMembersFromDatabase,
  convertOpenConstructToLibraryFromDatabase,
  deleteProjects,
  removeRecentDatabaseProject,
  setStatus,
  setDatabaseOpen,
  clearDatabasePicks,
}: DatabaseManagerDialogControllerOptions) {
  const onOpenProject = useCallback((project: Parameters<DatabaseManagerDialogProps['onOpenProject']>[0]) => {
    void (async () => {
      if (project.documentOrigin?.kind !== 'library-member' && await focusExistingDatabaseProject(project.id)) {
        setStatus(`Brought “${project.name}” to the front.`)
        return
      }
      openDatabaseProjectInNewTab(project)
      setStatus(`Opened ${project.name} in a new window.`)
    })()
  }, [focusExistingDatabaseProject, openDatabaseProjectInNewTab, setStatus])

  const onAddToAlignment = useCallback((constructs: DatabaseAlignmentConstruct[]) => {
    if (!alignmentPick) return
    void applyDatabaseConstructsToAlignment(alignmentPick.mode, constructs)
  }, [alignmentPick, applyDatabaseConstructsToAlignment])

  const onAddLibraryMembers = useCallback((projectIds: string[]) => {
    if (libraryMemberPick?.purpose === 'convert') {
      void convertOpenConstructToLibraryFromDatabase(projectIds)
      return
    }
    void addLibraryMembersFromDatabase(projectIds)
  }, [
    addLibraryMembersFromDatabase,
    convertOpenConstructToLibraryFromDatabase,
    libraryMemberPick?.purpose,
  ])

  const onDeleteProjects = useCallback(async (projectIds: string[]) => {
    await deleteProjects(projectIds)
    projectIds.forEach(removeRecentDatabaseProject)
  }, [deleteProjects, removeRecentDatabaseProject])

  const onDatabaseClose = useCallback(() => {
    setDatabaseOpen(false)
    clearDatabasePicks()
  }, [clearDatabasePicks, setDatabaseOpen])

  const databaseManagerProps = useMemo((): Omit<DatabaseManagerDialogProps, 'onClose'> => ({
    projects,
    currentRecordId,
    alignmentPick,
    libraryMemberPick,
    onRefresh: refreshProjects,
    onOpenProject,
    onAddPrimersToCurrent: addDatabasePrimers,
    onAddToAlignment,
    onAddLibraryMembers,
    onDeleteProjects,
    onStatus: setStatus,
  }), [
    addDatabasePrimers,
    alignmentPick,
    currentRecordId,
    libraryMemberPick,
    onAddLibraryMembers,
    onAddToAlignment,
    onDeleteProjects,
    onOpenProject,
    projects,
    refreshProjects,
    setStatus,
  ])

  return { databaseManagerProps, onDatabaseClose }
}

export type SequenceDatabaseImportDialogControllerOptions = {
  isNativeDesktop?: boolean
  shouldOpenInNewWindow?: () => boolean
  openImportedRecordInNewWindow?: (
    record: SequenceRecord,
    options: { saveToDatabase: boolean; label: string },
  ) => void
  requestDocumentExit: (action: () => void) => void
  setSequenceDatabaseImportOpen: (open: boolean) => void
  commitImportedRecord: (record: SequenceRecord, label: string) => void
  setSaveToDialogOpen: (open: boolean) => void
  setStatus: (message: string) => void
  openExternalUrl: (url: string) => Promise<void>
}

/** Sequence database import dialog callbacks with document-exit sequencing. */
export function useSequenceDatabaseImportDialogController({
  isNativeDesktop = false,
  shouldOpenInNewWindow = () => false,
  openImportedRecordInNewWindow,
  requestDocumentExit,
  setSequenceDatabaseImportOpen,
  commitImportedRecord,
  setSaveToDialogOpen,
  setStatus,
  openExternalUrl,
}: SequenceDatabaseImportDialogControllerOptions) {
  const sequenceImportProps = useMemo((): Omit<SequenceDatabaseImportDialogProps, 'onCancel'> => ({
    onOpenExternal: (url) => {
      void openExternalUrl(url).catch((error) => setStatus(
        `Could not open source page: ${error instanceof Error ? error.message : String(error)}`,
      ))
    },
    onOpen: (imported, saveToDatabase) => {
      const source = imported.externalSource
      const accession = source?.accession ?? imported.name
      const providerName = remoteSequenceProviderDisplayName(source?.provider)
      const label = `${providerName} ${accession}`
      if (isNativeDesktop && shouldOpenInNewWindow()) {
        if (!openImportedRecordInNewWindow) {
          setStatus('Could not open the imported sequence in a new window.')
          return
        }
        setSequenceDatabaseImportOpen(false)
        openImportedRecordInNewWindow(imported, { saveToDatabase, label })
        setStatus(remoteSequenceImportStatusMessage(imported, accession, providerName))
        return
      }
      requestDocumentExit(() => {
        setSequenceDatabaseImportOpen(false)
        commitImportedRecord(imported, `${providerName} ${accession}`)
        setStatus(remoteSequenceImportStatusMessage(imported, accession, providerName))
        if (saveToDatabase) setSaveToDialogOpen(true)
      })
    },
  }), [
    commitImportedRecord,
    isNativeDesktop,
    openImportedRecordInNewWindow,
    openExternalUrl,
    requestDocumentExit,
    setSaveToDialogOpen,
    setSequenceDatabaseImportOpen,
    setStatus,
    shouldOpenInNewWindow,
  ])

  return { sequenceImportProps }
}

type DatabaseHybridWorkflowCallbacks = {
  addDatabasePrimers: (primers: LibraryPrimer[]) => void
  applyDatabaseConstructsToAlignment: DatabaseManagerDialogControllerOptions['applyDatabaseConstructsToAlignment']
  addLibraryMembersFromDatabase: (projectIds: string[]) => void | Promise<void>
  convertOpenConstructToLibraryFromDatabase: (projectIds: string[]) => void | Promise<void>
}

/** Stable hybrid result callbacks without stale closures in App. */
export function useDatabaseHybridWorkflowCallbacks(callbacks: DatabaseHybridWorkflowCallbacks) {
  const callbacksRef = useRef(callbacks)
  useLayoutEffect(() => {
    callbacksRef.current = callbacks
  })
  return useMemo(() => ({
    addDatabasePrimers: (primers: HybridDatabasePrimerPayload) => {
      callbacksRef.current.addDatabasePrimers(primers)
    },
    addToAlignment: (
      mode: DatabaseAlignmentPick['mode'],
      constructs: DatabaseAlignmentConstruct[],
    ) => {
      void callbacksRef.current.applyDatabaseConstructsToAlignment(mode, constructs)
    },
    addLibraryMembers: (projectIds: string[]) => {
      void callbacksRef.current.addLibraryMembersFromDatabase(projectIds)
    },
    convertToLibrary: (projectIds: string[]) => {
      void callbacksRef.current.convertOpenConstructToLibraryFromDatabase(projectIds)
    },
  }), [])
}
