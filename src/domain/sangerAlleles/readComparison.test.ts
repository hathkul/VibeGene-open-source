import { describe, expect, it } from 'vitest'
import type { AlleleEdit, AlleleFit } from './fit'
import { compareIndependentReads, readComparisonMessage, type IndependentReadFit } from './readComparison'

const reference = 'ACAAAAGT'
const edit = (start: number, end: number, inserted = ''): AlleleEdit => ({ start, end, inserted, label: 'edit' })
const fit = (edits: AlleleEdit[]): AlleleFit => ({ fit: 0.95, positions: 80, perRead: [], warnings: [], alleles: edits.map((item) => ({ edit: item, fraction: 1 / edits.length, ambiguous: false, alternatives: [], alternativesTruncated: false })) })
const reads = (left: AlleleFit, right: AlleleFit): IndependentReadFit[] => [{ name: 'forward', orientation: 'forward', result: left }, { name: 'reverse', orientation: 'reverse', result: right }]

describe('independent Sanger read comparison', () => {
  it('compares actual sequences and accepts equivalent coordinates in repeats', () => {
    expect(compareIndependentReads(reference, reads(fit([edit(2, 3)]), fit([edit(3, 4)])))).toBe('matching')
    expect(compareIndependentReads(reference.toLowerCase(), reads(fit([edit(2, 2, 'A')]), fit([edit(3, 3, 'A')])))).toBe('matching')
  })
  it('warns when candidate sequences or allele sets differ even with strong individual fits', () => {
    const status = compareIndependentReads(reference, reads(fit([edit(2, 3)]), fit([edit(1, 2)])))
    expect(status).toBe('different')
    expect(readComparisonMessage(status)).toMatch(/Warning.*different/)
    expect(compareIndependentReads(reference, reads(fit([edit(2, 3)]), fit([edit(2, 3), edit(1, 2)])))).toBe('different')
  })
  it('does not present matching representatives as conclusive when fit is poor or alternatives exist', () => {
    const low = fit([edit(2, 3)])
    low.fit = 0.5
    expect(compareIndependentReads(reference, reads(low, fit([edit(3, 4)])))).toBe('uncertain')
    const ambiguous = fit([edit(2, 3)])
    ambiguous.alleles[0]!.ambiguous = true
    ambiguous.alleles[0]!.alternatives = [{ edit: edit(1, 2), reason: 'similar-fit' }]
    expect(compareIndependentReads(reference, reads(ambiguous, fit([edit(3, 4)])))).toBe('uncertain')
  })
  it('reports missing and failed independent fits rather than agreement', () => {
    expect(compareIndependentReads(reference, undefined)).toBe('unavailable')
    expect(compareIndependentReads(reference, [{ name: 'a', orientation: 'forward', result: fit([edit(2, 3)]) }, { name: 'b', orientation: 'reverse', error: 'no anchor' }])).toBe('unavailable')
  })
})
