import type { ProteinComparisonAlignmentCacheEntry, ProteinComparisonSource, ProteinComparisonVariableRegion } from '../../domain/proteinAlignmentTypes'
import type { ProteinBond, SequenceRecord } from '../../domain/types'
import type { SequenceFeature } from '../../domain/types'
import { addOperation } from '../../domain/sequence'

/** Pure record transitions shared by the protein comparison and bond controllers. */
export function replaceProteinComparisonSources(
  record: SequenceRecord,
  sources: readonly ProteinComparisonSource[],
): SequenceRecord {
  if (record.molecule !== 'protein' || !record.protein) return record
  const sourceIds = new Set(sources.map((source) => source.id))
  return {
    ...record,
    protein: {
      ...record.protein,
      comparisonSources: [...sources],
      comparisonAlignmentCache: (record.protein.comparisonAlignmentCache ?? [])
        .filter((entry) => sourceIds.has(entry.sourceId)),
    },
  }
}

export function replaceProteinComparisonVariableRegions(
  record: SequenceRecord,
  regions: readonly ProteinComparisonVariableRegion[],
): SequenceRecord {
  if (record.molecule !== 'protein' || !record.protein) return record
  return {
    ...record,
    protein: { ...record.protein, comparisonVariableRegions: [...regions] },
  }
}

export function replaceProteinComparisonAlignmentCacheEntry(
  record: SequenceRecord,
  entry: ProteinComparisonAlignmentCacheEntry,
): SequenceRecord {
  if (record.molecule !== 'protein' || !record.protein) return record
  const existing = record.protein.comparisonAlignmentCache ?? []
  const previous = existing.find((candidate) => candidate.sourceId === entry.sourceId)
  if (previous?.signature === entry.signature
    && previous.alignment === entry.alignment
    && previous.error === entry.error) return record
  return {
    ...record,
    protein: {
      ...record.protein,
      comparisonAlignmentCache: [
        ...existing.filter((candidate) => candidate.sourceId !== entry.sourceId),
        entry,
      ],
    },
  }
}

export function upsertProteinBond(record: SequenceRecord, next: ProteinBond): SequenceRecord {
  if (record.molecule !== 'protein' || !record.protein) return record
  const exists = record.protein.bonds.some((bond) => bond.id === next.id)
  return {
    ...record,
    protein: {
      ...record.protein,
      bonds: exists
        ? record.protein.bonds.map((bond) => bond.id === next.id ? next : bond)
        : [...record.protein.bonds, next],
    },
  }
}

export function removeProteinBond(record: SequenceRecord, bondId: string): SequenceRecord {
  if (record.molecule !== 'protein' || !record.protein) return record
  return {
    ...record,
    protein: {
      ...record.protein,
      bonds: record.protein.bonds.filter((bond) => bond.id !== bondId),
    },
  }
}

export function setProteinBondVisibility(record: SequenceRecord, bondId: string, visible: boolean): SequenceRecord {
  if (record.molecule !== 'protein' || !record.protein) return record
  return {
    ...record,
    protein: {
      ...record.protein,
      bonds: record.protein.bonds.map((candidate) => candidate.id === bondId
        ? { ...candidate, visible: visible ? undefined : false }
        : candidate),
    },
  }
}

export function replaceProteinAnnotations(
  record: SequenceRecord,
  features: readonly SequenceFeature[],
  bonds: readonly ProteinBond[] | undefined,
  operationType: string,
  summary: string,
): SequenceRecord {
  if (record.molecule !== 'protein' || !record.protein) return record
  return addOperation({
    ...record,
    features: [...features],
    ...(bonds ? { protein: { ...record.protein, bonds: [...bonds] } } : {}),
  }, operationType, summary)
}
