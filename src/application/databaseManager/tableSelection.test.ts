import { describe, expect, it } from 'vitest'
import {
  applyToggleToSelection,
  planConstructSinglePickSelection,
  planTableRangeSelection,
} from './tableSelection'

describe('database manager table selection', () => {
  it('selects a visible range when shift-clicking', () => {
    expect(
      planTableRangeSelection({
        rowId: 'c',
        anchorId: 'a',
        visibleRowIds: ['a', 'b', 'c', 'd'],
        event: { shiftKey: true, metaKey: false, ctrlKey: false },
      }),
    ).toEqual({ kind: 'range', selectedIds: ['a', 'b', 'c'] })
  })

  it('toggles with meta or ctrl', () => {
    expect(
      planTableRangeSelection({
        rowId: 'b',
        anchorId: 'a',
        visibleRowIds: ['a', 'b'],
        event: { shiftKey: false, metaKey: true, ctrlKey: false },
      }).kind,
    ).toBe('toggle')
    expect(applyToggleToSelection(['a'], 'b')).toEqual(['a', 'b'])
    expect(applyToggleToSelection(['a', 'b'], 'b')).toEqual(['a'])
  })

  it('replaces selection for single construct pick', () => {
    expect(planConstructSinglePickSelection('p1')).toEqual({
      kind: 'single',
      selectedIds: ['p1'],
      anchorId: 'p1',
    })
  })
})
