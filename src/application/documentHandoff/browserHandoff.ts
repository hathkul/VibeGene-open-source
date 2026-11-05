import type { SequenceRecord } from '../../domain/types'
import type { WorkspaceDocumentOrigin } from '../../domain/workspaceDocumentOrigin'
import { canUseCompactHandoff } from './documentHandoff'

export const HISTORY_HANDOFF_PREFIX = 'vibegene:history-construct:'

/**
 * Legacy native `storeHandoffRecord` default-param semantics: an omitted or
 * `undefined` folder id inherits the active library folder; explicit `null` stays unfiled.
 */
export function resolveNativeHandoffFolderId(
  folderId: string | null | undefined,
  activeLibraryFolderId: string | null | undefined,
): string | null | undefined {
  if (folderId === undefined) return activeLibraryFolderId
  return folderId
}

export type HandoffTab = Pick<Window, 'closed' | 'blur' | 'opener' | 'postMessage'>

export type HandoffTransfer = {
  setTarget: (opened: HandoffTab) => void
  stop: () => void
}

export type BrowserHandoffPorts = {
  pathname: string
  canReuseCurrentTab?: () => boolean
  navigateCurrentTab?: (url: string) => void
  setLocalStorageItem: (key: string, value: string) => boolean
  removeLocalStorageItem: (key: string) => void
  writeFolderId: (key: string, folderId: string | null | undefined) => void
  writeDocumentOrigin?: (key: string, origin: WorkspaceDocumentOrigin | undefined) => void
  openTab: (url: string) => HandoffTab | null
  detachOpener: (tab: HandoffTab) => void
  blurTab: (tab: HandoffTab) => void
  focusSelf: () => void
  schedule: (callback: () => void, delayMs: number) => void
  persistHandoff: (key: string, record: SequenceRecord, origin?: WorkspaceDocumentOrigin) => Promise<void>
  prepareTransfer: (key: string, record: SequenceRecord) => HandoffTransfer | null
  reportTransferFailure: (message: string) => void
}

export function compactHandoffJson(source: SequenceRecord): string {
  const handoffBase: SequenceRecord = {
    ...source,
    traceFiles: undefined,
  }
  return JSON.stringify(handoffBase)
}

/** Fast localStorage path for small constructs; lossless payloads skip localStorage. */
export function tryStoreCompactHandoff(
  ports: Pick<BrowserHandoffPorts, 'setLocalStorageItem'>,
  key: string,
  source: SequenceRecord,
): boolean {
  if (!canUseCompactHandoff(source)) return false
  const storageKey = HISTORY_HANDOFF_PREFIX + key
  try {
    return ports.setLocalStorageItem(storageKey, compactHandoffJson(source))
  } catch {
    return false
  }
}

export function buildBrowserHandoffUrl(pathname: string, key: string, initiallyUnsaved: boolean, openSaveToDatabase = false): string {
  const unsavedQuery = initiallyUnsaved ? '&unsaved=1' : ''
  const saveQuery = openSaveToDatabase ? '&saveToDatabase=1' : ''
  return `${pathname}?history=${key}&bootSplash=0${unsavedQuery}${saveQuery}`
}

export function scheduleInactiveTabFocus(
  ports: Pick<BrowserHandoffPorts, 'blurTab' | 'focusSelf' | 'schedule'>,
  tab: HandoffTab,
  activate: boolean,
): void {
  const restoreFocus = () => {
    if (activate) return
    ports.blurTab(tab)
    ports.focusSelf()
  }
  restoreFocus()
  ports.schedule(restoreFocus, 0)
  ports.schedule(restoreFocus, 50)
}

export function openBrowserHandoffTab(
  ports: BrowserHandoffPorts,
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
  },
): boolean {
  const hasCompleteLocalCopy = tryStoreCompactHandoff(ports, key, source)
  ports.writeFolderId(key, folderId)
  if (options.documentOrigin) ports.writeDocumentOrigin?.(key, options.documentOrigin)
  const url = buildBrowserHandoffUrl(ports.pathname, key, options.initiallyUnsaved, options.openSaveToDatabase)
  if (ports.canReuseCurrentTab?.() && ports.navigateCurrentTab) {
    const persist = options.documentOrigin
      ? ports.persistHandoff(key, source, options.documentOrigin)
      : ports.persistHandoff(key, source)
    void persist
      .then(() => ports.navigateCurrentTab!(url))
      .catch((error) => {
        if (options.suppressFailureStatus) return
        const message = error instanceof Error ? error.message : String(error)
        ports.reportTransferFailure(`Could not transfer the construct to the current tab: ${message}`)
      })
    return true
  }
  const transfer = hasCompleteLocalCopy ? null : ports.prepareTransfer(key, source)
  const opened = ports.openTab(url)
  if (!opened) {
    transfer?.stop()
    ports.removeLocalStorageItem(HISTORY_HANDOFF_PREFIX + key)
    return false
  }
  ports.detachOpener(opened)
  transfer?.setTarget(opened)
  scheduleInactiveTabFocus(ports, opened, options.activate)
  const persist = options.documentOrigin
    ? ports.persistHandoff(key, source, options.documentOrigin)
    : ports.persistHandoff(key, source)
  void persist.catch((error) => {
    if (options.suppressFailureStatus) return
    const message = error instanceof Error ? error.message : String(error)
    ports.reportTransferFailure(`Could not transfer the construct to the new tab: ${message}`)
  })
  return true
}

export type HandoffRecordStorePorts = {
  createKey: () => string
  putHandoff: (key: string, record: SequenceRecord, origin?: WorkspaceDocumentOrigin) => Promise<void>
  setLocalStorageItem: (key: string, value: string) => boolean
  writeFolderId: (key: string, folderId: string | null | undefined) => void
  writeDocumentOrigin?: (key: string, origin: WorkspaceDocumentOrigin | undefined) => void
}

export async function storeHandoffRecordForNativeOpen(
  ports: HandoffRecordStorePorts,
  source: SequenceRecord,
  folderId: string | null | undefined,
  documentOrigin?: WorkspaceDocumentOrigin,
): Promise<string | null> {
  const key = ports.createKey()
  try {
    if (documentOrigin) await ports.putHandoff(key, source, documentOrigin)
    else await ports.putHandoff(key, source)
  } catch {
    return null
  }
  tryStoreCompactHandoff(ports, key, source)
  ports.writeFolderId(key, folderId)
  if (documentOrigin) ports.writeDocumentOrigin?.(key, documentOrigin)
  return key
}
