import type { SequenceRecord } from '../../domain/types'
import type { StoredProject, StoredProjectSummary } from './projectPersistence'
import type { RecentFileEntry } from './recentFiles'
import type { SaveToolbarMode } from './saveToolbar'

export type OpenedDesktopFile = {
  path: string
  name: string
  bytes: Uint8Array
}

export type NativeAppMenuRecentSummary = {
  kind: 'local' | 'database'
  name: string
  detail?: string
}

export type DatabaseExitSyncProgress = {
  phase: 'preparing' | 'scanning' | 'syncing'
  folderIndex: number
  folderTotal: number
  folderPath: string
  done: number
  total: number
  itemName: string
}

export type DatabaseExitSyncResult =
  | { ok: true; conflicts: number; syncedFolders: number }
  | { ok: false; error: string; conflicts?: number }

export type SaveToolbarModePersistenceAdapters = {
  writeSaveToolbarMode: (mode: SaveToolbarMode) => void
}

export type WorkspaceDocumentTitleLifecycleAdapters = {
  setDocumentTitle: (title: string) => void
  syncNativeWindowTitle: (title: string) => void | Promise<void>
}

export type HybridDatabasePayloadLifecycleAdapters = {
  writeHybridDatabasePayload: (payload: {
    currentRecordId: string
    alignmentPick: unknown
    libraryMemberPick: unknown
    constructPick: unknown
  }) => void
  notifyHybridDatabasePayloadUpdated: () => void | Promise<void>
  readHybridDatabaseConstructPick: () => unknown
}

export type DesktopFileDropAdapters = {
  isNativeDesktop: boolean
  bytesToFile: (name: string, bytes: Uint8Array) => File
  subscribeDesktopFileDrops: (handlers: {
    onHoverChange?: (active: boolean) => void
    onFiles: (files: OpenedDesktopFile[]) => void | Promise<void>
  }) => Promise<() => void>
}

export type DesktopWindowLifecycleAdapters = {
  isNativeDesktop: boolean
  removeOpenTab: (tabId: string) => Promise<void>
  subscribeDesktopCloseRequested: (
    handler: (preventClose: () => void) => void | Promise<void>,
  ) => Promise<() => void>
  subscribeDesktopQuitRequested: (handler: () => void | Promise<void>) => Promise<() => void>
  confirmNativeQuitHasSingleWorkspaceGuard: () => Promise<boolean>
  shouldHoldCloseForDatabaseSync: () => Promise<boolean>
  maybeSyncDatabaseOnExit: (
    onProgress?: (progress: DatabaseExitSyncProgress) => void,
  ) => Promise<DatabaseExitSyncResult>
  destroyCurrentDesktopWindow: () => Promise<void>
  scheduleDatabaseAfterWindowClose?: () => void
  quitNativeAppAfterDatabaseSync: () => Promise<boolean>
}

export type DocumentDraftLifecycleAdapters = {
  listSessionDrafts: () => Promise<StoredProjectSummary[]>
  clearSessionDraftForRecord: (recordId: string) => Promise<void>
  saveSessionDraft: (
    project: SequenceRecord,
    maxUnsavedDrafts: number,
  ) => Promise<void>
  deleteSessionDraft: (draftId: string) => Promise<void>
  getSessionDraft: (draftId: string) => Promise<StoredProject | null>
  removeOpenTab: (tabId: string) => Promise<void>
  getMaxUnsavedDrafts: () => number
}

export type RecentDocumentLifecycleAdapters = {
  listRecentFiles: (maxEntries: number) => RecentFileEntry[]
  recentFilesChangedEvent: string
  removeRecentDatabaseProject: (projectId: string) => void
  removeRecentLocalFile: (path: string) => void
  touchRecentLocalFile: (path: string, name: string) => void
  getProject: (projectId: string) => Promise<StoredProject | null>
  isSessionDraftId: (id: string) => boolean
  isNativeDesktop: boolean
  bytesToFile: (name: string, bytes: Uint8Array) => File
  readDroppedDesktopPaths: (paths: string[]) => Promise<OpenedDesktopFile[]>
  openRecentLocalPath: (path: string) => Promise<File | null>
  subscribeDesktopOpenedFiles: (
    onFiles: (files: OpenedDesktopFile[]) => void | Promise<void>,
  ) => Promise<() => void>
  openWorkspaceWindow: (options: {
    searchParams?: Record<string, string>
    title?: string
    focus?: boolean
    documentKey?: { kind: 'database'; projectId: string } | { kind: 'file'; path: string }
  }) => Promise<'focused' | 'opened' | false>
  putFileOpenHandoff: (
    id: string,
    payload: { path: string; name: string; bytes: Uint8Array },
  ) => Promise<void>
  takeFileOpenHandoff: (id: string) => Promise<OpenedDesktopFile | null>
  claimWorkspaceDocument: (
    key: { kind: 'database'; projectId: string } | { kind: 'file'; path: string },
    windowLabel: string,
  ) => void
  claimedWorkspaceWindowLabel: (
    key: { kind: 'database'; projectId: string } | { kind: 'file'; path: string },
  ) => string | null
  focusExistingWorkspaceDocument: (
    key: { kind: 'database'; projectId: string } | { kind: 'file'; path: string },
  ) => Promise<boolean>
  getCurrentWindowLabel: () => Promise<string>
}
