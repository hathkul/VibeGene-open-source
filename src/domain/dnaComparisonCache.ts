import type {
  DnaComparisonAlignmentCacheEntry,
  DnaComparisonSource,
} from './dnaComparisonTypes'

export const DNA_COMPARISON_CACHE_VERSION = 'dna-reference-guided-v2'

function hashText(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function dnaComparisonCacheSignature(
  reference: string,
  source: DnaComparisonSource,
  topology: 'linear' | 'circular',
) {
  return `${DNA_COMPARISON_CACHE_VERSION}:${hashText(JSON.stringify([
    reference,
    topology,
    source.id,
    source.sequence,
  ]))}`
}

export type { DnaComparisonAlignmentCacheEntry }
