import { normalizeSequenceRecord } from '../domain/constructProperties'
import { isDnaLibraryRecord } from '../domain/dnaLibrary'
import { createId, nowIso } from '../domain/sequence'
import type { SequenceRecord } from '../domain/types'
import type { TraceFileRecord } from '../domain/traceTypes'
import type { CloningWorkspaceEnzymeSet } from '../cloningWorkspaceTypes'
import { db } from '../storage/projects'
import { postCrossTabMessage, subscribeCrossTabMessages } from './channel'
import type { OpenTabSession, OpenTabSummary } from './types'

/** Live tabs heartbeat every 5s; treat ~4 missed beats as closed (pagehide often misses on Tauri). */
export const OPEN_TAB_STALE_MS = 20_000

function ageMs(updatedAt: string, now = Date.now()) {
  const timestamp = Date.parse(updatedAt)
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY
  return Math.max(0, now - timestamp)
}

export function isOpenTabStale(updatedAt: string, now = Date.now(), maxAgeMs = OPEN_TAB_STALE_MS) {
  return ageMs(updatedAt, now) > maxAgeMs
}

export function openTabRecordSnapshot(
  record: SequenceRecord,
  traceFiles: TraceFileRecord[],
): SequenceRecord {
  // Library members are needed by mass cloning, but their peak arrays and alignments are not.
  // Keeping only sequence-level data avoids cloning large AB1/ZTR payloads on every heartbeat.
  const lightweightLibraryMembers = isDnaLibraryRecord(record)
    ? traceFiles.map((member) => ({
        id: member.id,
        fileName: member.fileName,
        ...(typeof member.fileLastModified === 'number'
          ? { fileLastModified: member.fileLastModified }
          : {}),
        sequence: member.sequence,
        chromatogram: {
          aTrace: [],
          tTrace: [],
          gTrace: [],
          cTrace: [],
          basePos: [],
          baseCalls: [],
        },
        enabled: member.enabled,
        expanded: false,
        showAnnotations: member.showAnnotations,
        alignment: null,
        ...(member.sequenceEdited ? { sequenceEdited: true as const } : {}),
        ...(member.features?.length ? { features: member.features } : {}),
        ...(member.primers?.length ? { primers: member.primers } : {}),
        ...(member.sequenceAssembled ? { sequenceAssembled: true as const } : {}),
        ...(member.parseError ? { parseError: member.parseError } : {}),
      }))
    : undefined
  return normalizeSequenceRecord({ ...record, traceFiles: lightweightLibraryMembers })
}

export async function upsertOpenTab(
  tabId: string,
  record: SequenceRecord,
  traceFiles: TraceFileRecord[],
  enzymeSet?: CloningWorkspaceEnzymeSet,
) {
  const normalized = openTabRecordSnapshot(record, traceFiles)
  await db.openTabs.put({
    tabId,
    recordId: normalized.id,
    name: normalized.name,
    updatedAt: nowIso(),
    record: normalized,
    ...(enzymeSet ? { enzymeSet: { ...enzymeSet, selectedNames: [...enzymeSet.selectedNames] } } : {}),
  })
  postCrossTabMessage({ type: 'open-tabs-changed' })
}

export async function removeOpenTab(tabId: string) {
  await db.openTabs.delete(tabId)
  postCrossTabMessage({ type: 'open-tabs-changed' })
}

export async function removeOpenTabs(tabIds: string[]) {
  if (tabIds.length === 0) return
  await db.openTabs.bulkDelete(tabIds)
  postCrossTabMessage({ type: 'open-tabs-changed' })
}

/** Drop registry rows that have not heartbeated recently (closed tabs that missed pagehide). */
export async function pruneStaleOpenTabs(currentTabId: string, maxAgeMs = OPEN_TAB_STALE_MS) {
  const now = Date.now()
  const sessions = await db.openTabs.toArray()
  const staleIds = sessions
    .filter((session) => session.tabId !== currentTabId && isOpenTabStale(session.updatedAt, now, maxAgeMs))
    .map((session) => session.tabId)
  if (staleIds.length === 0) return 0
  await db.openTabs.bulkDelete(staleIds)
  postCrossTabMessage({ type: 'open-tabs-changed' })
  return staleIds.length
}

/** Remove every registered tab except the current one (manual cleanup of orphans). */
export async function clearOtherOpenTabs(currentTabId: string) {
  const sessions = await db.openTabs.toArray()
  const otherIds = sessions.filter((session) => session.tabId !== currentTabId).map((session) => session.tabId)
  if (otherIds.length === 0) return 0
  await db.openTabs.bulkDelete(otherIds)
  postCrossTabMessage({ type: 'open-tabs-changed' })
  return otherIds.length
}

export async function listOtherOpenTabs(currentTabId: string): Promise<OpenTabSummary[]> {
  const now = Date.now()
  const sessions = await db.openTabs.orderBy('updatedAt').reverse().toArray()
  return sessions
    .filter((session) => session.tabId !== currentTabId)
    .map((session) => ({
      tabId: session.tabId,
      recordId: session.recordId,
      name: session.name,
      updatedAt: session.updatedAt,
      sequenceLength: session.record.sequence.length,
      molecule: session.record.molecule,
      stale: isOpenTabStale(session.updatedAt, now),
    }))
    .filter((session) => !session.stale)
}

export async function getOpenTabSession(tabId: string): Promise<OpenTabSession | null> {
  const session = await db.openTabs.get(tabId)
  if (!session) return null
  return {
    ...session,
    record: normalizeSequenceRecord(session.record),
  }
}

/** Request a complete source only when cloning needs it; heartbeats stay small. */
export async function getCloningOpenTabSession(tabId: string): Promise<OpenTabSession | null> {
  const session = await getOpenTabSession(tabId)
  if (!session) return null
  const requestId = createId('cloning-source')
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: OpenTabSession | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      unsubscribe()
      resolve(result)
    }
    const unsubscribe = subscribeCrossTabMessages((message) => {
      if (message.type !== 'cloning-source-response' || message.targetTabId !== tabId || message.requestId !== requestId) return
      finish({ ...session, recordId: message.record.id, name: message.record.name, record: normalizeSequenceRecord(message.record), enzymeSet: message.enzymeSet })
    })
    const timeout = window.setTimeout(() => finish(null), 2000)
    postCrossTabMessage({ type: 'cloning-source-request', targetTabId: tabId, requestId })
  })
}

/**
 * Ask another live workspace to persist its current in-memory record before
 * reading it. This avoids the normal one-second open-tab write debounce when
 * an import needs the exact construct currently displayed by that workspace.
 */
export async function getFreshOpenTabSession(tabId: string): Promise<OpenTabSession | null> {
  const before = await db.openTabs.get(tabId)
  const beforeUpdatedAt = before?.updatedAt ?? ''

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      stop()
      resolve()
    }
    const stop = subscribeCrossTabMessages((message) => {
      if (message.type !== 'open-tabs-changed') return
      void db.openTabs.get(tabId).then((session) => {
        if (session && session.updatedAt !== beforeUpdatedAt) finish()
      })
    })
    const timeout = window.setTimeout(finish, 750)
    postCrossTabMessage({ type: 'open-tab-snapshot-request', targetTabId: tabId })
  })

  return getOpenTabSession(tabId)
}
