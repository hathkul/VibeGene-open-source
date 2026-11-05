import { describe, expect, it } from 'vitest'
import {
  GIBSON_PART_NAMES_TOKEN,
  deduplicateGibsonBatchPrimers,
  gibsonBatchCombinations,
  renderMassGibsonProductName,
} from '../src/domain/gibsonAssemblyBatch'

describe('Gibson assembly batches', () => {
  it('builds each-in-each combinations across every variable slot', () => {
    expect(gibsonBatchCombinations([[1, 2], ['a', 'b'], [true]])).toEqual([
      [1, 'a', true],
      [1, 'b', true],
      [2, 'a', true],
      [2, 'b', true],
    ])
  })

  it('renders all source names into the product template', () => {
    expect(
      renderMassGibsonProductName(`Built ${GIBSON_PART_NAMES_TOKEN}.dna`, [
        'Vector.dna',
        'Insert A.dna',
      ]),
    ).toBe('Built Vector + Insert A.dna')
  })

  it('orders each identical oligo once and records every product using it', () => {
    const primer = (id: string, sequence: string) => ({ id, name: id, sequence, color: '#000' })
    const pooled = deduplicateGibsonBatchPrimers([
      { key: 'one', primers: [primer('shared-1', 'AACCGG'), primer('unique', 'TTGGCC')] },
      { key: 'two', primers: [primer('shared-2', 'AACCGG')] },
    ])
    expect(pooled).toHaveLength(2)
    expect(pooled.find((entry) => entry.primer.sequence === 'AACCGG')?.productKeys).toEqual(['one', 'two'])
  })
})
