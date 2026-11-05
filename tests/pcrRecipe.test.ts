import { describe, expect, it } from 'vitest'
import { reverseComplement } from '../src/domain/sequence'
import {
  extensionTimeSeconds,
  historyNodeHasPcrRecipe,
  mixVolumeForReactions,
  pcrEnzymeFamily,
  pcrMixComponents,
  pcrRecipeContextFromHistory,
  primerVolumeUl,
} from '../src/domain/pcrRecipe'
import { calculateAnnealTemperature } from '../src/domain/primerThermodynamics'
import type { HistoryNode } from '../src/domain/types'

function node(partial: Partial<HistoryNode> & Pick<HistoryNode, 'id' | 'name' | 'seqLen' | 'operation'>): HistoryNode {
  return {
    circular: false,
    resurrectable: false,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    children: [],
    ...partial,
  }
}

const annealFwd = 'AAACCCGGGTTTAAACCCGGGTTT'
const annealRev = 'ATGATGATGATGATGATGATGA'
const overhang = 'GGATCC'

function pcrHistory(overrides: Partial<HistoryNode> = {}): HistoryNode {
  const templateSeq = `${annealFwd}${'A'.repeat(200)}${reverseComplement(annealRev)}`
  return node({
    id: 'pcr',
    name: 'Amplicon.dna',
    seqLen: overhang.length + annealFwd.length + 200 + annealRev.length,
    operation: 'amplifyFragment',
    polymerase: 'Creates blunt ends',
    oligos: [
      { name: 'Fwd', sequence: overhang + annealFwd },
      { name: 'Rev', sequence: annealRev },
    ],
    inputSummaries: [{ manipulation: 'amplify', name1: 'Fwd', name2: 'Rev', val1: '1', val2: String(templateSeq.length) }],
    sequence: `${overhang}${annealFwd}${'A'.repeat(200)}${annealRev}`,
    children: [
      node({
        id: 'template',
        name: 'Template.dna',
        seqLen: templateSeq.length,
        operation: 'invalid',
        sequence: templateSeq,
      }),
    ],
    ...overrides,
  })
}

describe('PCR recipe math', () => {
  it('maps A-overhang polymerase history to Taq and blunt ends to high-fidelity', () => {
    expect(pcrEnzymeFamily("Creates 3' A overhangs")).toBe('taq')
    expect(pcrEnzymeFamily('Creates blunt ends')).toBe('high-fidelity')
    expect(pcrEnzymeFamily("Creates 3' G overhangs")).toBe('high-fidelity')
    expect(extensionTimeSeconds(500, 'high-fidelity')).toBe(15)
    expect(extensionTimeSeconds(1000, 'high-fidelity')).toBe(20)
    expect(extensionTimeSeconds(2500, 'high-fidelity')).toBe(50)
    expect(extensionTimeSeconds(800, 'taq')).toBe(60)
    expect(extensionTimeSeconds(1200, 'taq')).toBe(120)
  })

  it('computes primer microliters from reaction volume, stock, and final concentration', () => {
    expect(primerVolumeUl(20, 10, 0.5)).toBeCloseTo(1, 6)
    expect(primerVolumeUl(20, 10, 0.2)).toBeCloseTo(0.4, 6)
    expect(primerVolumeUl(50, 10, 0.5)).toBeCloseTo(2.5, 6)
    expect(mixVolumeForReactions(1, 3)).toBe(3)
    expect(primerVolumeUl(20, 0, 0.5)).toBeNull()
  })

  it('scales a 20 µl mix with 10× buffer, 10 mM dNTPs, 0.5 µl polymerase, and 1 µl template', () => {
    const rows = pcrMixComponents({
      volumeUl: 20,
      enzymeFamily: 'high-fidelity',
      primerNames: ['Fwd', 'Rev'],
      primerStockuM: 10,
      primerFinaluM: 0.5,
      bufferFold: 10,
      dntpStockmM: 10,
      dntpFinalmM: 0.2,
      polymeraseUl: 0.5,
      templateUl: 1,
    })
    expect(rows.find((row) => row.id === 'buffer')?.ulPerReaction).toBe(2)
    expect(rows.find((row) => row.id === 'buffer')?.stock).toBe('10×')
    expect(rows.find((row) => row.id === 'dntp')?.ulPerReaction).toBe(0.4)
    expect(rows.find((row) => row.id === 'primer:0')?.ulPerReaction).toBe(1)
    expect(rows.find((row) => row.id === 'template')?.ulPerReaction).toBe(1)
    expect(rows.find((row) => row.id === 'pol')?.ulPerReaction).toBe(0.5)
    const total = rows.reduce((sum, row) => sum + (row.ulPerReaction ?? 0), 0)
    expect(total).toBeCloseTo(20, 3)
  })

  it('recomputes buffer, dNTP, polymerase, and template from the entered stocks', () => {
    const rows = pcrMixComponents({
      volumeUl: 20,
      enzymeFamily: 'taq',
      primerNames: ['Fwd', 'Rev'],
      primerStockuM: 10,
      primerFinaluM: 0.2,
      bufferFold: 5,
      dntpStockmM: 25,
      dntpFinalmM: 0.2,
      polymeraseUl: 0.5,
      templateUl: 2,
    })
    expect(rows.find((row) => row.id === 'buffer')?.ulPerReaction).toBe(4)
    expect(rows.find((row) => row.id === 'dntp')?.ulPerReaction).toBeCloseTo(0.16, 5)
    expect(rows.find((row) => row.id === 'pol')?.ulPerReaction).toBe(0.5)
    expect(rows.find((row) => row.id === 'template')?.ulPerReaction).toBe(2)
  })

  it('uses gene-specific Tm and a high-fidelity program for blunt PCR history', () => {
    const recipe = pcrRecipeContextFromHistory(pcrHistory())
    expect(recipe).not.toBeNull()
    const fwdTm = calculateAnnealTemperature(annealFwd).tmC
    expect(recipe!.primers[0]!.annealLength).toBe(annealFwd.length)
    expect(recipe!.primers[0]!.tmC).toBeCloseTo(fwdTm!, 1)
    expect(recipe!.enzymeFamily).toBe('high-fidelity')
    expect(recipe!.primerFinaluM).toBe(0.5)
    expect(recipe!.twoStep).toBe(false)
    expect(recipe!.annealingC).toBe(Math.round(Math.min(recipe!.primers[0]!.tmC!, recipe!.primers[1]!.tmC!)))
    expect(recipe!.program.some((step) => step.label === 'Annealing')).toBe(true)
  })

  it('uses Ta = min Tm − 5 °C and 1 min/kb for Taq (A-overhang) PCR', () => {
    const recipe = pcrRecipeContextFromHistory(
      pcrHistory({ polymerase: "Creates 3' A overhangs" }),
    )
    expect(recipe!.enzymeFamily).toBe('taq')
    expect(recipe!.primerFinaluM).toBe(0.2)
    const minTm = Math.min(recipe!.primers[0]!.tmC!, recipe!.primers[1]!.tmC!)
    expect(recipe!.annealingC).toBe(Math.round(minTm - 5))
    expect(recipe!.extensionSeconds).toBe(60)
  })

  it('suggests two-step PCR when primer Tm is high enough', () => {
    const hot = 'GCGCGCGCGCGCGCGCGCGCGC'
    const recipe = pcrRecipeContextFromHistory(
      node({
        id: 'hot',
        name: 'Hot.dna',
        seqLen: 400,
        operation: 'amplifyFragment',
        polymerase: 'Creates blunt ends',
        oligos: [
          { name: 'GC-F', sequence: hot },
          { name: 'GC-R', sequence: hot },
        ],
      }),
    )
    expect(recipe!.twoStep).toBe(true)
    expect(recipe!.program.some((step) => step.label === 'Anneal / extend')).toBe(true)
    expect(recipe!.notes.some((note) => note.text.includes('two-step'))).toBe(true)
  })

  it('warns about stable primer hairpins', () => {
    const hairpin = 'ATGCGCGCGAAAAACGCGCGCATG'
    const partner = 'ATGATGATGATGATGATGATGA'
    const recipe = pcrRecipeContextFromHistory(
      node({
        id: 'hair',
        name: 'Hairpin.dna',
        seqLen: 300,
        operation: 'amplifyFragment',
        oligos: [
          { name: 'Hp', sequence: hairpin },
          { name: 'Ok', sequence: partner },
        ],
      }),
    )
    expect(recipe!.notes.some((note) => /hairpin/i.test(note.text))).toBe(true)
  })

  it('does not attach a PCR recipe to restriction-cloning history', () => {
    const cloning = node({
      id: 'cloned',
      name: 'Cloned.dna',
      seqLen: 4000,
      operation: 'insertFragment',
    })
    expect(historyNodeHasPcrRecipe(cloning)).toBe(false)
    expect(pcrRecipeContextFromHistory(cloning)).toBeNull()
    expect(historyNodeHasPcrRecipe(pcrHistory())).toBe(true)
  })
})
