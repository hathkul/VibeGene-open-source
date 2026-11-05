import { describe, expect, it } from 'vitest'
import {
  databaseManagerPickSelectionScope,
  filterDatabaseManagerSelection,
} from './selectionScope'

describe('database manager pick selection scope', () => {
  it('changes at each new request and hides stale selections until a row is selected', () => {
    const first = databaseManagerPickSelectionScope({ requestId: 'one' }, null, null)
    const second = databaseManagerPickSelectionScope({ requestId: 'two' }, null, null)
    expect(first).toBe('construct:one')
    expect(filterDatabaseManagerSelection(['old'], ['old'], second, first)).toEqual([])
    expect(filterDatabaseManagerSelection(['new'], ['new'], second, second)).toEqual(['new'])
  })

  it('keeps current single and multiple selections eligible for add actions', () => {
    const scope = databaseManagerPickSelectionScope({ requestId: 'one' }, null, null)
    expect(filterDatabaseManagerSelection(['a'], ['a', 'b'], scope, scope)).toEqual(['a'])
    expect(filterDatabaseManagerSelection(['a', 'b'], ['a', 'b'], scope, scope)).toEqual(['a', 'b'])
  })
})
