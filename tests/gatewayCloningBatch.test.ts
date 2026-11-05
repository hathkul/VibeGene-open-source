import { describe, expect, it } from 'vitest'
import {
  deduplicateGatewayBatchPrimers,
  gatewayBatchCombinationCount,
  gatewayBatchCombinations,
  renderGatewayBpBatchName,
  renderGatewayLrBatchName,
} from '../src/domain/gatewayCloningBatch'

describe('gatewayCloningBatch', () => {
  it('builds stable, capped Cartesian matrices', () => {
    expect(gatewayBatchCombinationCount([[1, 2], [3, 4], [5]])).toBe(4)
    expect(gatewayBatchCombinations([[1, 2], [3, 4], [5]])).toEqual([
      [1, 3, 5], [1, 4, 5], [2, 3, 5], [2, 4, 5],
    ])
    expect(gatewayBatchCombinations([[1, 2], [3, 4]], 3)).toHaveLength(3)
  })

  it('renders BP and LR source tokens', () => {
    expect(renderGatewayBpBatchName('<donor_name> + <insert_name>.dna', 'Gene.dna', 'pDONR.dna'))
      .toBe('pDONR + Gene.dna')
    expect(renderGatewayLrBatchName('<destination_name> - <entry1_name> - <entry_names>.dna', ['A.dna', 'B.dna'], 'Dest.dna'))
      .toBe('Dest - A - A + B.dna')
  })

  it('deduplicates identical oligos across products', () => {
    const primer = { id: 'p1', name: 'Primer', sequence: 'AACCGG', color: '#000' }
    const result = deduplicateGatewayBatchPrimers([
      { key: 'one', primers: [primer] },
      { key: 'two', primers: [{ ...primer, id: 'p2' }] },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.productKeys).toEqual(['one', 'two'])
  })
})
