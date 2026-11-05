import { peptideMassDa } from '../domain/commonFeatures'
import { parseFeatureQualifiers } from '../domain/featureQualifiers'
import { defaultFeatureTranslationOptions, translateAnnotatedFeature } from '../domain/geneticCode'
import type { SequenceFeature, SequenceRecord, Topology } from '../domain/types'
import { normalizePeptide } from '../application/databaseProtein'
import type { DatabaseProteinRow, DatabaseProteinSource } from '../application/databaseProtein'
import { db, isSessionDraftId, listProjectSummaries, type StoredProjectSummary } from './projects'

export { createSequenceRecordFromDatabaseProtein, normalizePeptide } from '../application/databaseProtein'
export type { DatabaseProteinRow, DatabaseProteinSource } from '../application/databaseProtein'

export type DatabaseProteinHit = {
  key: string
  name: string
  sequence: string
  color: string
  product: string
  projectId: string
  projectName: string
  folderId: string | null
  featureId?: string
}

/** Indexed peptide rows for one construct (folder/name come from the live summary). */
export type StoredProteinHit = {
  key: string
  name: string
  sequence: string
  color: string
  product: string
  featureId?: string
}

export type StoredProteinProjectIndex = {
  projectId: string
  /** SequenceRecord.updatedAt when these hits were computed. */
  recordUpdatedAt: string
  /** Translation/index semantics version; missing means the legacy extended-CDS index. */
  indexVersion?: number
  hits: StoredProteinHit[]
}

const PROTEIN_PROJECT_INDEX_VERSION = 2

/** Same name (case-insensitive) and peptide sequence count as one protein. */
export function proteinIdentityKey(name: string, sequence: string): string {
  return `${name.trim().toLowerCase()}\0${normalizePeptide(sequence)}`
}

function isCdsFeature(feature: SequenceFeature): boolean {
  return feature.type.trim().toUpperCase() === 'CDS'
}

/** Translate complete codons inside a translated CDS feature, never its display extension. */
export function peptideForTranslatedCds(
  feature: SequenceFeature,
  sequence: string,
): string | null {
  if (!isCdsFeature(feature)) return null
  const stored = parseFeatureQualifiers(feature.notes).translation
  if (!feature.translateInSequenceView && !stored) return null
  if (!feature.locations.length) return null

  const options = feature.translation ?? defaultFeatureTranslationOptions(feature.locations.length)
  const peptide = normalizePeptide(translateAnnotatedFeature(feature, sequence, options))
  return peptide || null
}

export function proteinHitsFromRecord(
  record:
    | {
        features?: SequenceFeature[]
        sequence?: string
        topology?: Topology
      }
    | null
    | undefined,
  source: DatabaseProteinSource,
): DatabaseProteinHit[] {
  const features = record?.features
  const dna = record?.sequence ?? ''
  if (!features?.length || !dna) return []
  const hits: DatabaseProteinHit[] = []

  for (const feature of features) {
    const peptide = peptideForTranslatedCds(feature, dna)
    if (!peptide) continue
    const qualifiers = parseFeatureQualifiers(feature.notes)
    const name = feature.name?.trim() || qualifiers.product?.trim() || 'CDS'
    hits.push({
      key: proteinIdentityKey(name, peptide),
      name,
      sequence: peptide,
      color: feature.color?.trim() || '#f59e0b',
      product: qualifiers.product?.trim() || '',
      projectId: source.projectId,
      projectName: source.projectName,
      folderId: source.folderId,
      featureId: feature.id,
    })
  }
  return hits
}

function storedHitsFromRecord(record: SequenceRecord): StoredProteinHit[] {
  return proteinHitsFromRecord(record, {
    projectId: record.id,
    projectName: record.name,
    folderId: null,
  }).map((hit) => ({
    key: hit.key,
    name: hit.name,
    sequence: hit.sequence,
    color: hit.color,
    product: hit.product,
    featureId: hit.featureId,
  }))
}

function hitsFromIndex(
  index: StoredProteinProjectIndex,
  summary: StoredProjectSummary,
): DatabaseProteinHit[] {
  return index.hits.map((hit) => ({
    ...hit,
    projectId: summary.id,
    projectName: summary.name,
    folderId: summary.folderId ?? null,
    featureId: hit.featureId,
  }))
}

/** Write or refresh the protein cache for one construct after save/import/sync. */
export async function indexProteinsForProject(record: SequenceRecord): Promise<void> {
  if (!record.id || isSessionDraftId(record.id)) return
  await db.proteinProjectIndex.put({
    projectId: record.id,
    recordUpdatedAt: record.updatedAt,
    indexVersion: PROTEIN_PROJECT_INDEX_VERSION,
    hits: storedHitsFromRecord(record),
  })
}

export async function removeProteinIndexForProject(projectId: string): Promise<void> {
  if (!projectId) return
  await db.proteinProjectIndex.delete(projectId)
}

export async function removeProteinIndexForProjects(projectIds: readonly string[]): Promise<void> {
  if (!projectIds.length) return
  await db.proteinProjectIndex.bulkDelete([...projectIds])
}

/** Collapse hits that share an identity key, keeping source files. */
export function dedupeProteinHits(hits: readonly DatabaseProteinHit[]): DatabaseProteinRow[] {
  const byKey = new Map<string, DatabaseProteinRow>()
  for (const hit of hits) {
    const existing = byKey.get(hit.key)
    const source: DatabaseProteinSource = {
      projectId: hit.projectId,
      projectName: hit.projectName,
      folderId: hit.folderId,
      featureId: hit.featureId,
    }
    if (!existing) {
      byKey.set(hit.key, {
        key: hit.key,
        name: hit.name,
        sequence: hit.sequence,
        color: hit.color,
        product: hit.product,
        sources: [source],
      })
      continue
    }
    if (!existing.sources.some((entry) => entry.projectId === source.projectId)) {
      existing.sources.push(source)
    }
    if (!existing.product && hit.product) existing.product = hit.product
  }
  return [...byKey.values()]
}

export function proteinMassLabel(sequence: string): string {
  const mass = peptideMassDa(sequence)
  if (!mass) return '—'
  if (mass >= 1000) return `${(mass / 1000).toFixed(1)} kDa`
  return `${Math.round(mass)} Da`
}

/**
 * Load translated CDS hits from the persistent per-project index.
 * Missing rows are backfilled from projectRecords (first open / legacy DB).
 * Saves and deletes keep the index current so a warm library avoids re-translation.
 */
export async function scanDatabaseProteinHits(): Promise<DatabaseProteinHit[]> {
  const summaries = await listProjectSummaries()
  const byId = new Map(summaries.map((summary) => [summary.id, summary]))
  const indexed = await db.proteinProjectIndex.toArray()
  const indexById = new Map(indexed.map((row) => [row.projectId, row]))

  const orphanIds = indexed
    .map((row) => row.projectId)
    .filter((id) => isSessionDraftId(id) || !byId.has(id))
  if (orphanIds.length) await db.proteinProjectIndex.bulkDelete(orphanIds)

  const staleSummaries = summaries.filter((summary) => {
    const index = indexById.get(summary.id)
    return !index
      || index.indexVersion !== PROTEIN_PROJECT_INDEX_VERSION
      || index.recordUpdatedAt !== summary.updatedAt
  })
  const chunkSize = 40
  for (let offset = 0; offset < staleSummaries.length; offset += chunkSize) {
    const chunk = staleSummaries.slice(offset, offset + chunkSize)
    const bodies = await db.projectRecords.bulkGet(chunk.map((summary) => summary.id))
    const repaired = bodies.flatMap((body, index) => {
      if (!body?.record) return []
      const row: StoredProteinProjectIndex = {
        projectId: chunk[index]!.id,
        recordUpdatedAt: body.record.updatedAt,
        indexVersion: PROTEIN_PROJECT_INDEX_VERSION,
        hits: storedHitsFromRecord(body.record),
      }
      return [row]
    })
    if (repaired.length) {
      await db.proteinProjectIndex.bulkPut(repaired)
      for (const row of repaired) indexById.set(row.projectId, row)
    }
  }

  const hits: DatabaseProteinHit[] = []
  for (const summary of summaries) {
    if (isSessionDraftId(summary.id)) continue
    const index = indexById.get(summary.id)
    if (!index) continue
    hits.push(...hitsFromIndex(index, summary))
  }

  return hits
}
