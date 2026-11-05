import type { SequenceRecord } from '../../domain/types'

/** Local storage is only a fast path; lossless payloads must use the handoff store. */
export function canUseCompactHandoff(record: SequenceRecord): boolean {
  if (record.traceFiles?.length || record.snapGeneNativeHistory) return false
  return !record.protein?.translationDerivation?.sources.some((source) => Boolean(source.sourceRecord))
}
