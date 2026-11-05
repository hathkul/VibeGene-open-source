import { describe, expect, it } from 'vitest'
import {
  findTraceSearchHits,
  nextTraceSearchHitIndex,
  normalizeTraceSearchQuery,
  traceSearchHitRange,
} from './traceSearch'

describe('trace search', () => {
  it('normalizes DNA-only queries and ignores non-base characters', () => {
    expect(normalizeTraceSearchQuery(' atg c ')).toBe('ATGC')
    expect(normalizeTraceSearchQuery('123')).toBe('')
  })

  it('finds overlapping occurrences in the displayed sequence', () => {
    expect(findTraceSearchHits('ATATATC', 'ATA')).toEqual([0, 2])
    expect(findTraceSearchHits('atgc', 'ATG')).toEqual([0])
    expect(findTraceSearchHits('ATGC', '')).toEqual([])
    expect(findTraceSearchHits('ATGC', 'GGG')).toEqual([])
  })

  it('returns an inclusive ordinal range and clamps the final hit to the sequence', () => {
    expect(traceSearchHitRange(2, 'ATA', 7)).toEqual({ start: 2, end: 4 })
    expect(traceSearchHitRange(6, 'ATA', 7)).toEqual({ start: 6, end: 6 })
    expect(traceSearchHitRange(-5, 'ATA', 7)).toEqual({ start: 0, end: 2 })
    expect(traceSearchHitRange(0, '', 7)).toBeNull()
    expect(traceSearchHitRange(0, 'ATA', 0)).toBeNull()
  })

  it('cycles hits with wrap-around in both directions', () => {
    expect(nextTraceSearchHitIndex(0, 1, 3)).toBe(1)
    expect(nextTraceSearchHitIndex(2, 1, 3)).toBe(0)
    expect(nextTraceSearchHitIndex(0, -1, 3)).toBe(2)
    expect(nextTraceSearchHitIndex(0, 1, 0)).toBeNull()
  })
})
