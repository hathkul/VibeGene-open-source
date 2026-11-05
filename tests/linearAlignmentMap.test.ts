import { describe, expect, it } from 'vitest'
import {
  assignLinearAlignmentLevels,
  buildLinearAlignmentFillSegments,
  formatLinearAlignmentHoverLabel,
  isTemplateIndexExact,
  linearAlignmentArrowPath,
  linearAlignmentBandHeight,
  linearAlignmentSegmentWidthPx,
  LINEAR_ALIGNMENT_MISMATCH_MIN_WIDTH,
} from '../src/domain/linearAlignmentMap'
import type { TraceFileRecord, TraceTemplateAlignment } from '../src/domain/traceTypes'

function makeAlignment(overrides: Partial<TraceTemplateAlignment> = {}): TraceTemplateAlignment {
  return {
    templateStart: 10,
    templateEnd: 20,
    traceStart: 0,
    traceEnd: 10,
    mismatchCount: 1,
    gapCount: 1,
    orientation: 'forward',
    alignmentScore: 1,
    columns: [
      { kind: 'match', templateIndex: 10, traceIndex: 0, match: true },
      { kind: 'match', templateIndex: 11, traceIndex: 1, match: false },
      { kind: 'templateGap', templateIndex: 12, traceIndex: 2 },
      { kind: 'match', templateIndex: 13, traceIndex: 3, match: true },
    ],
    ...overrides,
  }
}

function makeTrace(id: string, alignment: TraceTemplateAlignment | null, enabled = true): TraceFileRecord {
  return {
    id,
    fileName: `${id}.ab1`,
    sequence: 'ATGC',
    chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: ['A', 'T', 'G', 'C'] },
    enabled,
    expanded: false,
    showAnnotations: false,
    alignment,
  }
}

describe('linearAlignmentMap', () => {
  it('marks mismatches and deletions as non-exact segments', () => {
    const alignment = makeAlignment()
    expect(isTemplateIndexExact(alignment, 10)).toBe(true)
    expect(isTemplateIndexExact(alignment, 11)).toBe(false)
    expect(isTemplateIndexExact(alignment, 12)).toBe(false)

    const segments = buildLinearAlignmentFillSegments(alignment)
    expect(segments).toEqual([
      { start: 10, end: 11, isExact: true },
      { start: 11, end: 13, isExact: false },
      { start: 13, end: 14, isExact: true },
      { start: 14, end: 20, isExact: false },
    ])
  })

  it('stacks overlapping alignments on separate levels', () => {
    const traces = [
      makeTrace('a', makeAlignment({ templateStart: 0, templateEnd: 50 })),
      makeTrace('b', makeAlignment({ templateStart: 20, templateEnd: 70 })),
      makeTrace('c', makeAlignment({ templateStart: 80, templateEnd: 100 })),
    ]
    const rendered = assignLinearAlignmentLevels(traces)
    expect(rendered.map((entry) => entry.level)).toEqual([0, 1, 0])
    expect(linearAlignmentBandHeight(1, true)).toBeGreaterThan(linearAlignmentBandHeight(0, true))
  })

  it('builds arrow path taller and wider than the bar body', () => {
    expect(linearAlignmentArrowPath('forward', 10, 8, 100, 200)).toBe('M 212 14 L 200 8 L 200 20 Z')
    expect(linearAlignmentArrowPath('reverse', 10, 8, 100, 200)).toBe('M 88 14 L 100 8 L 100 20 Z')
  })

  it('enforces a minimum width for error strips', () => {
    expect(linearAlignmentSegmentWidthPx(100, 100.2, false)).toBe(LINEAR_ALIGNMENT_MISMATCH_MIN_WIDTH)
    expect(linearAlignmentSegmentWidthPx(100, 100.2, true)).toBeCloseTo(0.2)
  })

  it('omits trace-file dates from comparative alignment hover labels', () => {
    const label = formatLinearAlignmentHoverLabel({
      traceId: 'comparison',
      level: 0,
      templateStart: 0,
      templateEnd: 4,
      orientation: 'forward',
      segments: [],
      fileName: 'comparison.fasta',
      statsLabel: '4 aligned, 1 mismatches, 0 gaps/insertions',
      baseCount: 4,
      alignmentPurpose: 'comparative',
    })

    expect(label).toBe(
      'comparison.fasta\n4 aligned, 1 mismatches, 0 gaps/insertions\n4 bases in comparison sequence',
    )
    expect(label).not.toContain('Date unavailable')
  })
})
