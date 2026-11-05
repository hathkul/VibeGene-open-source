import { describe, expect, it } from 'vitest'
import {
  formatStructureDeltaG,
  formatStructureTm,
  predictPrimerPairStructures,
  predictPrimerSecondaryStructures,
  PRIMER_SECONDARY_STRUCTURE_METHOD_SUMMARY,
} from '../src/domain/primerSecondaryStructure'
import { MAX_PRIMER_LENGTH } from '../src/domain/primerLimits'

describe('primer secondary structures', () => {
  it('finds a classic palindromic hairpin with a short loop', () => {
    // Stem GCGC / GCGC with a 4-nt loop AAAA.
    const structures = predictPrimerSecondaryStructures('GCGCAAAAGCGC')
    const hairpins = structures.filter((entry) => entry.kind === 'hairpin')

    expect(hairpins.length).toBeGreaterThan(0)
    const best = hairpins[0]!
    expect(best.stemLength).toBeGreaterThanOrEqual(3)
    expect(best.loopLength).toBeGreaterThanOrEqual(3)
    expect(best.dG37).toBeLessThan(0)
    expect(best.tmC).not.toBeNull()
    expect(best.tmC!).toBeGreaterThan(37)
    expect(best.source).toBe('Primer')
    expect(best.topStem.length).toBe(best.stemLength)
    expect(best.bottomStem.length).toBe(best.stemLength)
  })

  it('includes the loop penalty in hairpin Tm (not stem-only)', () => {
    const structures = predictPrimerSecondaryStructures('GCGCGCGAAAAACGCGCGC')
    const hairpin = structures.find((entry) => entry.kind === 'hairpin' && entry.stemLength === 7)
    expect(hairpin).toBeDefined()
    // Stem-only intramolecular Tm for GCGCGCG is ~99–107 °C; with a 5-nt loop it drops.
    expect(hairpin!.tmC!).toBeLessThan(90)
    expect(hairpin!.tmC!).toBeGreaterThan(50)
    expect(hairpin!.loopLength).toBe(5)
  })

  it('finds a self-dimer only when the stem is stable at oligo concentration', () => {
    // 8 bp GC stem is favorable at 250 nM; short 3–4 bp stems are not.
    const structures = predictPrimerSecondaryStructures('AAAAAAAAAAGCGCGCGC')
    const dimers = structures.filter((entry) => entry.kind === 'self-dimer')

    expect(dimers.length).toBeGreaterThan(0)
    expect(dimers[0]!.stemLength).toBeGreaterThanOrEqual(6)
    expect(dimers[0]!.dG37).toBeLessThan(0)
    expect(dimers[0]!.tmC).toBeGreaterThan(37)
  })

  it('suppresses short self-dimers whose dilute-solution Tm is far below 0 °C', () => {
    // 4 bp GC stem has standard-state ΔG < 0 but intermolecular Tm ≈ −15 °C.
    const structures = predictPrimerSecondaryStructures('AAAAAAAAAAGCGC')
    expect(structures.filter((entry) => entry.kind === 'self-dimer')).toEqual([])
  })

  it('returns no structures for unstructured poly-A', () => {
    expect(predictPrimerSecondaryStructures('AAAAAAAAAAAAAAAAAAAA')).toEqual([])
  })

  it('refuses construct-sized sequences before expensive structure scans', () => {
    const oversized = 'GCGCAAAAGCGC'.repeat(Math.ceil((MAX_PRIMER_LENGTH + 1) / 12))
    expect(predictPrimerSecondaryStructures(oversized)).toEqual([])
    expect(predictPrimerPairStructures('GCGCAAAAGCGC', oversized)).toEqual([])
  })

  it('finds primer-dimers between complementary PCR primers', () => {
    const forward = 'AAAAAAAAAAGCGCGCGC'
    const reverse = 'TTTTTTTTTTGCGCGCGC'
    const structures = predictPrimerPairStructures(forward, reverse, {
      forward: 'Primer 1',
      reverse: 'Primer 2',
    })
    const heterodimers = structures.filter((entry) => entry.kind === 'hetero-dimer')
    expect(heterodimers.length).toBeGreaterThan(0)
    expect(heterodimers[0]!.source).toContain('Primer 1')
    expect(heterodimers[0]!.source).toContain('Primer 2')
    expect(heterodimers[0]!.dG37).toBeLessThan(0)
    expect(heterodimers[0]!.tmC!).toBeGreaterThan(37)
  })

  it('formats Tm and ΔG labels', () => {
    expect(formatStructureTm(42.34)).toBe('42.3 °C')
    expect(formatStructureTm(null)).toBe('—')
    expect(formatStructureDeltaG(-2.156)).toBe('-2.16 kcal/mol')
  })

  it('exports a calculation-method summary for the Structures popup', () => {
    expect(PRIMER_SECONDARY_STRUCTURE_METHOD_SUMMARY).toContain('SantaLucia 1998')
    expect(PRIMER_SECONDARY_STRUCTURE_METHOD_SUMMARY).toContain('Turner 2004')
    expect(PRIMER_SECONDARY_STRUCTURE_METHOD_SUMMARY).toContain('Owczarzy 2008')
    expect(PRIMER_SECONDARY_STRUCTURE_METHOD_SUMMARY).toContain('primer-dimers')
  })

  it('reports ~38 °C for a CTGAAGC stem with a 3-nt loop', () => {
    const structures = predictPrimerSecondaryStructures('CTGAAGCTTTGCTTCAG')
    const hairpin = structures.find(
      (entry) => entry.kind === 'hairpin' && entry.topStem === 'CTGAAGC' && entry.loopLength === 3,
    )
    expect(hairpin).toBeDefined()
    expect(hairpin!.tmC!).toBeCloseTo(38.3, 0)
  })
})
