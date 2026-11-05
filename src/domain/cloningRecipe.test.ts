import { describe, expect, it } from 'vitest'
import { cloningRecipePartsFromHistory } from './cloningRecipe'
import type { HistoryNode } from './types'

function source(id: string, name: string, seqLen: number): HistoryNode {
  return {
    id, name, seqLen, circular: false, operation: 'invalid', resurrectable: true, hideHistory: false,
    oligos: [], regeneratedSites: [], inputSummaries: [], features: [], children: [],
  }
}

describe('cloning recipe history adapters', () => {
  it.each(['taCloning', 'gcCloning'])('derives vector and insert parts for %s', (operation) => {
    const parts = cloningRecipePartsFromHistory({
      ...source('product', 'Product.dna', 3100), operation,
      children: [source('insert', 'Amplicon.dna', 100), source('vector', 'pVector.dna', 3000)],
    })
    expect(parts).toEqual([
      { id: 'vector:vector', role: 'vector', name: 'pVector', lengthBp: 3000 },
      { id: 'insert:insert', role: 'insert', name: 'Amplicon', lengthBp: 100 },
    ])
  })

  it('derives a recipe from the restriction ancestry retained by sgRNA cloning', () => {
    const parts = cloningRecipePartsFromHistory({
      ...source('product', 'sgRNA clone.dna', 3100), operation: 'cloneSgRNA',
      inputSummaries: [{ manipulation: 'replace' }, { manipulation: 'insert' }],
      children: [source('vector', 'pGuide.dna', 3000), source('insert', 'Guide oligos.dna', 100)],
    })
    expect(parts?.map(({ role, name }) => ({ role, name }))).toEqual([
      { role: 'vector', name: 'pGuide' },
      { role: 'insert', name: 'Guide oligos' },
    ])
  })

  it('uses the first input as the equimolar reference for linear ligation', () => {
    const parts = cloningRecipePartsFromHistory({
      ...source('product', 'Assembly.dna', 750), operation: 'ligateFragments',
      inputSummaries: [
        { manipulation: 'insert', val1: '101', val2: '501' },
        { manipulation: 'insert', val1: '901', val2: '101' },
        { manipulation: 'insert', val1: '1', val2: '151' },
      ],
      children: [
        source('first', 'Backbone fragment.dna', 1000),
        source('second', 'Gene fragment.dna', 1000),
        source('third', 'Tag fragment.dna', 500),
      ],
    })
    expect(parts).toEqual([
      { id: 'first:ligation:0', role: 'vector', name: 'Backbone fragment', lengthBp: 400 },
      { id: 'second:ligation:1', role: 'insert', name: 'Gene fragment', lengthBp: 200 },
      { id: 'third:ligation:2', role: 'insert', name: 'Tag fragment', lengthBp: 150 },
    ])
  })
})
