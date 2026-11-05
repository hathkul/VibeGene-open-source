import type { ProteinTranslationSource, SequenceRecord } from './types'

export type DetachedProteinSourceRecord = {
  sourceIndex: number
  record: SequenceRecord
}

export function detachProteinSourceRecords(record: SequenceRecord): {
  record: SequenceRecord
  detached: DetachedProteinSourceRecord[]
} {
  const protein = record.protein
  const derivation = protein?.translationDerivation
  if (record.molecule !== 'protein' || !protein || !derivation) return { record, detached: [] }

  const detached: DetachedProteinSourceRecord[] = []
  const sources = derivation.sources.map((source, sourceIndex) => {
    if (!source.sourceRecord) return source
    detached.push({ sourceIndex, record: source.sourceRecord })
    const reference: ProteinTranslationSource = { ...source }
    delete reference.sourceRecord
    return reference
  })
  if (!detached.length) return { record, detached }

  return {
    record: {
      ...record,
      protein: {
        ...protein,
        translationDerivation: { ...derivation, sources },
      },
    },
    detached,
  }
}

export function attachProteinSourceRecords(
  record: SequenceRecord,
  detached: readonly DetachedProteinSourceRecord[],
): SequenceRecord {
  const protein = record.protein
  const derivation = protein?.translationDerivation
  if (record.molecule !== 'protein' || !protein || !derivation || !detached.length) return record
  const byIndex = new Map(detached.map((entry) => [entry.sourceIndex, entry.record]))
  const sources = derivation.sources.map((source, sourceIndex): ProteinTranslationSource => {
    const sourceRecord = byIndex.get(sourceIndex)
    return sourceRecord
      ? { ...source, retention: 'complete', sourceRecord }
      : source
  })
  return {
    ...record,
    protein: {
      ...protein,
      translationDerivation: { ...derivation, sources },
    },
  }
}
