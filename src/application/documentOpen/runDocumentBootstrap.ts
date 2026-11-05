import { remoteSequenceUrlFromSearch } from '../../domain/remoteSequenceFile'
import type { LocalDocumentOpenRequest } from './openLocalDocument'
import type { DocumentBootSnapshot } from './documentBootSnapshot'
import {
  shouldClearFileBootQueryParams,
  shouldSkipAsyncDocumentBootstrap,
  type DocumentBootQuery,
} from './documentBootQuery'

export type TakenHandoffBootstrap = {
  record: import('../../domain/types').SequenceRecord
  sourceHydrationPending: boolean
  documentOrigin?: import('../../domain/workspaceDocumentOrigin').WorkspaceDocumentOrigin
}

export type DocumentBootstrapAsyncPorts<TSequenceBoot, TTraceBoot, TRemoteBoot> = {
  openLocalDocument: (
    request: LocalDocumentOpenRequest,
  ) => Promise<
    | { kind: 'sequence'; opened: TSequenceBoot }
    | { kind: 'trace'; opened: TTraceBoot }
    | null
  >
  openRemoteDocument: (sourceUrl: string) => Promise<TRemoteBoot>
  waitForHandoffRecord: (key: string) => Promise<TakenHandoffBootstrap | null>
  windowHandoffRecord?: Promise<import('../../domain/types').SequenceRecord | null>
  resolveDiskPathForHandoffKey: (key: string) => string | null
  openPathFromQuery: string | null
  applySequenceBoot: (opened: TSequenceBoot) => void
  applyTraceBoot: (opened: TTraceBoot) => void
  applyRemoteSequenceBoot: (opened: TRemoteBoot) => void
  applyIndexedDbHandoffBoot: (handoff: TakenHandoffBootstrap, diskPath: string | null) => void
  acknowledgeWindowHandoff: (key: string) => void
  clearFileBootQueryParams: () => void
  teardownWindowHandoffListener: () => void
}

/**
 * Resolve disk, remote, and IndexedDB handoffs before React mounts.
 * Disk opens precede remote URLs and durable IndexedDB to avoid trace stalls.
 */
export async function runDocumentBootstrapAsync<TSequenceBoot, TTraceBoot, TRemoteBoot>(
  snapshot: DocumentBootSnapshot,
  query: DocumentBootQuery,
  locationSearch: string,
  ports: DocumentBootstrapAsyncPorts<TSequenceBoot, TTraceBoot, TRemoteBoot>,
): Promise<void> {
  if (shouldSkipAsyncDocumentBootstrap(snapshot.openedFromHandoff)) {
    if (
      shouldClearFileBootQueryParams({
        openedFromHandoff: snapshot.openedFromHandoff,
        workspaceDiskPath: snapshot.workspaceDiskPath,
      })
    ) {
      ports.clearFileBootQueryParams()
    }
    return
  }

  try {
    const local = await ports.openLocalDocument({
      handoffKey: query.fileHandoffKey,
      directPath: query.openPath,
    })
    if (local) {
      if (local.kind === 'trace') ports.applyTraceBoot(local.opened)
      else ports.applySequenceBoot(local.opened)
      return
    }

    const remoteUrl = remoteSequenceUrlFromSearch(locationSearch)
    if (remoteUrl) {
      ports.applyRemoteSequenceBoot(await ports.openRemoteDocument(remoteUrl))
      return
    }

    const key = snapshot.pendingIdbHandoffKey
    if (!key) return

    const durableHandoff = ports.waitForHandoffRecord(key)
    const handoff = await Promise.race([
      durableHandoff,
      ...(ports.windowHandoffRecord
        ? [
            ports.windowHandoffRecord.then((record) =>
              record ? { record, sourceHydrationPending: false } : null,
            ),
          ]
        : []),
    ])
    if (!handoff) return

    const diskPath =
      ports.resolveDiskPathForHandoffKey(key) ?? ports.openPathFromQuery
    ports.applyIndexedDbHandoffBoot(handoff, diskPath)
    ports.acknowledgeWindowHandoff(key)
    ports.clearFileBootQueryParams()
  } catch (error) {
    snapshot.openError = error instanceof Error ? error.message : String(error)
    console.error('Failed to load workspace handoff before mount', error)
  } finally {
    ports.teardownWindowHandoffListener()
  }
}
