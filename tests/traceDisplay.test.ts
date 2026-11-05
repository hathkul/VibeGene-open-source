import { describe, expect, it } from 'vitest'
import {
  buildChromatogramPaths,
  buildMergedInsertionLayout,
  tracePositionForColumn,
  traceBaseForColumn,
  visibleMergedLayoutEntries,
} from '../src/domain/traceDisplay'
import type { TraceTemplateAlignment } from '../src/domain/traceTypes'

describe('traceBaseForColumn', () => {
  it('complements reverse-aligned read bases for template-oriented display', () => {
    const column = { kind: 'match' as const, templateIndex: 10, traceIndex: 3, match: true }
    expect(traceBaseForColumn(column, 'AAATTT'.split(''), 'forward')).toBe('T')
    expect(traceBaseForColumn(column, 'AAATTT'.split(''), 'reverse')).toBe('A')
  })
})

describe('tracePositionForColumn', () => {
  it('numbers a reverse-aligned trace from 1 at the right edge toward the left', () => {
    const alignment = {
      orientation: 'reverse' as const,
      traceStart: 89,
      traceEnd: 20,
    } as TraceTemplateAlignment

    expect(tracePositionForColumn(
      { kind: 'match', templateIndex: 0, traceIndex: 89, match: true },
      alignment,
    )).toBe(71)
    expect(tracePositionForColumn(
      { kind: 'match', templateIndex: 69, traceIndex: 20, match: true },
      alignment,
    )).toBe(2)
    expect(tracePositionForColumn(
      { kind: 'insertion', traceIndex: 19 },
      alignment,
    )).toBe(1)
  })

  it('keeps forward-aligned numbering anchored at the left edge', () => {
    const alignment = {
      orientation: 'forward' as const,
      traceStart: 19,
      traceEnd: 90,
    } as TraceTemplateAlignment

    expect(tracePositionForColumn(
      { kind: 'match', templateIndex: 0, traceIndex: 19, match: true },
      alignment,
    )).toBe(1)
    expect(tracePositionForColumn(
      { kind: 'match', templateIndex: 70, traceIndex: 89, match: true },
      alignment,
    )).toBe(71)
  })
})

describe('buildChromatogramPaths', () => {
  it('draws continuous raw samples between aligned base columns and uses called-base hover', () => {
    const alignment: TraceTemplateAlignment = {
      orientation: 'forward',
      templateStart: 0,
      templateEnd: 3,
      traceStart: 0,
      columns: [
        { kind: 'match', templateIndex: 0, traceIndex: 0, match: true },
        { kind: 'match', templateIndex: 1, traceIndex: 1, match: true },
        { kind: 'match', templateIndex: 2, traceIndex: 2, match: true },
      ],
    }
    const chromatogram = {
      aTrace: [10, 100, 20, 30, 40, 120, 50],
      tTrace: [5, 5, 5, 5, 5, 5, 5],
      gTrace: [5, 5, 5, 5, 5, 5, 5],
      cTrace: [5, 5, 5, 5, 5, 5, 5],
      baseCalls: ['A', 'A', 'A'],
      basePos: [1, 4, 6],
    }
    const mergedLayout = buildMergedInsertionLayout([alignment], 3)
    const visibleEntries = visibleMergedLayoutEntries(mergedLayout, 0, 3)
    const geometry = buildChromatogramPaths({
      chromatogram,
      alignment,
      templateStart: 0,
      templateEnd: 3,
      height: 80,
      mergedLayout,
      visibleEntries,
    })

    expect(geometry.hoverSamples).toHaveLength(3)
    expect(geometry.hoverSamples.every((sample) => sample.dominantBase === 'A')).toBe(true)
    const aPath = geometry.paths.find((path) => path.base === 'A')
    expect(aPath?.stroke.match(/L/g)?.length ?? 0).toBeGreaterThan(3)
    const tPath = geometry.paths.find((path) => path.base === 'T')
    expect(tPath?.stroke.match(/L/g)?.length ?? 0).toBeGreaterThan(3)
  })

  it('draws reverse-aligned chromatograms with complemented channels', () => {
    const alignment: TraceTemplateAlignment = {
      orientation: 'reverse',
      templateStart: 0,
      templateEnd: 2,
      traceStart: 0,
      columns: [
        { kind: 'match', templateIndex: 0, traceIndex: 1, match: true },
        { kind: 'match', templateIndex: 1, traceIndex: 0, match: true },
      ],
    }
    const chromatogram = {
      aTrace: [5, 5, 5, 5, 5],
      tTrace: [10, 100, 40, 120, 10],
      gTrace: [5, 5, 5, 5, 5],
      cTrace: [5, 5, 5, 5, 5],
      baseCalls: ['T', 'T'],
      basePos: [1, 3],
    }
    const mergedLayout = buildMergedInsertionLayout([alignment], 2)
    const visibleEntries = visibleMergedLayoutEntries(mergedLayout, 0, 2)
    const geometry = buildChromatogramPaths({
      chromatogram,
      alignment,
      templateStart: 0,
      templateEnd: 2,
      height: 80,
      mergedLayout,
      visibleEntries,
    })

    expect(geometry.hoverSamples.map((sample) => sample.dominantBase)).toEqual(['A', 'A'])
    const aPath = geometry.paths.find((path) => path.base === 'A')
    const tPath = geometry.paths.find((path) => path.base === 'T')
    expect(aPath?.stroke).toContain(',3')
    expect(tPath?.stroke).not.toContain(',3')
  })

  it('breaks chromatogram strokes across foreign insertion gaps in the merged layout', () => {
    const withInsertion: TraceTemplateAlignment = {
      orientation: 'forward',
      templateStart: 0,
      templateEnd: 2,
      traceStart: 0,
      columns: [
        { kind: 'match', templateIndex: 0, traceIndex: 0, match: true },
        { kind: 'insertion', traceIndex: 1 },
        { kind: 'match', templateIndex: 1, traceIndex: 2, match: true },
      ],
    }
    const withoutInsertion: TraceTemplateAlignment = {
      orientation: 'forward',
      templateStart: 0,
      templateEnd: 3,
      traceStart: 0,
      columns: [
        { kind: 'match', templateIndex: 0, traceIndex: 0, match: true },
        { kind: 'match', templateIndex: 1, traceIndex: 1, match: true },
        { kind: 'match', templateIndex: 2, traceIndex: 2, match: true },
      ],
    }
    const chromatogram = {
      aTrace: [100, 10, 100, 10, 100, 10, 100],
      tTrace: [5, 5, 5, 5, 5, 5, 5],
      gTrace: [5, 5, 5, 5, 5, 5, 5],
      cTrace: [5, 5, 5, 5, 5, 5, 5],
      baseCalls: ['A', 'A', 'A'],
      basePos: [0, 2, 4],
    }
    const mergedLayout = buildMergedInsertionLayout([withInsertion, withoutInsertion], 3)
    const visibleEntries = visibleMergedLayoutEntries(mergedLayout, 0, 3)
    const geometry = buildChromatogramPaths({
      chromatogram,
      alignment: withoutInsertion,
      templateStart: 0,
      templateEnd: 3,
      height: 80,
      mergedLayout,
      visibleEntries,
    })

    const aPath = geometry.paths.find((path) => path.base === 'A')
    expect(aPath?.stroke.match(/\bM\b/g)?.length).toBe(2)
  })
})
