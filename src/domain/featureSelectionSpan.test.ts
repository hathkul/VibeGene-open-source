import { describe, expect, it } from 'vitest'
import { featureSelectionSpan } from './featureSelectionSpan'

const feature = (...ranges: Array<[number, number]>) => ({
  locations: ranges.map(([start, end]) => ({ start, end, strand: 'forward' as const })),
})

describe('featureSelectionSpan', () => {
  it('includes selected features and intervening bases on linear DNA', () => {
    expect(featureSelectionSpan([feature([10, 20]), feature([40, 50]), feature([15, 30])], 100, 'linear'))
      .toEqual({ start: 10, end: 50 })
  })

  it('uses the shorter continuous span on circular DNA, including across the origin', () => {
    expect(featureSelectionSpan([feature([90, 95]), feature([5, 10])], 100, 'circular'))
      .toEqual({ start: 90, end: 10 })
    expect(featureSelectionSpan([feature([10, 20]), feature([40, 50])], 100, 'circular'))
      .toEqual({ start: 10, end: 50 })
    expect(featureSelectionSpan([feature([90, 10]), feature([15, 20])], 100, 'circular'))
      .toEqual({ start: 90, end: 20 })
  })

  it('includes all segments and handles full coverage and empty inputs', () => {
    expect(featureSelectionSpan([feature([5, 10], [30, 40]), feature([50, 60])], 100, 'linear'))
      .toEqual({ start: 5, end: 60 })
    expect(featureSelectionSpan([feature([0, 60]), feature([60, 100])], 100, 'circular'))
      .toEqual({ start: 0, end: 100 })
    expect(featureSelectionSpan([], 100, 'linear')).toBeNull()
  })
})
