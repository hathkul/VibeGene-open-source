import { describe, expect, it } from 'vitest'
import { indexIntervalsBySequenceRow } from './sequenceRowIntervalIndex'

describe('indexIntervalsBySequenceRow', () => {
  const rows = [
    { rowStart: 0, rowLength: 10 },
    { rowStart: 10, rowLength: 10 },
    { rowStart: 20, rowLength: 5 },
  ]

  it('places intervals only in overlapping rows, including exact boundaries', () => {
    const items = [
      { id: 'first', start: 2, end: 10 },
      { id: 'crosses', start: 8, end: 13 },
      { id: 'last', start: 24, end: 25 },
      { id: 'outside', start: 25, end: 30 },
      { id: 'empty', start: 12, end: 12 },
    ]
    expect(indexIntervalsBySequenceRow(items, rows, (item) => item)).toEqual([
      [items[0], items[1]],
      [items[1]],
      [items[2]],
    ])
  })

  it('keeps feature insertion order within each row and avoids duplicating short intervals', () => {
    const items = Array.from({ length: 10_000 }, (_, index) => ({
      id: String(index),
      start: index * 10,
      end: index * 10 + 4,
    }))
    const indexedRows = Array.from({ length: 1_000 }, (_, index) => ({
      rowStart: index * 100,
      rowLength: 100,
    }))
    const result = indexIntervalsBySequenceRow(items, indexedRows, (item) => item)
    expect(result[0]).toEqual(items.slice(0, 10))
    expect(result[500]).toEqual(items.slice(5_000, 5_010))
    expect(result.flat()).toHaveLength(items.length)
  })
})
