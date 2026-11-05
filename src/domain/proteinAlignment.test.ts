import { describe, expect, it } from 'vitest'
import {
  alignDnaToProtein,
  alignProteinToProtein,
  buildProteinComparisonLayout,
  proteinSequenceFromGuidedAlignment,
} from './proteinAlignment'
import type { ProteinComparisonSource } from './proteinAlignmentTypes'

function source(kind: ProteinComparisonSource['kind'], sequence: string): ProteinComparisonSource {
  return { id: 'source', name: 'source', kind, sequence, enabled: true }
}

const testCodons: Record<string, string> = {
  A: 'GCT', C: 'TGT', D: 'GAT', E: 'GAA', F: 'TTT', G: 'GGT', H: 'CAT', I: 'ATT',
  K: 'AAA', L: 'CTG', M: 'ATG', N: 'AAT', P: 'CCT', Q: 'CAA', R: 'CGT', S: 'TCT',
  T: 'ACT', V: 'GTT', W: 'TGG', Y: 'TAT',
}

function codingDnaFor(protein: string) {
  return [...protein].map((residue) => testCodons[residue]).join('')
}

describe('protein comparative alignment', () => {
  it('aligns a homologous protein with a conservative substitution and insertion', () => {
    const result = alignProteinToProtein('MKTLLVGAP', source('protein', 'MKTAAALLVGAP'))
    expect(result).not.toBeNull()
    expect(result!.identityCount).toBeGreaterThanOrEqual(9)
    expect(result!.columns.some((column) => column.event === 'source-insertion')).toBe(true)
  })

  it('selects the correct frame for a clean coding DNA sequence', () => {
    const result = alignDnaToProtein('MADE', source('dna', 'CCCATGGCTGATGAA'))
    expect(result?.orientation).toBe('forward')
    expect(result?.identityCount).toBe(4)
    expect(result?.columns.filter((column) => column.event === 'residue').map((column) => column.frame)).toEqual([1, 1, 1, 1])
  })

  it('continues downstream after a one-base frameshift', () => {
    const result = alignDnaToProtein('MADEFG', source('dna', 'ATGGCTGATAGAATTTGGT'))
    expect(result).not.toBeNull()
    expect(result!.frameShiftCount).toBeGreaterThanOrEqual(1)
    expect(result!.columns.at(-1)?.referenceResidue).toBe('G')
  })

  it('rejects a short compensating shift-out/shift-back excursion', () => {
    const reference = 'MADEFGHIKLMNPQRSTVWYACDEFGHIKL'
    const codingDna = codingDnaFor(reference)
    const compensatingIndels = codingDna.slice(0, 30) + 'A' + codingDna.slice(30, 51) + codingDna.slice(52)
    const result = alignDnaToProtein(reference, source('dna', compensatingIndels))
    expect(result).not.toBeNull()
    expect(result!.frameShiftCount).toBe(0)
    expect(result!.columns.at(-1)?.referenceResidue).toBe('L')
  })

  it('raises frameshift resistance inside a user-marked variable region', () => {
    const reference = 'MADEFGHIKLMNPQRSTVWYACDEFGHIKL'
    const codingDna = codingDnaFor(reference)
    const withInsertion = codingDna.slice(0, 31) + 'A' + codingDna.slice(31)
    const unmarked = alignDnaToProtein(reference, source('dna', withInsertion))
    const marked = alignDnaToProtein(reference, source('dna', withInsertion), 'Standard', [{ id: 'cdr', start: 9, end: 18 }])
    expect(unmarked).not.toBeNull()
    expect(marked).not.toBeNull()
    expect(unmarked!.frameShiftCount).toBeGreaterThan(0)
    expect(marked!.columns.filter((column) => column.event === 'frameshift' && column.referenceIndex !== null
      && column.referenceIndex >= 9 && column.referenceIndex < 18)).toHaveLength(0)
    expect(marked!.frameShiftCount).toBeLessThanOrEqual(unmarked!.frameShiftCount)
  })

  it.each([
    ['two-base insertion', 2, (dna: string) => dna.slice(0, 18) + 'AA' + dna.slice(18)],
    ['two-base deletion', -2, (dna: string) => dna.slice(0, 18) + dna.slice(20)],
  ] as const)('models a %s as one explicit frameshift', (_label, expectedShift, mutate) => {
    const reference = 'MADEFGHIKLMNPQRSTVWY'
    const codingDna = 'ATGGCTGATGAATTTGGTCATATTAAACTGATGAATCCTCAACGTTCTACTGTTTGGTAT'
    const result = alignDnaToProtein(reference, source('dna', mutate(codingDna)))
    expect(result).not.toBeNull()
    expect(result!.columns.some((column) => column.frameShift === expectedShift)).toBe(true)
    expect(result!.columns.at(-1)?.referenceResidue).toBe('Y')
  })

  it('selects the reverse strand when it is the protein-coding orientation', () => {
    const result = alignDnaToProtein('MADE', source('dna', 'TTCATCAGCCAT'))
    expect(result?.orientation).toBe('reverse')
    expect(result?.identityCount).toBe(4)
  })

  it('allocates shared insertion slots for stacked anchor alignments', () => {
    const alignment = alignProteinToProtein('MKTLLVGAP', source('protein', 'MKTAAALLVGAP'))!
    const layout = buildProteinComparisonLayout(9, [alignment])
    expect(layout.filter((slot) => slot.kind === 'reference')).toHaveLength(9)
    expect(layout.some((slot) => slot.kind === 'insertion')).toBe(true)
  })

  it('uses seeded banded alignment above the full-matrix safety limit', () => {
    let state = 0x12345678
    const alphabet = 'ARNDCQEGHILKMFPSTWYV'
    const reference = Array.from({ length: 3_500 }, () => {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0
      return alphabet[state % alphabet.length]
    }).join('')
    const result = alignProteinToProtein(reference, source('protein', reference))
    expect(result?.identityCount).toBe(reference.length)
    expect(result?.score).toBeGreaterThan(0)
  })

  it('reconstructs the aligned protein sequence from DNA columns', () => {
    const result = alignDnaToProtein('MADE', source('dna', 'CCCATGGCTGATGAA'))
    expect(result).not.toBeNull()
    expect(proteinSequenceFromGuidedAlignment(result!)).toBe('MADE')
  })

  it('uses translated seeds for a large DNA comparison', () => {
    const aminoAcids = 'ARNDCQEGHILKMFPSTWYV'
    const codons: Record<string, string> = {
      A: 'GCT', R: 'CGT', N: 'AAT', D: 'GAT', C: 'TGT', Q: 'CAA', E: 'GAA', G: 'GGT', H: 'CAT',
      I: 'ATT', L: 'CTG', K: 'AAA', M: 'ATG', F: 'TTT', P: 'CCT', S: 'TCT', T: 'ACT', W: 'TGG',
      Y: 'TAT', V: 'GTT',
    }
    let state = 0x9e3779b9
    const reference = Array.from({ length: 100 }, () => {
      state = (state * 1_103_515_245 + 12_345) >>> 0
      return aminoAcids[state % aminoAcids.length]
    }).join('')
    const codingDna = [...reference].map((residue) => codons[residue]).join('')
    const result = alignDnaToProtein(reference, source('dna', 'N'.repeat(120_000) + codingDna))
    expect(result?.orientation).toBe('forward')
    expect(result!.identityCount).toBe(reference.length)
  })
})
