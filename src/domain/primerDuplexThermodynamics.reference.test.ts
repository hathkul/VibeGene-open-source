import { describe, expect, it } from 'vitest'
import { calculatePrimerDuplexTm } from './primerDuplexThermodynamics'

describe('primer duplex thermodynamic strand symmetry', () => {
  it('preserves ΔH and ΔS when swapping strands and reversing both sequences', () => {
    const vectors = [
      ['CGTTCCAAAGATGTGGGCATGAGCTTAC', 'GCAAGGCTTCTACACCCGTACTCGAATG'],
      ['GCGATTGGCACTTTGGTGAAC', 'CGCTACATATGAAACCACTTG'],
    ] as const
    for (const [primer, target] of vectors) {
      const result = calculatePrimerDuplexTm(primer, target)
      // In the alternate orientation, the original 3′→5′ target is the new
      // 5′→3′ primer, and the original 5′→3′ primer is the new 3′→5′ target.
      const reversed = calculatePrimerDuplexTm([...target].reverse().join(''), [...primer].reverse().join(''))
      expect(result.status).toBe('estimated')
      expect(reversed.status).toBe('estimated')
      if (result.status !== 'estimated' || reversed.status !== 'estimated') continue
      expect(reversed.deltaH).toBeCloseTo(result.deltaH, 10)
      expect(reversed.deltaS).toBeCloseTo(result.deltaS, 10)
      expect(reversed.mismatchCount).toBe(result.mismatchCount)
      expect(reversed.mismatchPositions).toEqual(result.mismatchPositions.map((position) => primer.length + 1 - position).reverse())
      // Do not compare Tm: salt correction uses the selected primer's GC fraction.
    }
  })
})
