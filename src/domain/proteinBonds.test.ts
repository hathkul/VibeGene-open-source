import { describe, expect, it } from 'vitest'
import { adjustProteinBondsForReplacement } from './proteinBonds'
import type { ProteinBond } from './types'

const bond = (left: number, right: number): ProteinBond => ({
  id: `${left}-${right}`,
  name: 'bond',
  type: 'disulfide',
  endpoints: [{ residue: left }, { residue: right }],
})

describe('adjustProteinBondsForReplacement', () => {
  it('shifts local endpoints after an insertion', () => {
    expect(adjustProteinBondsForReplacement([bond(2, 8)], 5, 5, 3)[0]?.endpoints)
      .toEqual([{ residue: 2 }, { residue: 11 }])
  })

  it('drops a bond whose local endpoint was replaced', () => {
    expect(adjustProteinBondsForReplacement([bond(2, 8)], 1, 4, 1)).toEqual([])
  })

  it('preserves external-chain endpoints while shifting local endpoints', () => {
    const external: ProteinBond = {
      ...bond(2, 8),
      endpoints: [{ residue: 20, chainId: 'B' }, { residue: 8 }],
    }
    expect(adjustProteinBondsForReplacement([external], 3, 5, 0)[0]?.endpoints)
      .toEqual([{ residue: 20, chainId: 'B' }, { residue: 6 }])
  })
})
