import { describe, expect, it } from 'vitest'
import type { RestrictionEnzyme } from '../../domain/types'
import type { EnzymeTabRow } from '../sequence'
import { filterEnzymeTabRows } from './enzymeTabModel'

function row(name: string, recognition: string): EnzymeTabRow {
  const enzyme: RestrictionEnzyme = {
    name,
    notation: `${name} (${recognition})`,
    recognition,
    cutTop: 1,
    cutBottom: recognition.length - 1,
    type: 'II',
    overhang: { type: 'blunt', sequence: null, length: 0 },
    manufacturers: [],
    notes: [],
  }
  return { enzyme, sites: [] }
}

describe('filterEnzymeTabRows', () => {
  const rows = [row('EcoRI', 'GAATTC'), row('BamHI', 'GGATCC')]

  it('matches enzyme names without regard to case', () => {
    expect(filterEnzymeTabRows(rows, 'ecori').map(({ enzyme }) => enzyme.name)).toEqual(['EcoRI'])
  })

  it('matches recognition sequences and ignores embedded whitespace', () => {
    expect(filterEnzymeTabRows(rows, 'ggat cc').map(({ enzyme }) => enzyme.name)).toEqual(['BamHI'])
  })
})
