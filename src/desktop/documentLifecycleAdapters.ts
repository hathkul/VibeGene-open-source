import { readAppPreferences } from '../domain/appPreferences'
import {
  clearSessionDraftForRecord,
  deleteSessionDraft,
  getSessionDraft,
  listSessionDrafts,
  saveSessionDraft,
} from '../storage/sessionDraft'
import {
  RECENT_FILES_CHANGED_EVENT,
  listRecentFiles,
  removeRecentDatabaseProject,
  removeRecentLocalFile,
  touchRecentLocalFile,
} from '../storage/recentFiles'
import { putFileOpenHandoff, takeFileOpenHandoff } from '../storage/fileOpenHandoff'
import { getProject } from '../storage/projects'
import { removeOpenTab } from '../crossTab/openTabs'
import {
  bytesToFile,
  openRecentLocalPath,
  readDroppedDesktopPaths,
  subscribeDesktopFileDrops,
  subscribeDesktopOpenedFiles,
} from './fileIo'
import { isTauriRuntime } from './tauriRuntime'
import {
  confirmNativeQuitHasSingleWorkspaceGuard,
  maybeSyncDatabaseOnExit,
  quitNativeAppAfterDatabaseSync,
  shouldHoldCloseForDatabaseSync,
  scheduleDatabaseBackgroundSync,
} from './syncOnExit'
import { isLastVisibleAppWindow } from './workspaceWindows'
import { destroyCurrentDesktopWindow, subscribeDesktopCloseRequested, subscribeDesktopQuitRequested } from './windowCloseGuard'
import { openWorkspaceWindow } from './workspaceWindow'
import {
  claimWorkspaceDocument,
  claimedWorkspaceWindowLabel,
  focusExistingWorkspaceDocument,
} from './workspaceDocumentRegistry'
import type {
  DesktopFileDropAdapters,
  DesktopWindowLifecycleAdapters,
  DocumentDraftLifecycleAdapters,
  RecentDocumentLifecycleAdapters,
} from '../application/ports/lifecycle'
import { isSessionDraftId } from '../storage/sessionDraft'

export const documentDraftLifecycleAdapters: DocumentDraftLifecycleAdapters = {
  listSessionDrafts,
  clearSessionDraftForRecord,
  saveSessionDraft,
  deleteSessionDraft,
  getSessionDraft,
  removeOpenTab,
  getMaxUnsavedDrafts: () => readAppPreferences().maxUnsavedDrafts,
}

export const recentDocumentLifecycleAdapters: RecentDocumentLifecycleAdapters = {
  listRecentFiles,
  recentFilesChangedEvent: RECENT_FILES_CHANGED_EVENT,
  removeRecentDatabaseProject,
  removeRecentLocalFile,
  touchRecentLocalFile,
  getProject,
  isSessionDraftId,
  get isNativeDesktop() {
    return isTauriRuntime()
  },
  bytesToFile,
  readDroppedDesktopPaths,
  openRecentLocalPath,
  subscribeDesktopOpenedFiles,
  openWorkspaceWindow,
  putFileOpenHandoff,
  takeFileOpenHandoff: async (id) => {
    const handoff = await takeFileOpenHandoff(id)
    return handoff ? { path: handoff.path, name: handoff.name, bytes: handoff.bytes } : null
  },
  claimWorkspaceDocument,
  claimedWorkspaceWindowLabel,
  focusExistingWorkspaceDocument,
  getCurrentWindowLabel: async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      return getCurrentWindow().label
    } catch {
      return ''
    }
  },
}

export const desktopFileDropLifecycleAdapters: DesktopFileDropAdapters = {
  get isNativeDesktop() {
    return isTauriRuntime()
  },
  bytesToFile,
  subscribeDesktopFileDrops,
}

export const desktopWindowLifecycleAdapters: DesktopWindowLifecycleAdapters = {
  get isNativeDesktop() {
    return isTauriRuntime()
  },
  removeOpenTab,
  subscribeDesktopCloseRequested,
  subscribeDesktopQuitRequested,
  confirmNativeQuitHasSingleWorkspaceGuard,
  shouldHoldCloseForDatabaseSync,
  maybeSyncDatabaseOnExit,
  destroyCurrentDesktopWindow,
  scheduleDatabaseAfterWindowClose: () => {
    // macOS receives the authoritative last-hidden event from Rust.
    if (/Mac/i.test(navigator.platform || navigator.userAgent || '')) return
    void isLastVisibleAppWindow().then((last) => {
      if (last) scheduleDatabaseBackgroundSync()
    }).catch(console.warn)
  },
  quitNativeAppAfterDatabaseSync,
}
