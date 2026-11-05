import { describe, expect, it } from 'vitest'
import { buildProteinAlignmentMapLayout } from './proteinAlignmentMap'
import type { ProteinGuidedAlignment } from './proteinAlignmentTypes'

describe('protein alignment map layout', () => {
  it('groups contiguous reference outcomes and keeps insertion markers', () => {
    const alignment: ProteinGuidedAlignment = {
      sourceId: 'read',
      sourceKind: 'dna',
      orientation: 'forward',
      referenceStart: 2,
      referenceEnd: 8,
      sourceStart: 0,
      sourceEnd: 20,
      score: 18,
      identityCount: 2,
      similarCount: 1,
      mismatchCount: 1,
      gapCount: 1,
      frameShiftCount: 1,
      columns: [
        { referenceIndex: 2, referenceBoundary: 2, event: 'residue', similarity: 'identity', score: 5 },
        { referenceIndex: 3, referenceBoundary: 3, event: 'residue', similarity: 'identity', score: 5 },
        { referenceIndex: 4, referenceBoundary: 4, event: 'residue', similarity: 'similar', score: 2 },
        { referenceIndex: null, referenceBoundary: 5, event: 'source-insertion', similarity: 'gap', score: -7 },
        { referenceIndex: null, referenceBoundary: 5, event: 'source-insertion', similarity: 'gap', score: -7 },
        { referenceIndex: 5, referenceBoundary: 5, event: 'residue', similarity: 'mismatch', score: -2 },
        { referenceIndex: 6, referenceBoundary: 6, event: 'reference-gap', similarity: 'gap', score: -7 },
        { referenceIndex: 7, referenceBoundary: 7, event: 'frameshift', similarity: 'frameshift', score: -9 },
      ],
    }

    expect(buildProteinAlignmentMapLayout(alignment)).toEqual({
      start: 2,
      end: 8,
      segments: [
        { start: 2, end: 4, similarity: 'identity' },
        { start: 4, end: 5, similarity: 'similar' },
        { start: 5, end: 6, similarity: 'mismatch' },
        { start: 6, end: 7, similarity: 'gap' },
        { start: 7, end: 8, similarity: 'frameshift' },
      ],
      insertions: [{ boundary: 5, count: 2 }],
    })
  })
})
