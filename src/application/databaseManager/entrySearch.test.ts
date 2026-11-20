import { describe, expect, it } from 'vitest'
import { matchesDatabaseEntrySearch } from './entrySearch'

describe('database primer and CDS search', () => {
  it('matches name, sequence, product, and primer tags case-insensitively', () => {
    const entry = { name: 'CMV forward', sequence: 'ACGTAC', product: 'Glycoprotein' }
    for (const query of ['cmv', 'gtac', 'GLYCO', 'tag']) {
      expect(matchesDatabaseEntrySearch(query, entry, ['Tag'])).toBe(true)
    }
    expect(matchesDatabaseEntrySearch('other', entry)).toBe(false)
  })

  it('does not match source names or hidden descriptions', () => {
    const row = { name: 'Other primer', sequence: 'ACGT', description: 'CMV description', projectName: 'CMV plasmid' }
    expect(matchesDatabaseEntrySearch('CMV', row)).toBe(false)
    expect(matchesDatabaseEntrySearch('other', row)).toBe(true)
  })
})
