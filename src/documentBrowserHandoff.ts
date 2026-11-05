import {
  openBrowserHandoffTab,
  resolveNativeHandoffFolderId,
  storeHandoffRecordForNativeOpen,
  type BrowserHandoffPorts,
  type HandoffRecordStorePorts,
} from './application/documentHandoff/browserHandoff'
import { prepareWindowHandoffSender } from './crossTab/windowHandoff'
import { createId } from './domain/sequence'
import type { SequenceRecord } from './domain/types'
import type { WorkspaceDocumentOrigin } from './domain/workspaceDocumentOrigin'
import { putHandoffRecord } from './storage/projects'
import { writeHandoffDocumentOrigin, writeHandoffFolderId } from './storage/libraryEvents'

type DocumentBrowserHandoffDeps = {
  setStatus: (status: string) => void
  getActiveLibraryFolderId: () => string | null | undefined
  canReuseCurrentTab: () => boolean
}

/** Browser/localStorage/window adapters for cross-tab construct handoff (assembled in App). */
export function createDocumentBrowserHandoffAdapters(deps: DocumentBrowserHandoffDeps) {
  const browserPorts: BrowserHandoffPorts = {
    pathname: window.location.pathname,
    canReuseCurrentTab: deps.canReuseCurrentTab,
    navigateCurrentTab: (url) => window.location.assign(url),
    setLocalStorageItem: (key, value) => {
      try {
        window.localStorage.setItem(key, value)
        return true
      } catch {
        return false
      }
    },
    removeLocalStorageItem: (key) => {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // ignore
      }
    },
    writeFolderId: writeHandoffFolderId,
    writeDocumentOrigin: writeHandoffDocumentOrigin,
    openTab: (url) => window.open(url, '_blank'),
    detachOpener: (tab) => {
      try {
        tab.opener = null
      } catch {
        // ignore
      }
    },
    blurTab: (tab) => {
      try {
        tab.blur()
      } catch {
        // ignore
      }
    },
    focusSelf: () => {
      try {
        window.focus()
      } catch {
        // ignore
      }
    },
    schedule: (callback, delayMs) => {
      window.setTimeout(callback, delayMs)
    },
    persistHandoff: putHandoffRecord,
    prepareTransfer: (key, record) =>
      prepareWindowHandoffSender(key, record, window.location.origin),
    reportTransferFailure: (message) => deps.setStatus(message),
  }

  const storePorts: HandoffRecordStorePorts = {
    createKey: () => createId('hist'),
    putHandoff: putHandoffRecord,
    setLocalStorageItem: browserPorts.setLocalStorageItem,
    writeFolderId: writeHandoffFolderId,
    writeDocumentOrigin: writeHandoffDocumentOrigin,
  }

  async function storeHandoffRecord(
    source: SequenceRecord,
    folderId?: string | null,
    documentOrigin?: WorkspaceDocumentOrigin,
  ): Promise<string | null> {
    const resolvedFolderId = resolveNativeHandoffFolderId(
      folderId,
      deps.getActiveLibraryFolderId(),
    )
    return storeHandoffRecordForNativeOpen(storePorts, source, resolvedFolderId, documentOrigin)
  }

  function openBrowserHandoff(
    key: string,
    source: SequenceRecord,
    folderId: string | null | undefined,
    options: {
      title: string
      activate: boolean
      initiallyUnsaved: boolean
      suppressFailureStatus?: boolean
      documentOrigin?: WorkspaceDocumentOrigin
      openSaveToDatabase?: boolean
      reservedTab?: Window
    },
  ): boolean {
    const reserved = options.reservedTab
    const ports = reserved ? {
      ...browserPorts,
      canReuseCurrentTab: () => false,
      openTab: (url: string) => {
        if (reserved.closed) return null
        try { reserved.location.href = url; return reserved } catch { return null }
      },
    } : browserPorts
    return openBrowserHandoffTab(ports, key, source, folderId, options)
  }

  return { storeHandoffRecord, openBrowserHandoff }
}
