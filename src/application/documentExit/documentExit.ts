import type { WorkspaceDocumentBinding } from '../../domain/projectSaveSemantics'

export type DocumentExitContext = 'document' | 'window-close' | 'app-quit'

export type PendingDocumentExit = {
  action: () => void | Promise<void>
  /** Called when the user explicitly cancels the unsaved-changes prompt. */
  onCancel?: () => void
  /** Window chrome close vs in-app document switch (affects dialog copy). */
  context?: DocumentExitContext
}

export type DocumentExitChoice =
  | 'cancel'
  | 'discard'
  | 'save-file'
  | 'save-as-file'
  | 'save-to-database'

export type RequestDocumentExitPorts = {
  isDirty: () => boolean
  stage: (pending: PendingDocumentExit) => void
}

export type ResolveDocumentExitPorts = {
  pending: PendingDocumentExit | null
  clearPending: () => void
  restorePending: (pending: PendingDocumentExit) => void
  isNativeDesktop: () => boolean
  documentSaveBinding: WorkspaceDocumentBinding
  saveDiskFile: (options?: { forceDialog?: boolean }) => Promise<boolean>
  save: (afterSave: () => void | Promise<void>) => Promise<void>
  installSaveCompletion: (completion: () => void | Promise<void>) => void
  clearSaveCompletion: () => void
  exportFile: () => Promise<string | null>
  completeDatabaseSave: () => Promise<void>
  saveToDatabase: () => void
  clearSessionDraftForRecord: (recordId: string) => Promise<void>
  refreshSessionDrafts: () => Promise<void>
  currentRecordId: () => string
  suppressPageHideDraftSave: () => void
}

/** Stage an action only when the mounted document has unsaved changes. */
export function requestDocumentExit(
  action: () => void | Promise<void>,
  ports: RequestDocumentExitPorts,
  options?: { context?: DocumentExitContext; onCancel?: () => void },
): void {
  if (!ports.isDirty()) {
    // Preserve the legacy fire-and-forget behavior for clean documents.
    void Promise.resolve(action())
    return
  }
  ports.stage({ action, context: options?.context ?? 'document', ...(options?.onCancel ? { onCancel: options.onCancel } : {}) })
}

/** Resolve the unsaved-document prompt while retaining save retry semantics. */
export async function resolveDocumentExit(
  choice: DocumentExitChoice,
  ports: ResolveDocumentExitPorts,
): Promise<void> {
  const pending = ports.pending
  if (!pending) return

  // Clear first so a completion or nested event cannot execute the action twice.
  ports.clearPending()
  if (choice === 'cancel') {
    pending.onCancel?.()
    return
  }

  if (choice === 'save-file') {
    if (ports.isNativeDesktop() && ports.documentSaveBinding !== 'database') {
      ports.installSaveCompletion(pending.action)
      const saved = await ports.saveDiskFile()
      if (!saved) {
        ports.clearSaveCompletion()
        ports.restorePending(pending)
      }
      return
    }
    await ports.save(pending.action)
    return
  }

  if (choice === 'save-as-file') {
    if (ports.isNativeDesktop() && ports.documentSaveBinding !== 'database') {
      ports.installSaveCompletion(pending.action)
      const saved = await ports.saveDiskFile({ forceDialog: true })
      if (!saved) {
        ports.clearSaveCompletion()
        ports.restorePending(pending)
      }
      return
    }
    ports.installSaveCompletion(pending.action)
    const path = await ports.exportFile()
    if (path === null && ports.isNativeDesktop()) {
      ports.clearSaveCompletion()
      ports.restorePending(pending)
      return
    }
    await ports.completeDatabaseSave()
    return
  }

  if (choice === 'save-to-database') {
    ports.restorePending(pending)
    ports.installSaveCompletion(pending.action)
    ports.saveToDatabase()
    return
  }

  if (pending.context === 'window-close') {
    // Closing the native window must not wait on IndexedDB draft maintenance.
    // Start cleanup before destroying the workspace, but let it finish in the
    // background; a slow or unavailable draft store must not hold the window
    // (or the discard prompt) open.
    ports.suppressPageHideDraftSave()
    void ports.clearSessionDraftForRecord(ports.currentRecordId())
      .then(() => ports.refreshSessionDrafts())
      .catch(() => undefined)
    await pending.action()
    return
  }

  await ports.clearSessionDraftForRecord(ports.currentRecordId())
  await ports.refreshSessionDrafts()
  await pending.action()
}
