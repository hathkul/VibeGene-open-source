import { describe, expect, it } from 'vitest'
import { nextSortState, paneRangeIds } from './paneInteractions'

describe('pane interaction transitions', () => {
  it('toggles direction and resets direction for a new sort mode', () => {
    expect(nextSortState('name', 'asc', 'name')).toEqual({ mode: 'name', direction: 'desc' })
    expect(nextSortState('name', 'desc', 'location')).toEqual({ mode: 'location', direction: 'asc' })
  })

  it('returns an inclusive shift-selection range only when both endpoints exist', () => {
    expect(paneRangeIds(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(paneRangeIds(['a', 'b'], 'x', 'b')).toBeNull()
  })
})
