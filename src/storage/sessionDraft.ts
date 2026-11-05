import { normalizeSequenceRecord } from '../domain/constructProperties'
import { nowIso } from '../domain/sequence'
import type { SequenceRecord } from '../domain/types'
import { db, getProject, isSessionDraftId, SESSION_DRAFT_ID, SESSION_DRAFT_PREFIX, type StoredProject, type StoredProjectSummary } from './projects'

export { SESSION_DRAFT_ID, isSessionDraftId, SESSION_DRAFT_PREFIX } from './projects'

export function sessionDraftIdForRecord(recordId: string): string {
  return `${SESSION_DRAFT_PREFIX}${recordId}`
}

async function migrateLegacySessionDraft(): Promise<string | null> {
  const legacy = await getProject(SESSION_DRAFT_ID)
  if (!legacy) return null
  const nextId = sessionDraftIdForRecord(legacy.record.id)
  const normalized = normalizeSequenceRecord(legacy.record)
  await db.transaction('rw', db.projects, db.projectRecords, async () => {
    await db.projects.put({
      id: nextId,
      name: normalized.name,
      updatedAt: legacy.updatedAt,
      folderId: null,
      tags: [],
      sequenceLength: normalized.sequence.length,
      molecule: normalized.molecule,
      topology: normalized.topology,
    })
    await db.projectRecords.put({ id: nextId, record: normalized })
    await db.projects.delete(SESSION_DRAFT_ID)
    await db.projectRecords.delete(SESSION_DRAFT_ID)
  })
  return nextId
}

async function listDraftSummaries(): Promise<StoredProjectSummary[]> {
  await migrateLegacySessionDraft()
  const projects = await db.projects.orderBy('updatedAt').reverse().toArray()
  return projects.filter((project) => isSessionDraftId(project.id))
}

async function trimDrafts(maxDrafts: number) {
  const max = Math.max(1, maxDrafts)
  const drafts = await listDraftSummaries()
  const toDelete = drafts.slice(max)
  if (!toDelete.length) return
  await db.transaction('rw', db.projects, db.projectRecords, async () => {
    for (const draft of toDelete) {
      await db.projects.delete(draft.id)
      await db.projectRecords.delete(draft.id)
    }
  })
}

export async function saveSessionDraft(record: SequenceRecord, maxDrafts: number) {
  await migrateLegacySessionDraft()
  const normalized = normalizeSequenceRecord(record)
  const draftId = sessionDraftIdForRecord(normalized.id)
  const timestamp = nowIso()
  await db.transaction('rw', db.projects, db.projectRecords, async () => {
    await db.projects.put({
      id: draftId,
      name: normalized.name,
      updatedAt: timestamp,
      folderId: null,
      tags: [],
      sequenceLength: normalized.sequence.length,
      molecule: normalized.molecule,
      topology: normalized.topology,
    })
    await db.projectRecords.put({ id: draftId, record: normalized })
  })
  await trimDrafts(maxDrafts)
}

export async function listSessionDrafts(): Promise<StoredProjectSummary[]> {
  return listDraftSummaries()
}

export async function getSessionDraft(id: string): Promise<StoredProject | null> {
  if (!isSessionDraftId(id)) return null
  return getProject(id)
}

export async function deleteSessionDraft(id: string) {
  if (!isSessionDraftId(id)) return
  await db.transaction('rw', db.projects, db.projectRecords, async () => {
    await db.projects.delete(id)
    await db.projectRecords.delete(id)
  })
}

export async function clearSessionDraftForRecord(recordId: string) {
  await deleteSessionDraft(sessionDraftIdForRecord(recordId))
}

/** @deprecated Use clearSessionDraftForRecord */
export async function clearSessionDraft() {
  await migrateLegacySessionDraft()
  const drafts = await listDraftSummaries()
  await db.transaction('rw', db.projects, db.projectRecords, async () => {
    for (const draft of drafts) {
      await db.projects.delete(draft.id)
      await db.projectRecords.delete(draft.id)
    }
  })
}

/** @deprecated Use listSessionDrafts */
export async function loadSessionDraft(): Promise<StoredProject | null> {
  const drafts = await listSessionDrafts()
  if (!drafts[0]) return null
  return getSessionDraft(drafts[0].id)
}

export async function trimSessionDraftsToLimit(maxDrafts: number) {
  await trimDrafts(maxDrafts)
}
