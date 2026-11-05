import { describe, expect, it } from 'vitest'
import {
  alignDnaComparisonSource,
  buildDnaComparisonLayout,
  dnaComparisonCoveragePercent,
  dnaComparisonIdentityPercent,
} from '../src/domain/dnaComparisonAlignment'
import type { DnaComparisonAlignment, DnaComparisonSource } from '../src/domain/dnaComparisonTypes'

function source(sequence: string): DnaComparisonSource {
  return { id: 'source-1', name: 'Source', sequence, enabled: true }
}

describe('DNA comparative alignment', () => {
  it('aligns an identical source to the fixed reference', () => {
    const alignment = alignDnaComparisonSource('ATGCCGTA', source('ATGCCGTA'))
    expect(alignment?.orientation).toBe('forward')
    expect(alignment?.identityCount).toBe(8)
    expect(dnaComparisonIdentityPercent(alignment!)).toBe(100)
    expect(dnaComparisonCoveragePercent(alignment!, 8)).toBe(100)
  })

  it('detects reverse-complement orientation', () => {
    const alignment = alignDnaComparisonSource('ATGCCCTA', source('TAGGGCAT'))
    expect(alignment?.orientation).toBe('reverse')
    expect(alignment?.identityCount).toBe(8)
  })

  it('merges insertion columns across independently aligned sources', () => {
    const insertionAlignment: DnaComparisonAlignment = {
      sourceId: 'inserted',
      templateStart: 0,
      templateEnd: 3,
      traceStart: 0,
      traceEnd: 4,
      mismatchCount: 0,
      gapCount: 1,
      identityCount: 3,
      orientation: 'forward',
      alignmentScore: 1,
      columns: [
        { kind: 'match', templateIndex: 0, traceIndex: 0, match: true },
        { kind: 'traceInsert', traceIndex: 1 },
        { kind: 'match', templateIndex: 1, traceIndex: 2, match: true },
        { kind: 'match', templateIndex: 2, traceIndex: 3, match: true },
      ],
    }
    const layout = buildDnaComparisonLayout(3, [insertionAlignment])
    expect(layout).toEqual([
      { kind: 'reference', referenceIndex: 0 },
      { kind: 'insertion', referenceBoundary: 1, insertionIndex: 0 },
      { kind: 'reference', referenceIndex: 1 },
      { kind: 'reference', referenceIndex: 2 },
    ])
  })
})
