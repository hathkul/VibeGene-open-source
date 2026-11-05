import { describe, expect, it } from 'vitest'
import { digestEnzymeNamesFromHistorySummary } from '../src/domain/historyContribution'

describe('digestEnzymeNamesFromHistorySummary', () => {
  it('lists unique restriction enzymes from a cloning summary', () => {
    expect(
      digestEnzymeNamesFromHistorySummary({
        manipulation: 'replace',
        name1: 'BamHI',
        val1: '1001',
        name2: 'EcoRI',
        val2: '101',
      }),
    ).toEqual(['BamHI', 'EcoRI'])
    expect(
      digestEnzymeNamesFromHistorySummary({
        manipulation: 'insertAt',
        name1: 'XbaI',
        val1: '234',
      }),
    ).toEqual(['XbaI'])
  })

  it('ignores PCR primer ends and unnamed markers', () => {
    expect(
      digestEnzymeNamesFromHistorySummary({
        manipulation: 'amplify',
        name1: 'Fwd',
        name2: 'Rev',
        val1: '1',
        val2: '280',
      }),
    ).toEqual([])
    expect(
      digestEnzymeNamesFromHistorySummary({
        manipulation: 'insert',
        name1: '<Start>',
        val1: '1',
        name2: 'End',
        val2: '20',
      }),
    ).toEqual([])
  })
})
