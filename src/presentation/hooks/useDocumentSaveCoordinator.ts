import { useCallback } from 'react'
import type { PendingDocumentExit } from '../../application/documentExit/documentExit'
import { planSaveToolbarAction, type SaveToolbarMode } from '../../application/documentSave/saveRouting'

type SaveCoordinatorOptions = {
  traceDocument: boolean
  documentSaveBinding: 'disk' | 'database' | 'new'
  pendingDocumentExit: PendingDocumentExit | null
  pendingSaveCompletionRef: { current: (() => void | Promise<void>) | null }
  refreshSessionDraftsRef: { current: () => Promise<void> }
  recordId: () => string
  setStatus: (status: string) => void
  setPendingDocumentExit: (pending: PendingDocumentExit | null) => void
  saveDiskFile: (options?: { forceDialog?: boolean }) => Promise<boolean>
  save: (afterSave?: () => void | Promise<void>) => Promise<void>
  saveToDatabase: () => void
  handleExportSnapGene: () => Promise<string | null>
  exportSnapGeneFile: () => Promise<string | null>
  completeDatabaseSave: () => Promise<void>
  clearSessionDraftForRecord: (recordId: string) => Promise<void>
  suppressPageHideDraftSave: () => void
  resolveDocumentExitWorkflow: (choice: 'cancel' | 'discard' | 'save-file' | 'save-as-file' | 'save-to-database', ports: {
    pending: PendingDocumentExit | null
    clearPending: () => void
    restorePending: (pending: PendingDocumentExit | null) => void
    isNativeDesktop: () => boolean
    documentSaveBinding: 'disk' | 'database' | 'new'
    saveDiskFile: (options?: { forceDialog?: boolean }) => Promise<boolean>
    save: (afterSave?: () => void | Promise<void>) => Promise<void>
    installSaveCompletion: (completion: () => void | Promise<void>) => void
    clearSaveCompletion: () => void
    exportFile: () => Promise<string | null>
    completeDatabaseSave: () => Promise<void>
    saveToDatabase: () => void
    clearSessionDraftForRecord: (recordId: string) => Promise<void>
    refreshSessionDrafts: () => Promise<void>
    currentRecordId: () => string
    suppressPageHideDraftSave: () => void
  }) => Promise<void>
  isNativeDesktop: () => boolean
}

/** Owns save-toolbar dispatch and unsaved-document exit coordination. */
export function useDocumentSaveCoordinator(options: SaveCoordinatorOptions) {
  const runSaveToolbarMode = useCallback((mode: SaveToolbarMode) => {
    switch (planSaveToolbarAction(options.traceDocument, options.documentSaveBinding, mode)) {
      case 'read-only':
        options.setStatus('Trace documents are read-only. Open as sequence before saving.')
        return
      case 'save-database':
        void options.save()
        return
      case 'save-database-copy':
        options.saveToDatabase()
        return
      case 'export-database-dna':
        void options.handleExportSnapGene()
        return
      case 'save-disk-as':
        void options.saveDiskFile({ forceDialog: true })
        return
      case 'save-disk':
        void options.saveDiskFile()
        return
    }
  }, [options])

  const resolveDocumentExit = useCallback(async (choice: 'cancel' | 'discard' | 'save-file' | 'save-as-file' | 'save-to-database') => {
    await options.resolveDocumentExitWorkflow(choice, {
      pending: options.pendingDocumentExit,
      clearPending: () => options.setPendingDocumentExit(null),
      restorePending: options.setPendingDocumentExit,
      isNativeDesktop: options.isNativeDesktop,
      documentSaveBinding: options.documentSaveBinding,
      saveDiskFile: options.saveDiskFile,
      save: options.save,
      installSaveCompletion: (completion) => { options.pendingSaveCompletionRef.current = completion },
      clearSaveCompletion: () => { options.pendingSaveCompletionRef.current = null },
      exportFile: options.exportSnapGeneFile,
      completeDatabaseSave: options.completeDatabaseSave,
      saveToDatabase: options.saveToDatabase,
      clearSessionDraftForRecord: options.clearSessionDraftForRecord,
      refreshSessionDrafts: () => options.refreshSessionDraftsRef.current(),
      currentRecordId: options.recordId,
      suppressPageHideDraftSave: options.suppressPageHideDraftSave,
    })
  }, [options])

  return { runSaveToolbarMode, resolveDocumentExit }
}
