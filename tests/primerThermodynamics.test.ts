import { describe, expect, it } from 'vitest'
import { calculateAnnealTemperature, calculateSl2004MismatchDeltaG37 } from '../src/domain/primerThermodynamics'
import { MAX_PRIMER_LENGTH } from '../src/domain/primerLimits'

describe('primer thermodynamics', () => {
  it('uses primd for canonical ACGT sequences', () => {
    const result = calculateAnnealTemperature('GCTAGTTATTGCTCAGCGG')

    expect(result.method).toBe('primd-santalucia-1998')
    expect(result.variantCount).toBe(1)
    expect(result.tmC).toBeCloseTo(58.8, 1)
    expect(result.tmMinC).toBe(result.tmC)
    expect(result.tmMaxC).toBe(result.tmC)
  })

  it('uses an SL2004 Tm range for IUPAC-degenerate sequences', () => {
    const result = calculateAnnealTemperature('ATGR')

    expect(result.method).toBe('santalucia-hicks-2004-degenerate-range')
    expect(result.variantCount).toBe(2)
    expect(result.gcPercentMin).toBeCloseTo(25)
    expect(result.gcPercentMax).toBeCloseTo(50)
    expect(result.tmMinC).not.toBeNull()
    expect(result.tmMaxC).not.toBeNull()
    expect(result.tmMaxC!).toBeGreaterThan(result.tmMinC!)
  })

  it('reports SL2004 mismatch dG37 without treating it as a Tm', () => {
    const result = calculateSl2004MismatchDeltaG37('GGACTGACG', 'CCTGGCTGC')

    expect(result).toEqual({ dG37: expect.closeTo(-8.32, 2), unsupportedSteps: 0 })
  })

  it('does not run oligo thermodynamics on construct-sized sequences', () => {
    const result = calculateAnnealTemperature('ACGT'.repeat(Math.ceil((MAX_PRIMER_LENGTH + 1) / 4)))

    expect(result.length).toBeGreaterThan(MAX_PRIMER_LENGTH)
    expect(result.method).toBe('unsupported')
    expect(result.tmC).toBeNull()
    expect(result.note).toContain(`longer than ${MAX_PRIMER_LENGTH}`)
  })
})
