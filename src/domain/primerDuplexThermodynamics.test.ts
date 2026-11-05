import { describe, expect, it } from 'vitest'
import { calculatePrimerDuplexTm, primerDuplexTmForLayout } from './primerDuplexThermodynamics'
import { buildPrimerTabRow } from './primerExport'
import { defaultPrimerHybridizationParams } from './primerHybridization'
import { reverseComplement } from './sequence'
import { resolveDisplayableLayoutsForPrimer } from './primerBindingPolicy'
import type { PrimerBindingLayout } from './types'

describe('primer duplex thermodynamics', () => {
  it('matches independent nearest-neighbor enthalpy and entropy for the Biopython single-mismatch example', () => {
    // Biopython's documented example gives 55.39 °C with NN3 / entropy salt
    // correction. Independently summing its steps with NN4 gives these ΔH/ΔS;
    // VibeGene applies its own Owczarzy salt correction and 250 nM convention.
    const result = calculatePrimerDuplexTm('CGTTCCAAAGATGTGGGCATGAGCTTAC', 'GCAAGGCTTCTACACCCGTACTCGAATG')
    expect(result.status).toBe('estimated')
    if (result.status !== 'estimated') return
    expect(result.mismatchPositions).toEqual([7])
    expect(result.deltaH).toBeCloseTo(-196.1, 5)
    expect(result.deltaS).toBeCloseTo(-531.1, 5)
    // Independently evaluated Owczarzy 2008 with primd's Mg–dNTP Kd
    // (0.57 mM), Na=50 mM and effective strand concentration 62.5 nM.
    // Biopython uses a different Mg–dNTP constant and gives ~65.11 °C.
    expect(result.tmC).toBeCloseTo(65.35463, 4)
  })

  it('keeps the existing reaction defaults and applies explicit SnapGene-style salt conditions', () => {
    const primer = 'CGTTCCAAAGATGTGGGCATGAGCTTAC'
    const target = 'GCAAGGCTTCTACACCCGTACTCGAATG'
    const defaultResult = calculatePrimerDuplexTm(primer, target)
    const explicitDefault = calculatePrimerDuplexTm(primer, target, {
      monoConc: 0.05, mgConc: 0.002, dntpConc: 0.0008, oligoConc: 250e-9,
    })
    const snapGene = calculatePrimerDuplexTm(primer, target, {
      monoConc: 0.05, mgConc: 0, dntpConc: 0, oligoConc: 250e-9,
    })
    expect(explicitDefault).toEqual(defaultResult)
    expect(snapGene.status).toBe('estimated')
    if (snapGene.status === 'estimated' && defaultResult.status === 'estimated') {
      expect(snapGene.tmC).not.toBeCloseTo(defaultResult.tmC, 3)
    }
  })

  it('supports isolated terminal mismatches, tandem mismatches, and ambiguous-base rejection', () => {
    expect(calculatePrimerDuplexTm('ACGTACGA', 'TGCATGCT')).toMatchObject({ status: 'estimated', mismatchCount: 0 })
    expect(calculatePrimerDuplexTm('ACGTACGT', 'TGCCGGCA')).toMatchObject({ status: 'estimated', approximateTandemMismatch: true })
    expect(calculatePrimerDuplexTm('ACGTACGT', 'TGCCGTCA')).toMatchObject({ status: 'estimated', mismatchPositions: [4, 5, 6], approximateTandemMismatch: true })
    expect(calculatePrimerDuplexTm('AC', 'AG')).toMatchObject({ status: 'estimated', mismatchPositions: [1], terminalMismatchPositions: [1], deltaH: -7.8, deltaS: -28.2 })
    const rightTerminalMismatch = calculatePrimerDuplexTm('AC', 'TT')
    expect(rightTerminalMismatch).toMatchObject({ status: 'estimated', mismatchPositions: [2], terminalMismatchPositions: [2] })
    if (rightTerminalMismatch.status === 'estimated') {
      // The sole matched A/T pair forms both duplex ends after trimming the mismatch.
      expect(rightTerminalMismatch.deltaH).toBeCloseTo(3.7, 8)
      expect(rightTerminalMismatch.deltaS).toBeCloseTo(6.4, 8)
    }
    expect(calculatePrimerDuplexTm('ACGTACGT', 'AGCATGCA')).toMatchObject({ status: 'estimated', mismatchPositions: [1], terminalMismatchPositions: [1] })
    expect(calculatePrimerDuplexTm('ACGTACGT', 'AACATGCA')).toMatchObject({ status: 'unsupported', reason: 'Adjacent terminal mismatches are unsupported' })
    expect(calculatePrimerDuplexTm('ACGTNCGT', 'TGCATGCA')).toMatchObject({ status: 'unsupported', reason: 'Ambiguous bases or an incomplete duplex' })
  })

  it('adds validated 5′ dangling-end contributions in oligo orientation and rejects combined end effects', () => {
    // Bommarito et al. Table 1: AC/.G contributes ΔH −6.3 kcal/mol, ΔS −17.1 cal/mol/K.
    const referenceDangle = calculatePrimerDuplexTm('CA', 'GT', { fivePrimeDangling: 'A' })
    expect(referenceDangle).toMatchObject({ status: 'estimated', modeledFivePrimeDanglingBases: 1 })
    if (referenceDangle.status === 'estimated') {
      expect(referenceDangle.deltaH).toBeCloseTo(-12.4, 8)
      expect(referenceDangle.deltaS).toBeCloseTo(-38.6, 8)
    }

    const template = 'ACGTACGA'
    const primer = `G${template}`
    const forward: PrimerBindingLayout = { strand: 'forward', templateStart: 0, templateEnd: template.length, components: [{ primerBases: 'G' }, { primerBases: template, templateStart: 0, templateEnd: template.length }] }
    const forwardResult = primerDuplexTmForLayout(template, forward, primer)
    const direct = calculatePrimerDuplexTm(template, 'TGCATGCT', { fivePrimeDangling: 'G' })
    expect(forwardResult).toMatchObject({ status: 'estimated', excludedFivePrimeBases: 1, modeledFivePrimeDanglingBases: 1 })
    expect(forwardResult).toEqual({ ...direct, excludedFivePrimeBases: 1 })

    const reversePaired = reverseComplement(template)
    const reverse: PrimerBindingLayout = { strand: 'reverse', templateStart: 0, templateEnd: template.length, components: [{ primerBases: 'G' }, { primerBases: reversePaired, templateStart: 0, templateEnd: template.length }] }
    const reverseResult = primerDuplexTmForLayout(template, reverse, `G${reversePaired}`)
    expect(reverseResult).toMatchObject({ status: 'estimated', excludedFivePrimeBases: 1, modeledFivePrimeDanglingBases: 1 })
    expect(reverseResult).toEqual({
      ...calculatePrimerDuplexTm(reversePaired, [...template].reverse().join(''), { fivePrimeDangling: 'G' }),
      excludedFivePrimeBases: 1,
    })

    expect(calculatePrimerDuplexTm('AC', 'AG', { fivePrimeDangling: 'G' })).toMatchObject({
      status: 'unsupported', reason: 'Combined terminal mismatch and dangling end is unsupported',
    })
  })

  it('uses terminal mismatch stacks and loop initiation for tandem mismatches', () => {
    const result = calculatePrimerDuplexTm('ACGTACGT', 'TGCCGGCA')
    expect(result).toMatchObject({ status: 'estimated', mismatchPositions: [4, 5], approximateTandemMismatch: true })
    if (result.status !== 'estimated') return
    // Four matched stacks, GT/CC and GG/CA terminal stacks, duplex initiation,
    // terminal AT penalties, and a size-four loop penalty of 3.6 kcal/mol at 37 °C.
    expect(result.deltaH).toBeCloseTo(-41, 5)
    expect(result.deltaS).toBeCloseTo(-110.3 - 3600 / 310.15, 5)
  })

  it('agrees with Primer3 ntthal for a four-mismatch internal loop at 1 M Na', () => {
    // Manually summed SantaLucia/Hicks matched stacks, TT/AC and TA/AC terminal
    // mismatch stacks, duplex initiation and the size-eight loop entropy.
    const result = calculatePrimerDuplexTm('GCGATTGGCACTTTGGTGAAC', 'CGCTACATATGAAACCACTTG')
    expect(result).toMatchObject({ status: 'estimated', mismatchPositions: [6, 7, 8, 9], approximateTandemMismatch: true })
    if (result.status !== 'estimated') return
    expect(result.deltaH).toBeCloseTo(-127.6, 5)
    expect(result.deltaS).toBeCloseTo(-346.6 - 4800 / 310.15, 5)
    // Primer3 2.6.1 ntthal, ANY, 1 M Na, 100 µM oligo, independently
    // selects this same alignment and reports 59.9003 °C.
    const tmAtReferenceConditions = result.deltaH * 1000 / (result.deltaS + 1.987 * Math.log(0.0001 / 4)) - 273.15
    expect(tmAtReferenceConditions).toBeCloseTo(59.9003, 1)
  })

  it('covers all canonical isolated internal mismatch contexts', () => {
    const bases = 'ACGT'
    const complement: Record<string, string> = { A: 'T', C: 'G', G: 'C', T: 'A' }
    for (const left of bases) for (const center of bases) for (const right of bases) for (const opposite of bases) {
      if (opposite === complement[center]) continue
      const primer = `AG${left}${center}${right}CA`
      const target = [...primer].map((base) => complement[base]).join('')
      const result = calculatePrimerDuplexTm(primer, `${target.slice(0, 3)}${opposite}${target.slice(4)}`)
      expect(result.status, `${primer} / ${target} with ${opposite}`).toBe('estimated')
    }
  })

  it('extracts the correct duplex on forward and reverse strands', () => {
    const template = 'CGTTCCAAAGATGTGGGCATGAGCTTAC'
    const mutant = 'CGTTCCGAAGATGTGGGCATGAGCTTAC'
    const forward: PrimerBindingLayout = { strand: 'forward', templateStart: 0, templateEnd: template.length, components: [{ primerBases: mutant, templateStart: 0, templateEnd: template.length }] }
    const reverse: PrimerBindingLayout = { strand: 'reverse', templateStart: 0, templateEnd: template.length, components: [{ primerBases: reverseComplement(mutant), templateStart: 0, templateEnd: template.length }] }
    const f = primerDuplexTmForLayout(template, forward)
    const r = primerDuplexTmForLayout(template, reverse)
    expect(f.status).toBe('estimated')
    expect(r.status).toBe('estimated')
    if (f.status === 'estimated' && r.status === 'estimated') {
      expect(f.mismatchPositions).toEqual([7])
      expect(r.mismatchPositions).toEqual([22])
    }
    const expected = calculatePrimerDuplexTm(reverseComplement(mutant), [...template].reverse().join(''))
    expect(r).toEqual(expected)
  })

  it('excludes a 5′ tail and reports mismatch positions in the whole primer on either strand', () => {
    const template = 'CGTTCCAAAGATGTGGGCATGAGCTTAC'
    const mutant = 'CGTTCCGAAGATGTGGGCATGAGCTTAC'
    const forward: PrimerBindingLayout = { strand: 'forward', templateStart: 0, templateEnd: template.length, components: [{ primerBases: 'AAAA' }, { primerBases: mutant, templateStart: 0, templateEnd: template.length }] }
    const reverse: PrimerBindingLayout = { strand: 'reverse', templateStart: 0, templateEnd: template.length, components: [{ primerBases: mutant, templateStart: 0, templateEnd: template.length }, { primerBases: 'TTTT' }] }
    const f = primerDuplexTmForLayout(template, forward, `AAAA${mutant}`)
    const r = primerDuplexTmForLayout(template, reverse, `AAAA${reverseComplement(mutant)}`)
    const reverseOligoOrder: PrimerBindingLayout = { ...reverse, components: [{ primerBases: 'AAAA' }, { primerBases: reverseComplement(mutant), templateStart: 0, templateEnd: template.length }] }
    expect(f).toMatchObject({ status: 'estimated', excludedFivePrimeBases: 4, modeledFivePrimeDanglingBases: 1, mismatchPositions: [11] })
    expect(r).toMatchObject({ status: 'estimated', excludedFivePrimeBases: 4, modeledFivePrimeDanglingBases: 1, mismatchPositions: [26] })
    expect(primerDuplexTmForLayout(template, reverseOligoOrder, `AAAA${reverseComplement(mutant)}`)).toEqual(r)
    const forwardUntailed = calculatePrimerDuplexTm(mutant, [...reverseComplement(template)].reverse().join(''))
    expect(f.status).toBe('estimated')
    expect(forwardUntailed.status).toBe('estimated')
    if (f.status === 'estimated' && forwardUntailed.status === 'estimated') {
      expect(f.tmC).not.toBeCloseTo(forwardUntailed.tmC, 3)
    }
  })

  it('does not exclude a 3′ overhang or guess the orientation without the primer sequence', () => {
    const layout: PrimerBindingLayout = { strand: 'forward', templateStart: 0, templateEnd: 8, components: [{ primerBases: 'ACGTACGA', templateStart: 0, templateEnd: 8 }, { primerBases: 'AA' }] }
    expect(primerDuplexTmForLayout('ACGTACGA', layout, 'ACGTACGAAA')).toMatchObject({ status: 'unsupported' })
    expect(primerDuplexTmForLayout('ACGTACGA', layout)).toMatchObject({ status: 'unsupported' })
  })

  it('shows a below-threshold site as a candidate without changing binding rules', () => {
    const template = 'GGCTACGTTAGCTAGACCTGATCGTACGTA'
    const primer = { id: 'candidate', name: 'candidate', sequence: template, color: '' }
    const row = buildPrimerTabRow(template, primer, { ...defaultPrimerHybridizationParams, minMeltingTemperature: 100 }, '')
    expect(row.bindingIsCandidate).toBe(true)
    expect(row.bindingLabel).toContain('Candidate:')
    expect(row.warnings).toContain('below display Tm threshold')
    expect(row.duplexTm?.status).toBe('estimated')
    expect(resolveDisplayableLayoutsForPrimer(template, primer, { ...defaultPrimerHybridizationParams, minMeltingTemperature: 100 })).toEqual([])
  })

  it('uses the caller threshold when resolving low-Tm popup primer selections', () => {
    const template = 'ACGTACGA'
    const primer = { id: 'low-tm', name: 'Low Tm', sequence: template, color: '' }
    const selectionSettings = { ...defaultPrimerHybridizationParams, minContinuousMatchLen: 4, minMeltingTemperature: 0 }

    expect(resolveDisplayableLayoutsForPrimer(template, primer, selectionSettings)).toHaveLength(1)
    expect(resolveDisplayableLayoutsForPrimer(template, primer, {
      ...selectionSettings,
      minMeltingTemperature: 40,
    })).toEqual([])
  })

  it('does not infer a duplex across an unpaired internal segment', () => {
    const layout: PrimerBindingLayout = {
      strand: 'forward', templateStart: 0, templateEnd: 8,
      components: [{ primerBases: 'ACGT', templateStart: 0, templateEnd: 4 }, { primerBases: 'AA' }, { primerBases: 'ACGA', templateStart: 4, templateEnd: 8 }],
    }
    expect(primerDuplexTmForLayout('ACGTACGA', layout, 'ACGTAAACGA')).toMatchObject({ status: 'unsupported', reason: 'Unpaired bases or alignment gaps' })
    const gap: PrimerBindingLayout = { strand: 'forward', templateStart: 0, templateEnd: 9, components: [{ primerBases: 'ACGT', templateStart: 0, templateEnd: 4 }, { primerBases: 'ACGA', templateStart: 5, templateEnd: 9 }] }
    expect(primerDuplexTmForLayout('ACGTGACGA', gap, 'ACGTACGA')).toMatchObject({ status: 'unsupported', reason: 'Unpaired bases or alignment gaps' })
  })

  it('estimates an equal-length two-base substitution block with a separate isolated mismatch', () => {
    const template = 'ACGTACGTTGCAACGTACGTACGTTGCA'
    const layout: PrimerBindingLayout = { strand: 'forward', templateStart: 0, templateEnd: 28, components: [
      { primerBases: template.slice(0, 7), templateStart: 0, templateEnd: 7 },
      { primerBases: 'AA' },
      { primerBases: template.slice(9, 18), templateStart: 9, templateEnd: 18 },
      { primerBases: 'A' },
      { primerBases: template.slice(19), templateStart: 19, templateEnd: 28 },
    ] }
    const primer = layout.components.map((component) => component.primerBases).join('')
    expect(primerDuplexTmForLayout(template, layout, primer)).toMatchObject({ status: 'estimated', mismatchPositions: [8, 9, 19], assumedSubstitutions: true, approximateTandemMismatch: true })
    const reverse = { ...layout, strand: 'reverse' as const }
    expect(primerDuplexTmForLayout(template, reverse, reverseComplement(primer))).toMatchObject({ status: 'estimated', mismatchPositions: [10, 20, 21], assumedSubstitutions: true, approximateTandemMismatch: true })
    const tailed = { ...layout, components: [{ primerBases: 'GGG' }, ...layout.components] }
    expect(primerDuplexTmForLayout(template, tailed, `GGG${primer}`)).toMatchObject({ status: 'estimated', mismatchPositions: [11, 12, 22], excludedFivePrimeBases: 3, assumedSubstitutions: true, approximateTandemMismatch: true })
  })

  it('estimates a three-base substitution block on either strand', () => {
    const template = 'ACGTACGTTGCAACGTACGTACGTTGCA'
    const layout: PrimerBindingLayout = { strand: 'forward', templateStart: 0, templateEnd: template.length, components: [
      { primerBases: template.slice(0, 7), templateStart: 0, templateEnd: 7 },
      { primerBases: 'AAC' },
      { primerBases: template.slice(10), templateStart: 10, templateEnd: template.length },
    ] }
    const primer = layout.components.map((component) => component.primerBases).join('')
    expect(primerDuplexTmForLayout(template, layout, primer)).toMatchObject({ status: 'estimated', mismatchPositions: [8, 9, 10], assumedSubstitutions: true, approximateTandemMismatch: true })
    expect(primerDuplexTmForLayout(template, { ...layout, strand: 'reverse' }, reverseComplement(primer))).toMatchObject({ status: 'estimated', mismatchPositions: [19, 20, 21], assumedSubstitutions: true, approximateTandemMismatch: true })
  })
})
