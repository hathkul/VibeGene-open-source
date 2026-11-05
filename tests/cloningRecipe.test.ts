import { describe, expect, it } from 'vitest'
import {
  cloningRecipePartsFromHistory,
  defaultLigationMultiplicity,
  formatMolarRatio,
  formatRecipeQuantity,
  historyJunctionsAreBlunt,
  ligationInsertAmountNg,
  ligationVolumeUl,
  parseRecipeNumber,
} from '../src/domain/cloningRecipe'
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

function cloningProduct(overrides: Partial<HistoryNode> = {}): HistoryNode {
  return node({
    id: 'product',
    name: 'Cloned.dna',
    seqLen: 4200,
    circular: true,
    operation: 'insertFragment',
    inputSummaries: [
      { manipulation: 'replace', name1: 'BamHI', val1: '1001', name2: 'EcoRI', val2: '101' },
      { manipulation: 'insert', name1: 'EcoRI', val1: '1', name2: 'BamHI', val2: '801' },
    ],
    children: [
      node({ id: 'vector', name: 'pUC.dna', seqLen: 4300, circular: true, operation: 'invalid' }),
      node({ id: 'insert', name: 'GFP.dna', seqLen: 1200, operation: 'invalid' }),
    ],
    ...overrides,
  })
}

describe('cloning recipe math', () => {
  it('computes insert mass from vector mass, fragment lengths, and multiplicity', () => {
    expect(
      ligationInsertAmountNg({
        vectorAmountNg: 20,
        vectorLengthBp: 3400,
        insertLengthBp: 800,
        multiplicity: 3,
      }),
    ).toBeCloseTo(14.117647, 5)
  })

  it('converts mass and concentration into microliters', () => {
    expect(ligationVolumeUl(20, 50)).toBeCloseTo(0.4, 6)
    expect(ligationVolumeUl(14.117647, 10)).toBeCloseTo(1.4117647, 5)
    expect(ligationVolumeUl(20, 0)).toBeNull()
  })

  it('raises default multiplicity for shorter inserts, up to 10:1 for oligos', () => {
    expect(defaultLigationMultiplicity({ insertLengthBp: 800, junctionsBlunt: false })).toBe(3)
    expect(defaultLigationMultiplicity({ insertLengthBp: 800, junctionsBlunt: true })).toBe(5)
    expect(defaultLigationMultiplicity({ insertLengthBp: 200, junctionsBlunt: false })).toBe(5)
    expect(defaultLigationMultiplicity({ insertLengthBp: 200, junctionsBlunt: true })).toBe(7)
    expect(defaultLigationMultiplicity({ insertLengthBp: 100, junctionsBlunt: false })).toBe(7)
    expect(defaultLigationMultiplicity({ insertLengthBp: 100, junctionsBlunt: true })).toBe(10)
    expect(defaultLigationMultiplicity({ insertLengthBp: 40, junctionsBlunt: false })).toBe(10)
    expect(defaultLigationMultiplicity({ insertLengthBp: 24, junctionsBlunt: true })).toBe(10)
    expect(historyJunctionsAreBlunt(cloningProduct())).toBe(false)
    expect(
      historyJunctionsAreBlunt(
        cloningProduct({
          regeneratedSites: [
            { name: 'SmaI', pos: 0, siteCount: 1, blunt: true },
            { name: 'EcoRV', pos: 800, siteCount: 1, blunt: true },
          ],
        }),
      ),
    ).toBe(true)
  })

  it('formats insert:vector molar ratios and quantities', () => {
    expect(formatMolarRatio(800, 3400)).toBe('1 : 4.25')
    expect(formatMolarRatio(3400, 800)).toBe('4.25 : 1')
    expect(formatMolarRatio(1000, 1000)).toBe('1 : 1')
    expect(formatRecipeQuantity(14.117647)).toBe((14.12).toLocaleString())
    expect(formatRecipeQuantity(0.4)).toBe((0.4).toLocaleString())
    expect(parseRecipeNumber('20')).toBe(20)
    expect(parseRecipeNumber('')).toBeNull()
  })
})

describe('cloning recipe parts from history', () => {
  it('reads vector backbone and insert fragment lengths from restriction cloning history', () => {
    const parts = cloningRecipePartsFromHistory(cloningProduct())
    expect(parts).toEqual([
      { id: 'vector:0', role: 'vector', name: 'pUC', lengthBp: 3400 },
      { id: 'insert:1', role: 'insert', name: 'GFP', lengthBp: 800 },
    ])
  })

  it('treats unique-cutter insertAt as the linearized vector', () => {
    const parts = cloningRecipePartsFromHistory(
      cloningProduct({
        inputSummaries: [
          { manipulation: 'insertAt', name1: 'XbaI', val1: '234' },
          { manipulation: 'insert', name1: 'XbaI', val1: '1', name2: 'NheI', val2: '801' },
        ],
      }),
    )
    expect(parts).toEqual([
      { id: 'vector:0', role: 'vector', name: 'pUC', lengthBp: 4300 },
      { id: 'insert:1', role: 'insert', name: 'GFP', lengthBp: 800 },
    ])
  })

  it('uses the full plasmid when the vector replace lists only one cut', () => {
    const parts = cloningRecipePartsFromHistory(
      cloningProduct({
        inputSummaries: [
          { manipulation: 'replace', name1: 'XbaI', val1: '234' },
          { manipulation: 'insert', name1: 'XbaI', val1: '1', name2: 'NheI', val2: '801' },
        ],
      }),
    )
    expect(parts?.find((part) => part.role === 'vector')?.lengthBp).toBe(4300)
    expect(parts?.find((part) => part.role === 'insert')?.lengthBp).toBe(800)
  })

  it('collects every insert for multi-fragment cloning', () => {
    const parts = cloningRecipePartsFromHistory(
      cloningProduct({
        operation: 'insertFragments',
        inputSummaries: [
          { manipulation: 'replace', name1: 'BamHI', val1: '1001', name2: 'EcoRI', val2: '101' },
          { manipulation: 'insert', name1: 'EcoRI', val1: '1', name2: 'BamHI', val2: '801' },
          { manipulation: 'flipAndInsert', name1: 'XbaI', val1: '11', name2: 'SalI', val2: '511' },
        ],
        children: [
          node({ id: 'vector', name: 'pUC.dna', seqLen: 4300, circular: true, operation: 'invalid' }),
          node({ id: 'insert', name: 'GFP.dna', seqLen: 1200, operation: 'invalid' }),
          node({ id: 'insert2', name: 'Tag.dna', seqLen: 900, operation: 'invalid' }),
        ],
      }),
    )
    expect(parts?.filter((part) => part.role === 'insert').map((part) => part.lengthBp)).toEqual([800, 500])
  })

  it('ignores PCR and other non-restriction insert operations', () => {
    expect(
      cloningRecipePartsFromHistory(
        cloningProduct({ operation: 'amplifyFragment' }),
      ),
    ).toBeNull()
  })
})
