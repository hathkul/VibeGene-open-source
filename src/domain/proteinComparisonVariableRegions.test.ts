import { describe, expect, it } from 'vitest'
import {
  addProteinComparisonVariableRegion,
  selectionOverlapsVariableRegion,
  subtractProteinComparisonVariableRegion,
} from './proteinComparisonVariableRegions'

describe('protein comparison variability regions', () => {
  it('merges marked stretches and splits a partially cleared stretch', () => {
    const merged = addProteinComparisonVariableRegion(
      [{ id: 'first', start: 4, end: 8 }],
      { start: 8, end: 12 },
      'second',
      20,
    )
    expect(merged).toEqual([{ id: 'first', start: 4, end: 12 }])
    expect(selectionOverlapsVariableRegion({ start: 7, end: 9 }, merged)).toBe(true)

    const cleared = subtractProteinComparisonVariableRegion(
      merged,
      { start: 6, end: 10 },
      () => 'split',
      20,
    )
    expect(cleared).toEqual([
      { id: 'first', start: 4, end: 6 },
      { id: 'split', start: 10, end: 12 },
    ])
  })
})
