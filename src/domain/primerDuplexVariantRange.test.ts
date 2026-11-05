import { describe, expect, it } from 'vitest'
import { calculatePrimerDuplexVariantRange } from './primerDuplexVariantRange'
import type { PrimerDuplexTmResult } from './primerDuplexThermodynamics'

const estimate = (tmC: number, deltaH = -10, deltaS = -30): PrimerDuplexTmResult => ({
  status: 'estimated', tmC, deltaH, deltaS, mismatchCount: 0, mismatchPositions: [], method: 'test fixture',
})

describe('IUPAC primer duplex variant ranges', () => {
  it('exhaustively reports ranges and supported/unsupported counts', () => {
    const seen: string[] = []
    const result = calculatePrimerDuplexVariantRange('AR', 'TY', {
      calculate: (primer, target) => {
        seen.push(`${primer}/${target}`)
        if (primer === 'AA') return { status: 'unsupported', reason: 'fixture rejection' }
        return estimate(primer.charCodeAt(1), -primer.charCodeAt(1), target.charCodeAt(1))
      },
    })

    expect(seen).toHaveLength(4)
    expect(result).toMatchObject({
      status: 'estimated', totalVariantCount: 4, evaluatedVariantCount: 4,
      estimatedVariantCount: 2, unsupportedVariantCount: 2, unexaminedVariantCount: 0,
      tmCRange: { min: 71, max: 71 },
      deltaHRange: { min: -71, max: -71 },
      deltaSRange: { min: 67, max: 84 },
    })
  })

  it('does not sample when the exhaustive variant count exceeds its limit', () => {
    let calls = 0
    const result = calculatePrimerDuplexVariantRange('ANNN', 'TTTT', {
      maxVariants: 10,
      calculate: () => { calls += 1; return estimate(20) },
    })
    expect(calls).toBe(0)
    expect(result).toMatchObject({
      status: 'unsupported', reason: 'Variant count exceeds the exhaustive enumeration limit',
      totalVariantCount: 64, evaluatedVariantCount: 0, estimatedVariantCount: 0,
      unsupportedVariantCount: null, unexaminedVariantCount: 64,
    })
    expect(result.tmCRange).toBeUndefined()
  })

  it('reports unsupported counts when every concrete duplex is unsupported', () => {
    const result = calculatePrimerDuplexVariantRange('AR', 'TY', {
      calculate: () => ({ status: 'unsupported', reason: 'fixture rejection' }),
    })
    expect(result).toMatchObject({
      status: 'unsupported', totalVariantCount: 4, evaluatedVariantCount: 4,
      estimatedVariantCount: 0, unsupportedVariantCount: 4, unexaminedVariantCount: 0,
    })
    expect(result.tmCRange).toBeUndefined()
  })

  it('rejects invalid symbols and invalid limits without evaluating variants', () => {
    const calculate = () => estimate(20)
    expect(calculatePrimerDuplexVariantRange('AX', 'TT', { calculate })).toMatchObject({ status: 'unsupported', totalVariantCount: 0 })
    expect(calculatePrimerDuplexVariantRange('AN', 'TT', { maxVariants: 0, calculate })).toMatchObject({
      status: 'unsupported', reason: 'maxVariants must be a positive safe integer',
      totalVariantCount: 4, evaluatedVariantCount: 0, unsupportedVariantCount: null,
    })
  })
})
