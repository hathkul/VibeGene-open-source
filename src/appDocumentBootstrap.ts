import { consumeCompactHistoryHandoff } from './application/documentOpen/consumeCompactHistoryHandoff'
import {
  DOCUMENT_BOOT_FILE_QUERY_PARAM_NAMES,
  DOCUMENT_BOOT_HISTORY_QUERY_PARAM_NAMES,
  parseDocumentBootQuery,
  stripDocumentBootQueryParams,
} from './application/documentOpen/documentBootQuery'
import type { DocumentBootSnapshot } from './application/documentOpen/documentBootSnapshot'
import { createSyncDocumentBootSnapshot } from './application/documentOpen/documentBootSnapshot'
import { runDocumentBootstrapAsync } from './application/documentOpen/runDocumentBootstrap'
import { parseWindowHandoffRecordMessage } from './application/documentOpen/windowHandoffRecordMessage'
import {
  WINDOW_HANDOFF_MESSAGE,
  acknowledgeWindowHandoff,
  announceWindowHandoffReady,
} from './crossTab/windowHandoff'
import { createId } from './domain/sequence'
import { cloneFixture } from './domain/fixtures'
import type { OpenedDesktopSequence } from './domain/openDesktopSequenceFile'
import type { SequenceRecord } from './domain/types'
import {
  diskWorkspaceDocumentOrigin,
  NEW_WORKSPACE_DOCUMENT_ORIGIN,
  type WorkspaceDocumentOrigin,
} from './domain/workspaceDocumentOrigin'
import { openLocalStartupDocument, type OpenedLocalTraceDocument } from './localDocumentOpen'
import { openRemoteSequenceDocument } from './remoteSequence'
import { takeHandoffDiskPath, takeHandoffDocumentOrigin, takeHandoffFolderId } from './storage/libraryEvents'
import { takeHandoffProteinSources, waitForHandoffRecord } from './storage/projects'
import { touchRecentLocalFile } from './storage/recentFiles'

const bootSearch = typeof window === 'undefined' ? '' : window.location.search

const bootQuery = parseDocumentBootQuery(bootSearch)
const compactHandoff = consumeCompactHistoryHandoff({
  getHistoryKey: () => bootQuery.historyKey,
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // ignore
    }
  },
})

const bootHistoryKey = bootQuery.historyKey
const bootLibraryFolderId = takeHandoffFolderId(bootHistoryKey)
const bootDocumentOrigin = takeHandoffDocumentOrigin(bootHistoryKey)
const bootWorkspaceDiskPathFromHandoff =
  compactHandoff.record
    ? (takeHandoffDiskPath(bootHistoryKey) ?? bootQuery.openPath)
    : null

export const appDocumentBoot: DocumentBootSnapshot = createSyncDocumentBootSnapshot({
  query: bootQuery,
  compactHandoffRecord: compactHandoff.record,
  demoRecord: cloneFixture(),
  libraryFolderId: bootLibraryFolderId,
  workspaceDiskPath: bootWorkspaceDiskPathFromHandoff,
  documentOrigin: bootDocumentOrigin,
})

/** Initial compact handoff consumed at module load (single-read semantics). */
export const compactHandoffRecordAtLoad = compactHandoff.record

let resolveWindowHandoff: ((record: SequenceRecord) => void) | null = null
const windowHandoffPromise = appDocumentBoot.pendingIdbHandoffKey
  ? new Promise<SequenceRecord>((resolve) => {
      resolveWindowHandoff = resolve
    })
  : null

function receiveWindowHandoff(event: MessageEvent) {
  if (event.origin !== window.location.origin || !appDocumentBoot.pendingIdbHandoffKey) return
  const record = parseWindowHandoffRecordMessage(
    event.data,
    appDocumentBoot.pendingIdbHandoffKey,
    WINDOW_HANDOFF_MESSAGE,
  )
  if (!record) return
  resolveWindowHandoff?.(record)
  resolveWindowHandoff = null
  acknowledgeWindowHandoff(appDocumentBoot.pendingIdbHandoffKey)
}

if (windowHandoffPromise) {
  window.addEventListener('message', receiveWindowHandoff)
  announceWindowHandoffReady(appDocumentBoot.pendingIdbHandoffKey!)
}

function replaceLocationQuery(strippedPath: string) {
  window.history.replaceState({}, '', strippedPath)
}

export function clearBootFileQueryParams() {
  const stripped = stripDocumentBootQueryParams(window.location.href, DOCUMENT_BOOT_FILE_QUERY_PARAM_NAMES)
  if (stripped) replaceLocationQuery(stripped)
}

export function clearBootHistoryQueryParams() {
  const stripped = stripDocumentBootQueryParams(
    window.location.href,
    DOCUMENT_BOOT_HISTORY_QUERY_PARAM_NAMES,
  )
  if (stripped) replaceLocationQuery(stripped)
}

function applyOpenedDesktopBoot(opened: OpenedDesktopSequence) {
  appDocumentBoot.record = opened.record
  appDocumentBoot.traceFiles = opened.traces
  appDocumentBoot.workspaceDiskPath = opened.path
  appDocumentBoot.documentOrigin = diskWorkspaceDocumentOrigin(opened.path)
  appDocumentBoot.openedFromDiskFile = true
  appDocumentBoot.openedFromHandoff = true
  appDocumentBoot.initiallyUnsaved = false
  if (opened.path) touchRecentLocalFile(opened.path, opened.fileName)
  clearBootFileQueryParams()
}

function applyOpenedTraceBoot(opened: OpenedLocalTraceDocument) {
  appDocumentBoot.record =
    opened.record
    ?? {
      ...cloneFixture(),
      id: createId('trace-doc'),
      name: opened.fileName.replace(/\.ab1$/i, '') || opened.fileName,
    }
  appDocumentBoot.traceFiles = []
  appDocumentBoot.traceDocument = {
    trace: opened.trace,
    fileName: opened.fileName,
    path: opened.path,
  }
  appDocumentBoot.workspaceDiskPath = opened.path
  appDocumentBoot.documentOrigin = diskWorkspaceDocumentOrigin(opened.path)
  appDocumentBoot.openedFromDiskFile = true
  appDocumentBoot.openedFromHandoff = true
  appDocumentBoot.initiallyUnsaved = false
  if (opened.path) touchRecentLocalFile(opened.path, opened.fileName)
  clearBootFileQueryParams()
}

function applyIndexedDbHandoffBoot(
  handoff: { record: SequenceRecord; sourceHydrationPending: boolean; documentOrigin?: WorkspaceDocumentOrigin },
  diskPath: string | null,
) {
  appDocumentBoot.record = handoff.record
  appDocumentBoot.traceFiles = handoff.record.traceFiles ?? []
  appDocumentBoot.openedFromHandoff = true
  appDocumentBoot.sourceHydrationPending = handoff.sourceHydrationPending
  appDocumentBoot.documentOrigin = handoff.documentOrigin
    ?? (diskPath ? diskWorkspaceDocumentOrigin(diskPath) : NEW_WORKSPACE_DOCUMENT_ORIGIN)
  if (diskPath) {
    appDocumentBoot.workspaceDiskPath = diskPath
    appDocumentBoot.openedFromDiskFile = true
    appDocumentBoot.initiallyUnsaved = false
    touchRecentLocalFile(diskPath, appDocumentBoot.record.name)
  }
  if (appDocumentBoot.documentOrigin.kind === 'database' || appDocumentBoot.documentOrigin.kind === 'library-member') {
    appDocumentBoot.libraryFolderId = appDocumentBoot.documentOrigin.folderId
  }
}

let appBootstrapPromise: Promise<void> | null = null
let bootSourceHydrationPromise: ReturnType<typeof takeHandoffProteinSources> | null = null

export function prepareAppDocumentBootstrap(): Promise<void> {
  if (appBootstrapPromise) return appBootstrapPromise

  appBootstrapPromise = runDocumentBootstrapAsync(appDocumentBoot, bootQuery, bootSearch, {
    openLocalDocument: (request) =>
      openLocalStartupDocument(request, (error) =>
        console.error('Failed to take file-open handoff', error),
      ),
    openRemoteDocument: openRemoteSequenceDocument,
    waitForHandoffRecord: (key) => waitForHandoffRecord(key, 2_500),
    windowHandoffRecord: windowHandoffPromise ?? undefined,
    resolveDiskPathForHandoffKey: takeHandoffDiskPath,
    openPathFromQuery: bootQuery.openPath,
    applySequenceBoot: applyOpenedDesktopBoot,
    applyTraceBoot: applyOpenedTraceBoot,
    applyRemoteSequenceBoot: (opened) => {
      applyOpenedDesktopBoot(opened)
      appDocumentBoot.remoteSourceUrl = opened.sourceUrl
    },
    applyIndexedDbHandoffBoot,
    acknowledgeWindowHandoff,
    clearFileBootQueryParams: clearBootFileQueryParams,
    teardownWindowHandoffListener: () => {
      window.removeEventListener('message', receiveWindowHandoff)
      resolveWindowHandoff = null
    },
  })

  return appBootstrapPromise
}

export function hydrateAppBootProteinSources() {
  const key = appDocumentBoot.pendingIdbHandoffKey
  if (!key) return Promise.resolve([])
  if (!bootSourceHydrationPromise) {
    bootSourceHydrationPromise = takeHandoffProteinSources(key)
  }
  return bootSourceHydrationPromise
}
