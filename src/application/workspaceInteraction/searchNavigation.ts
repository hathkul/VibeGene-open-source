import { normalizeDna, sanitizeProtein } from '../../domain/sequence'
import type { SequenceRecord } from '../../domain/types'

export function searchHitRange(record: Pick<SequenceRecord, 'molecule' | 'sequence'>, query: string, start: number) {
  const queryLength = searchQueryLength(record.molecule, query)
  if (start < 0 || start >= record.sequence.length) return null
  return { start, end: Math.min(record.sequence.length, start + queryLength) }
}

export function searchQueryLength(molecule: SequenceRecord['molecule'], query: string): number {
  return molecule === 'protein' ? sanitizeProtein(query).length : normalizeDna(query).length
}

export function nextSearchHitIndex(current: number, direction: -1 | 1, count: number): number | null {
  if (count <= 0) return null
  return (current + direction + count) % count
}
