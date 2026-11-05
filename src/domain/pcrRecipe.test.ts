import { describe, expect, it } from 'vitest'
import { pcrRecipeContextFromHistory } from './pcrRecipe'
import type { HistoryNode } from './types'

function node(overrides: Partial<HistoryNode>): HistoryNode {
  return {
    id: 'node', name: 'Product.dna', seqLen: 400, circular: false,
    operation: 'amplifyFragment', resurrectable: true, hideHistory: false,
    oligos: [
      { name: 'Forward', sequence: 'ATGCATGCATGCATGCATGC' },
      { name: 'Reverse', sequence: 'GCATGCATGCATGCATGCAT' },
    ],
    regeneratedSites: [], inputSummaries: [], features: [], children: [],
    sequence: 'ATGC'.repeat(100),
    ...overrides,
  }
}

describe('OE-PCR history recipes', () => {
  it('includes primary PCR reactions before the overlap-extension reaction', () => {
    const recipe = pcrRecipeContextFromHistory(node({
      id: 'fusion', name: 'Joined.dna', seqLen: 750, operation: 'overlapAndAmplify',
      children: [
        node({ id: 'primary-1', name: 'Fragment 1.dna', seqLen: 400 }),
        node({ id: 'primary-2', name: 'Fragment 2.dna', seqLen: 380 }),
      ],
    }))

    expect(recipe?.primaryReactions?.map((reaction) => ({
      productName: reaction.productName,
      productLengthBp: reaction.productLengthBp,
      primerNames: reaction.primers.map((primer) => primer.name),
    }))).toEqual([
      { productName: 'Fragment 1', productLengthBp: 400, primerNames: ['Forward', 'Reverse'] },
      { productName: 'Fragment 2', productLengthBp: 380, primerNames: ['Forward', 'Reverse'] },
    ])
  })
})
