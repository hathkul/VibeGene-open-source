import { describe, expect, it } from 'vitest'
import { calculatePrimerDuplexTm, primerDuplexTmForLayout } from './primerDuplexThermodynamics'
import type { PrimerBindingLayout } from './types'

function fullForwardLayout(template: string, primer: string): PrimerBindingLayout {
  return {
    strand: 'forward', templateStart: 0, templateEnd: template.length,
    components: [{ primerBases: primer, templateStart: 0, templateEnd: template.length }],
  }
}

describe('IUPAC primer duplex layout estimates', () => {
  it('reports an exhaustive range and excludes unsupported concrete variants', () => {
    const template = 'ACGTGCACTGATCGTACGTA'
    const primer = `RM${template.slice(2)}`
    const result = primerDuplexTmForLayout(template, fullForwardLayout(template, primer), primer)
    expect(result).toMatchObject({
      status: 'estimated-range', totalVariantCount: 4, evaluatedVariantCount: 4,
      estimatedVariantCount: 3, unsupportedVariantCount: 1, unexaminedVariantCount: 0,
    })
    if (result.status === 'estimated-range') {
      expect(result.tmCRange.min).toBeLessThanOrEqual(result.tmCRange.max)
      expect(result.assumedEqualVariantAbundance).toBe(true)
      expect(result.oligoConcPerVariant).toBeCloseTo(250e-9 / 4, 15)

      const target = [...template].map((base) => ({ A: 'T', C: 'G', G: 'C', T: 'A' })[base]!).join('')
      const estimates = ['AA', 'AC', 'GA', 'GC']
        .map((prefix) => `${prefix}${template.slice(2)}`)
        .map((variant) => calculatePrimerDuplexTm(variant, target, { oligoConc: 250e-9 / 4 }))
        .filter((variant) => variant.status === 'estimated')
      expect(result.tmCRange.min).toBeCloseTo(Math.min(...estimates.map((variant) => variant.status === 'estimated' ? variant.tmC : Infinity)), 10)
      expect(result.tmCRange.max).toBeCloseTo(Math.max(...estimates.map((variant) => variant.status === 'estimated' ? variant.tmC : -Infinity)), 10)
    }
  })

  it('does not claim a complete variant range when the 5′ tail itself is degenerate', () => {
    const template = 'ACGTGCACTGATCGTACGTA'
    const primer = `R${template}`
    const layout: PrimerBindingLayout = {
      strand: 'forward', templateStart: 0, templateEnd: template.length,
      components: [{ primerBases: 'R' }, { primerBases: template, templateStart: 0, templateEnd: template.length }],
    }
    expect(primerDuplexTmForLayout(template, layout, primer)).toMatchObject({
      status: 'unsupported', reason: 'IUPAC bases in the 5′ tail are not included in duplex variant enumeration',
    })
  })

  it('does not enumerate an ambiguous template as if it were a primer mixture', () => {
    const template = 'ACGTGCACTNATCGTACGTA'
    const primer = `RM${template.slice(2)}`
    expect(primerDuplexTmForLayout(template, fullForwardLayout(template, primer), primer)).toMatchObject({
      status: 'unsupported', reason: 'Ambiguous template bases do not define a single target duplex; primer variants were not evaluated',
    })
  })

  it('reports capped live-layout variants without showing a partial Tm range', () => {
    const template = 'ACGTGCACTGATCGTACGTA'
    const primer = `${'N'.repeat(9)}${template.slice(9)}`
    const result = primerDuplexTmForLayout(template, fullForwardLayout(template, primer), primer)
    expect(result).toMatchObject({
      status: 'unsupported',
      reason: 'Variant count exceeds the exhaustive enumeration limit; no Tm range was computed',
      variantCoverage: {
        totalVariantCount: 262144, evaluatedVariantCount: 0, estimatedVariantCount: 0,
        unsupportedVariantCount: null, unexaminedVariantCount: 262144,
      },
    })
    expect(result.status === 'estimated-range' ? result.tmCRange : undefined).toBeUndefined()
  })
})
