import { addOperation } from '../../domain/sequence'
import type { ProteinBond, SequenceFeature, SequenceRecord } from '../../domain/types'

/** Deterministic record transitions used by external feature annotation workflows. */
export function appendDnaAnnotations(
  record: SequenceRecord,
  features: readonly SequenceFeature[],
  summary: string,
): SequenceRecord {
  return addOperation({ ...record, features: [...record.features, ...features] }, 'annotateDnaSimilarity', summary)
}

export function appendTranslatedOrfAnnotations(
  record: SequenceRecord,
  features: readonly SequenceFeature[],
  summary: string,
): SequenceRecord {
  return addOperation({ ...record, features: [...record.features, ...features] }, 'annotateTranslatedOrfs', summary)
}

export function appendProteinAnnotations(
  record: SequenceRecord,
  features: readonly SequenceFeature[],
  bonds: readonly ProteinBond[],
  summary: string,
): SequenceRecord {
  return addOperation({
    ...record,
    features: [...record.features, ...features],
    protein: { ...record.protein!, bonds: [...(record.protein?.bonds ?? []), ...bonds] },
  }, 'annotateUniProtSimilarity', summary)
}

export function appendInterProAnnotations(
  record: SequenceRecord,
  features: readonly SequenceFeature[],
  summary: string,
): SequenceRecord {
  return addOperation({ ...record, features: [...record.features, ...features] }, 'annotateInterProPfam', summary)
}
