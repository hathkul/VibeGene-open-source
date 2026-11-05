import { describe, expect, it } from 'vitest'
import { alignCloselyRelatedAlleles } from './closelyRelatedAlignment'

describe('alignment of related allele products', () => {
  it.each([
    ['identity', 'ACGTCGTA', 'ACGTCGTA', 0, 0],
    ['substitution', 'ACGTAGTA', 'ACGTCGTA', 1, 0],
    ['insertion', 'ACGTTTCGTA', 'ACGTCGTA', 0, 2],
    ['deletion', 'ACGTA', 'ACGTCGTA', 0, 3],
    ['replacement', 'ACGAAAGTA', 'ACGTCGTA', 2, 1],
    ['leading and trailing changes', 'GGACGT', 'TTACGTT', 2, 1],
  ])('preserves coordinates and bases for %s', (_label, trace, template, mismatches, gaps) => {
    const alignment = alignCloselyRelatedAlleles(trace, template)!
    expect(alignment).toMatchObject({ templateStart: 0, templateEnd: template.length, traceStart: 0, traceEnd: trace.length, orientation: 'forward', mismatchCount: mismatches, gapCount: gaps })
    let queryIndex = 0, templateIndex = 0
    for (const column of alignment.columns) {
      if (column.kind === 'match') {
        expect(column.traceIndex).toBe(queryIndex++)
        expect(column.templateIndex).toBe(templateIndex++)
        expect(column.match).toBe(trace[column.traceIndex] === template[column.templateIndex])
      } else if (column.kind === 'traceInsert') {
        expect(column.traceIndex).toBe(queryIndex++)
      } else {
        expect(column.templateIndex).toBe(templateIndex++)
      }
    }
    expect(queryIndex).toBe(trace.length)
    expect(templateIndex).toBe(template.length)
  })

  it('falls back when the changed region is too large for bounded alignment', () => {
    expect(alignCloselyRelatedAlleles('G' + 'A'.repeat(400) + 'T', 'G' + 'C'.repeat(400) + 'T')).toBeNull()
  })
})
