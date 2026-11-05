import { describe, expect, it } from 'vitest'
import { buildChromatogramPaths, buildMergedInsertionLayout, insertionGapLeftPx, templateBoundaryAtMergedX, templateIndexLeftPx } from './traceDisplay'
import type { ChromatogramData, TraceTemplateAlignment } from './traceTypes'

const chromatogram: ChromatogramData = {
  baseCalls: ['A', 'C', 'G', 'T'],
  basePos: [1, 3, 5, 7],
  aTrace: [0, 1, 3, 1, 0, 1, 3, 1, 0],
  cTrace: [0, 1, 3, 1, 0, 1, 3, 1, 0],
  gTrace: [0, 1, 3, 1, 0, 1, 3, 1, 0],
  tTrace: [0, 1, 3, 1, 0, 1, 3, 1, 0],
}

describe('reference caret at insertion gaps', () => {
  it('maps both sides of a multi-column insertion to the same boundary', () => {
    const layout = { templateLength: 4, anchorInsertionCounts: new Map([[1, 3]]), insertionPrefixByTemplate: new Uint32Array([0, 0, 3, 3, 3]) }
    const left = insertionGapLeftPx(layout, 1, 0)
    expect(templateBoundaryAtMergedX(layout, left + 1, 0, 4)).toMatchObject({ boundary: 2, gapEdge: 'left' })
    expect(templateBoundaryAtMergedX(layout, left + 29, 0, 4)).toMatchObject({ boundary: 2, gapEdge: 'right' })
    expect(templateBoundaryAtMergedX(layout, templateIndexLeftPx(layout, 1) + 9, 0, 4)).toMatchObject({ boundary: 2, gapEdge: 'left' })
    expect(templateBoundaryAtMergedX(layout, templateIndexLeftPx(layout, 2) + 1, 0, 4)).toMatchObject({ boundary: 2, gapEdge: 'right' })
  })

  it('handles insertions at either end of the reference', () => {
    const layout = { templateLength: 2, anchorInsertionCounts: new Map([[-1, 1], [1, 1]]), insertionPrefixByTemplate: new Uint32Array([0, 0, 1]) }
    expect(templateBoundaryAtMergedX(layout, insertionGapLeftPx(layout, -1, 0) + 1, 0, 2)).toMatchObject({ boundary: 0, gapEdge: 'left' })
    expect(templateBoundaryAtMergedX(layout, insertionGapLeftPx(layout, 1, 0) + 9, 0, 2)).toMatchObject({ boundary: 2, gapEdge: 'right' })
  })
})

function paths(orientation: 'forward' | 'reverse', deletion: boolean) {
  const positions = deletion ? [0, 1, 9, 10] : [0, 1, 2, 3]
  const columns: TraceTemplateAlignment['columns'] = []
  for (let templateIndex = 0; templateIndex <= positions[3]!; templateIndex++) {
    const ordinal = positions.indexOf(templateIndex)
    columns.push(ordinal < 0
      ? { kind: 'templateGap', templateIndex, traceIndex: -1 }
      : { kind: 'match', templateIndex, traceIndex: orientation === 'forward' ? ordinal : 3 - ordinal, match: true })
  }
  const alignment: TraceTemplateAlignment = {
    templateStart: 0, templateEnd: positions[3]! + 1, traceStart: 0, traceEnd: 4,
    mismatchCount: 0, gapCount: deletion ? 7 : 0, alignmentScore: 8, orientation, columns,
  }
  return buildChromatogramPaths({ chromatogram, alignment, templateStart: 0, templateEnd: alignment.templateEnd,
    height: 60, mergedLayout: buildMergedInsertionLayout([alignment], alignment.templateEnd) })
}

describe('chromatogram deletion gaps', () => {
  for (const orientation of ['forward', 'reverse'] as const) {
    it(`breaks ${orientation} traces across a deletion`, () => {
      const geometry = paths(orientation, true)
      const centers = geometry.hoverSamples.map(sample => sample.x).sort((a, b) => a - b)
      for (const path of geometry.paths) {
        expect(path.stroke.match(/M /g)).toHaveLength(2)
        expect(path.fill.match(/M /g)).toHaveLength(2)
        const segments = path.stroke.split('M ').filter(Boolean).map(segment =>
          [...segment.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(match => Number(match[1])),
        ).sort((a, b) => Math.min(...a) - Math.min(...b))
        // Each border peak continues beyond its called-base center, but the
        // two traces still leave a clear empty region in the deletion.
        expect(Math.max(...segments[0]!)).toBeGreaterThan(centers[1]!)
        expect(Math.min(...segments[1]!)).toBeLessThan(centers[2]!)
        expect(Math.max(...segments[0]!)).toBeLessThan(Math.min(...segments[1]!))
      }
    })
    it(`keeps adjacent ${orientation} peaks connected`, () => {
      for (const path of paths(orientation, false).paths) expect(path.stroke.match(/M /g)).toHaveLength(1)
    })
  }
})
