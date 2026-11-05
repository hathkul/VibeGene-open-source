import { themeFixturePalette } from '../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import { isSgRnaCloningOligo, reconcileSgRnaOligoNames, sgRnaOligoDescription } from './sgrnaOligoPrimers'
import type { HistoryNode, Primer } from './types'

const sense = 'GATCGACGTACGTACGTACGTACGTG'
const antisense = 'AAAACACGTACGTACGTACGTACGTC'
const productName = 'Example vector - guide 10 (Example gene)'
const oligo = (name: string, sequence: string, description: string): Primer => ({
  id: name + sequence,
  name,
  sequence,
  color: themeFixturePalette.greenPrimary,
  description,
})
const history = {
  operation: 'cloneSgRNA',
  sgRnaCloning: {
    oligos: [
      { name: 'sgRNA 10 (ExampleGene)_sense', sequence: sense, modification: '5′ phosphate', guideId: 'g1' },
      { name: 'sgRNA 10 (ExampleGene)_antisense', sequence: antisense, modification: '5′ phosphate', guideId: 'g1' },
    ],
  },
} as HistoryNode

describe('sgRNA cloning oligo primer identity', () => {
  it('classifies marked and legacy cloning oligos without grouping ordinary primers', () => {
    expect(isSgRnaCloningOligo(oligo('sense', sense, sgRnaOligoDescription('sense')))).toBe(true)
    expect(isSgRnaCloningOligo(oligo('antisense', antisense, 'sgRNA cloning antisense oligo, 5′→3′; order with 5′ phosphate'))).toBe(true)
    expect(isSgRnaCloningOligo(oligo('Example primer', 'ACGTACGTACGTACGTACGTACGTACG', ''))).toBe(false)
  })

  it('restores the product-named reverse oligo from a cloned guide', () => {
    const primers = [
      oligo('Example primer', 'ACGTACGTACGTACGTACGTACGTACG', ''),
      oligo('sgRNA 10 (ExampleGene)_sense', sense, sgRnaOligoDescription('sense')),
      oligo(productName, antisense, 'sgRNA cloning antisense oligo, 5′→3′; order with 5′ phosphate'),
    ]
    expect(reconcileSgRnaOligoNames(primers, history, productName).map((primer) => primer.name)).toEqual([
      'Example primer', 'sgRNA 10 (ExampleGene)_sense', 'sgRNA 10 (ExampleGene)_antisense',
    ])
  })

  it('leaves unrelated and intentionally renamed primers unchanged', () => {
    const unrelated = oligo(productName, antisense, '')
    const userRenamed = oligo('custom anti', antisense, sgRnaOligoDescription('antisense'))
    const wrongSequence = oligo(productName, 'ACACACAC', sgRnaOligoDescription('antisense'))
    expect(reconcileSgRnaOligoNames([unrelated, userRenamed, wrongSequence], history, productName))
      .toEqual([unrelated, userRenamed, wrongSequence])
  })
})
