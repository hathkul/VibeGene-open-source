import { describe, expect, it } from 'vitest'
import type { ProteinComparisonSource, ProteinComparisonVariableRegion } from './proteinAlignmentTypes'
import { proteinAlignmentCacheSignature } from './proteinAlignmentCache'

const source: ProteinComparisonSource = {
  id: 'source-1',
  name: 'Comparison',
  kind: 'dna',
  sequence: 'ATGGCTGATGAA',
  enabled: true,
}

const regions: ProteinComparisonVariableRegion[] = [{ id: 'cdr-1', start: 2, end: 5 }]

describe('persisted protein alignment cache signatures', () => {
  it('ignores display-only source and region metadata', () => {
    const initial = proteinAlignmentCacheSignature('MADE', source, 'Standard', regions)
    const renamed = proteinAlignmentCacheSignature(
      'MADE',
      { ...source, name: 'Renamed', enabled: false },
      'Standard',
      [{ ...regions[0]!, id: 'different-id' }],
    )
    expect(renamed).toBe(initial)
  })

  it('invalidates when an alignment input changes', () => {
    const initial = proteinAlignmentCacheSignature('MADE', source, 'Standard', regions)
    expect(proteinAlignmentCacheSignature('MAAE', source, 'Standard', regions)).not.toBe(initial)
    expect(proteinAlignmentCacheSignature('MADE', { ...source, sequence: `${source.sequence}A` }, 'Standard', regions)).not.toBe(initial)
    expect(proteinAlignmentCacheSignature('MADE', { ...source, disabledFrameShiftKeys: ['shift:1'] }, 'Standard', regions)).not.toBe(initial)
    expect(proteinAlignmentCacheSignature('MADE', source, 'Standard', [{ ...regions[0]!, end: 6 }])).not.toBe(initial)
  })
})
