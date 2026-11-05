import type {
  ProteinComparisonAlignmentCacheEntry,
  ProteinComparisonSource,
  ProteinComparisonVariableRegion,
} from './proteinAlignmentTypes'

export const PROTEIN_ALIGNMENT_CACHE_VERSION = 'protein-guided-v2'

function hashText(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function proteinAlignmentCacheSignature(
  reference: string,
  source: ProteinComparisonSource,
  geneticCode: string,
  variableRegions: readonly ProteinComparisonVariableRegion[],
) {
  return `${PROTEIN_ALIGNMENT_CACHE_VERSION}:${hashText(JSON.stringify([
    reference,
    geneticCode,
    source.id,
    source.kind,
    source.sequence,
    source.disabledFrameShiftKeys ?? [],
    variableRegions.map((region) => [region.start, region.end]),
  ]))}`
}

export type { ProteinComparisonAlignmentCacheEntry }
