import type { Primer, SequenceRecord } from '../domain/types'
import { normalizeDna } from '../domain/sequence'
import type { PrimerPropertiesPayload } from '../application/ports/hybridWindows'
import {
  constructAnnealFieldsFromRecord,
  findRecordPrimerBySequence,
  primerPropertiesPayloadFromLibrary,
} from '../application/primerWorkflow/primerPropertiesPayload'
import {
  db,
  isSessionDraftId,
  listProjectSummaries,
  type StoredCommonPrimer,
  type StoredProjectSummary,
} from './projects'
import { normalizeTags } from './projectLibrary'
import type { StoredFolderPrimerList } from './folderPrimerLists'
import { listFolderPrimerLists } from './folderPrimerLists'

export const COMMON_PRIMERS_SOURCE_ID = '__common-primers__'
export const COMMON_PRIMERS_SOURCE_NAME = 'Common primers'

export type DatabasePrimerSource = {
  projectId: string
  projectName: string
  folderId: string | null
}

export type DatabasePrimerHit = {
  key: string
  name: string
  sequence: string
  color: string
  description: string
  projectId: string
  projectName: string
  folderId: string | null
  commonId?: string
  folderPrimerListId?: string
}

export type DatabasePrimerRow = {
  key: string
  name: string
  sequence: string
  color: string
  description: string
  sources: DatabasePrimerSource[]
  commonId?: string
  folderPrimerListId?: string
}

/** Primer data derived from one construct, without mutable library metadata. */
export type StoredPrimerHit = {
  key: string
  name: string
  sequence: string
  color: string
  description: string
}

export type StoredPrimerProjectIndex = {
  projectId: string
  /** SequenceRecord.updatedAt when these hits were computed. */
  recordUpdatedAt: string
  hits: StoredPrimerHit[]
}

import { primerIdentityKey } from '../application/primerWorkflow/commonPrimerTags'
export { collectTagsAmongCommonPrimers, primerIdentityKey } from '../application/primerWorkflow/commonPrimerTags'

export function primerHitsFromRecord(
  primers: Primer[] | undefined,
  source: DatabasePrimerSource,
): DatabasePrimerHit[] {
  if (!primers?.length) return []
  const hits: DatabasePrimerHit[] = []
  for (const primer of primers) {
    const sequence = normalizeDna(primer.sequence)
    if (!sequence) continue
    const name = primer.name?.trim() || 'Primer'
    hits.push({
      key: primerIdentityKey(name, sequence),
      name,
      sequence,
      color: primer.color?.trim() || '#7c3aed',
      description: primer.description ?? '',
      projectId: source.projectId,
      projectName: source.projectName,
      folderId: source.folderId,
    })
  }
  return hits
}

function storedHitsFromRecord(record: SequenceRecord): StoredPrimerHit[] {
  return primerHitsFromRecord(record.primers, {
    projectId: record.id,
    projectName: record.name,
    folderId: null,
  }).map(({ key, name, sequence, color, description }) => ({
    key,
    name,
    sequence,
    color,
    description,
  }))
}

function hitsFromIndex(
  index: StoredPrimerProjectIndex,
  summary: StoredProjectSummary,
): DatabasePrimerHit[] {
  return index.hits.map((hit) => ({
    ...hit,
    projectId: summary.id,
    projectName: summary.name,
    folderId: summary.folderId ?? null,
  }))
}

/** Refresh the persistent primer cache after a construct is saved/imported/synced. */
export async function indexPrimersForProject(record: SequenceRecord): Promise<void> {
  if (!record.id || isSessionDraftId(record.id)) return
  await db.primerProjectIndex.put({
    projectId: record.id,
    recordUpdatedAt: record.updatedAt,
    hits: storedHitsFromRecord(record),
  })
}

export async function removePrimerIndexForProject(projectId: string): Promise<void> {
  if (!projectId) return
  await db.primerProjectIndex.delete(projectId)
}

export async function removePrimerIndexForProjects(projectIds: readonly string[]): Promise<void> {
  if (!projectIds.length) return
  await db.primerProjectIndex.bulkDelete([...projectIds])
}

export function commonPrimersToHits(primers: StoredCommonPrimer[]): DatabasePrimerHit[] {
  return primers.flatMap((primer) => {
    const sequence = normalizeDna(primer.sequence)
    if (!sequence) return []
    const name = primer.name?.trim() || 'Primer'
    return [
      {
        key: primerIdentityKey(name, sequence),
        name,
        sequence,
        color: primer.color?.trim() || '#7c3aed',
        description: primer.description ?? '',
        projectId: COMMON_PRIMERS_SOURCE_ID,
        projectName: COMMON_PRIMERS_SOURCE_NAME,
        folderId: null,
        commonId: primer.id,
      },
    ]
  })
}

export function folderPrimerListsToHits(lists: StoredFolderPrimerList[]): DatabasePrimerHit[] {
  const hits: DatabasePrimerHit[] = []
  for (const list of lists) {
    for (const primer of list.primers) {
      const sequence = normalizeDna(primer.sequence)
      if (!sequence) continue
      const name = primer.name?.trim() || 'Primer'
      hits.push({
        key: primerIdentityKey(name, sequence),
        name,
        sequence,
        color: primer.color?.trim() || '#7c3aed',
        description: primer.description ?? '',
        projectId: list.id,
        projectName: list.name,
        folderId: list.folderId,
        folderPrimerListId: list.id,
      })
    }
  }
  return hits
}

export function primerRowIsCommon(row: Pick<DatabasePrimerRow, 'commonId' | 'sources'>): boolean {
  return Boolean(row.commonId) || row.sources.some((source) => source.projectId === COMMON_PRIMERS_SOURCE_ID)
}

/** Collapse hits that share an identity key, keeping source files. */
export function dedupePrimerHits(hits: readonly DatabasePrimerHit[]): DatabasePrimerRow[] {
  const byKey = new Map<string, DatabasePrimerRow>()
  for (const hit of hits) {
    const existing = byKey.get(hit.key)
    const source: DatabasePrimerSource = {
      projectId: hit.projectId,
      projectName: hit.projectName,
      folderId: hit.folderId,
    }
    if (!existing) {
      byKey.set(hit.key, {
        key: hit.key,
        name: hit.name,
        sequence: hit.sequence,
        color: hit.color,
        description: hit.description,
        sources: [source],
        commonId: hit.commonId,
        folderPrimerListId: hit.folderPrimerListId,
      })
      continue
    }
    if (!existing.sources.some((entry) => entry.projectId === source.projectId)) {
      existing.sources.push(source)
    }
    if (!existing.commonId && hit.commonId) existing.commonId = hit.commonId
    if (!existing.folderPrimerListId && hit.folderPrimerListId) {
      existing.folderPrimerListId = hit.folderPrimerListId
    }
  }
  return [...byKey.values()]
}

/**
 * Load primer hits from the persistent per-project index. Only legacy/missing
 * index rows deserialize their source construct, once, and are then cached.
 */
export async function scanDatabasePrimerHits(): Promise<DatabasePrimerHit[]> {
  const summaries = await listProjectSummaries()
  const byId = new Map(summaries.map((summary) => [summary.id, summary]))
  const indexed = await db.primerProjectIndex.toArray()
  const indexById = new Map(indexed.map((row) => [row.projectId, row]))

  const orphanIds = indexed
    .map((row) => row.projectId)
    .filter((id) => isSessionDraftId(id) || !byId.has(id))
  if (orphanIds.length) await db.primerProjectIndex.bulkDelete(orphanIds)

  const staleSummaries = summaries.filter((summary) => {
    const index = indexById.get(summary.id)
    return !index || index.recordUpdatedAt !== summary.updatedAt
  })
  const chunkSize = 40
  for (let offset = 0; offset < staleSummaries.length; offset += chunkSize) {
    const chunk = staleSummaries.slice(offset, offset + chunkSize)
    const bodies = await db.projectRecords.bulkGet(chunk.map((summary) => summary.id))
    const repaired = bodies.flatMap((body, index) => {
      if (!body?.record) return []
      const row: StoredPrimerProjectIndex = {
        projectId: chunk[index]!.id,
        recordUpdatedAt: body.record.updatedAt,
        hits: storedHitsFromRecord(body.record),
      }
      return [row]
    })
    if (repaired.length) {
      await db.primerProjectIndex.bulkPut(repaired)
      for (const row of repaired) indexById.set(row.projectId, row)
    }
  }

  const hits: DatabasePrimerHit[] = []

  for (const summary of summaries) {
    if (isSessionDraftId(summary.id)) continue
    const index = indexById.get(summary.id)
    if (!index) continue
    hits.push(...hitsFromIndex(index, summary))
  }

  hits.push(...folderPrimerListsToHits(await listFolderPrimerLists()))

  return hits
}

export function tagsForPrimerKey(tagMap: Map<string, string[]>, key: string): string[] {
  return tagMap.get(key) ?? []
}

export function collectPrimerTagNames(tagMap: Map<string, string[]>): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const list of tagMap.values()) {
    for (const tag of list) {
      const folded = tag.toLowerCase()
      if (seen.has(folded)) continue
      seen.add(folded)
      tags.push(tag)
    }
  }
  return tags.sort((a, b) => a.localeCompare(b))
}

export function filterPrimersByTag<T extends { name: string; sequence: string }>(
  primers: readonly T[],
  tagMap: Map<string, string[]>,
  tag: string,
): T[] {
  const want = tag.trim().toLowerCase()
  if (!want) return [...primers]
  return primers.filter((primer) =>
    (tagMap.get(primerIdentityKey(primer.name, primer.sequence)) ?? []).some(
      (entry) => entry.toLowerCase() === want,
    ),
  )
}

/** Tags present on every primer key (case-insensitive intersection). */
export function commonPrimerTags(keys: string[], tagMap: Map<string, string[]>): string[] {
  if (keys.length === 0) return []
  const [first, ...rest] = keys.map((key) => tagMap.get(key) ?? [])
  const intersection = new Map(first.map((tag) => [tag.toLowerCase(), tag]))
  for (const list of rest) {
    const present = new Set(list.map((tag) => tag.toLowerCase()))
    for (const folded of [...intersection.keys()]) {
      if (!present.has(folded)) intersection.delete(folded)
    }
  }
  return [...intersection.values()].sort((a, b) => a.localeCompare(b))
}

export async function loadPrimerTagMap(): Promise<Map<string, string[]>> {
  const rows = await db.primerLibraryTags.toArray()
  return new Map(rows.map((row) => [row.key, row.tags ?? []]))
}

export async function setPrimerKeysTags(keys: string[], tags: string[]): Promise<number> {
  const cleaned = normalizeTags(tags)
  let updated = 0
  for (const key of keys) {
    if (!key) continue
    if (cleaned.length === 0) {
      await db.primerLibraryTags.delete(key)
    } else {
      await db.primerLibraryTags.put({ key, tags: cleaned })
    }
    updated += 1
  }
  return updated
}

export async function primerPropertiesPayloadFromDatabaseRow(
  row: DatabasePrimerRow,
  loadRecord: (projectId: string) => Promise<SequenceRecord | null>,
): Promise<PrimerPropertiesPayload> {
  const base = {
    name: row.name,
    sequence: row.sequence,
    color: row.color,
    description: row.description,
  }
  if (primerRowIsCommon(row)) {
    const common = row.commonId ? await db.commonPrimers.get(row.commonId) : undefined
    return primerPropertiesPayloadFromLibrary({ ...base, commonId: common?.id, specificity: common?.specificity })
  }
  const constructSource = row.sources.find((source) => source.projectId !== COMMON_PRIMERS_SOURCE_ID)
  if (!constructSource) {
    return primerPropertiesPayloadFromLibrary(base)
  }
  const record = await loadRecord(constructSource.projectId)
  if (!record) {
    return primerPropertiesPayloadFromLibrary(base)
  }
  return primerPropertiesPayloadFromLibrary({ ...base, specificity: findRecordPrimerBySequence(record, row.sequence)?.specificity }, constructAnnealFieldsFromRecord(record, row.sequence))
}

export function databasePrimerRowAfterCommonSave(
  previous: DatabasePrimerRow,
  saved: { id: string; name: string; sequence: string; color?: string; description?: string },
): DatabasePrimerRow {
  return {
    key: previous.key,
    name: saved.name,
    sequence: saved.sequence,
    color: saved.color?.trim() || previous.color,
    description: saved.description ?? '',
    sources: [{ projectId: COMMON_PRIMERS_SOURCE_ID, projectName: COMMON_PRIMERS_SOURCE_NAME, folderId: null }],
    commonId: saved.id,
  }
}
