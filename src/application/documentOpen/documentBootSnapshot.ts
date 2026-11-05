import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import {
  NEW_WORKSPACE_DOCUMENT_ORIGIN,
  type WorkspaceDocumentOrigin,
} from '../../domain/workspaceDocumentOrigin'
import type { DocumentBootQuery } from './documentBootQuery'
import { resolvePendingIdbHandoffKey } from './documentBootQuery'

export type DocumentBootTraceDocument = {
  trace: TraceFileRecord
  fileName: string
  path: string | null
}

export type DocumentBootSnapshot = {
  query: DocumentBootQuery
  compactHandoffRecord: SequenceRecord | null
  pendingIdbHandoffKey: string | null
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  traceDocument: DocumentBootTraceDocument | null
  workspaceDiskPath: string | null
  libraryFolderId: string | null | undefined
  documentOrigin: WorkspaceDocumentOrigin
  openedFromHandoff: boolean
  openedFromDiskFile: boolean
  initiallyUnsaved: boolean
  sourceHydrationPending: boolean
  openError: string | null
  remoteSourceUrl: string | null
}

export function createSyncDocumentBootSnapshot(input: {
  query: DocumentBootQuery
  compactHandoffRecord: SequenceRecord | null
  demoRecord: SequenceRecord
  libraryFolderId: string | null | undefined
  workspaceDiskPath: string | null
  documentOrigin?: WorkspaceDocumentOrigin
}): DocumentBootSnapshot {
  const { query, compactHandoffRecord, demoRecord, libraryFolderId, workspaceDiskPath } = input
  const openedFromHandoff = compactHandoffRecord !== null
  return {
    query,
    compactHandoffRecord,
    pendingIdbHandoffKey: resolvePendingIdbHandoffKey(query.historyKey, compactHandoffRecord),
    record: compactHandoffRecord ?? demoRecord,
    traceFiles: compactHandoffRecord?.traceFiles ?? [],
    traceDocument: null,
    workspaceDiskPath,
    libraryFolderId,
    documentOrigin: input.documentOrigin ?? (workspaceDiskPath
      ? { kind: 'disk', path: workspaceDiskPath }
      : libraryFolderId !== undefined && compactHandoffRecord
        ? { kind: 'database', projectId: compactHandoffRecord.id, folderId: libraryFolderId ?? null }
        : NEW_WORKSPACE_DOCUMENT_ORIGIN),
    openedFromHandoff,
    openedFromDiskFile: Boolean(workspaceDiskPath && compactHandoffRecord),
    initiallyUnsaved: query.initiallyUnsaved,
    sourceHydrationPending: false,
    openError: null,
    remoteSourceUrl: null,
  }
}
