import { describe, expect, it } from 'vitest'
import type { PrimerFrameDisplay } from '../../domain/primerSequenceLayout'
import type { TraceTemplateAlignment } from '../../domain/traceTypes'
import { tracePrimerDisplaysEligibleForRefinement } from './tracePrimerRefinement'

function display(start: number, end: number): PrimerFrameDisplay {
  return {
    primerId: `${start}-${end}`, name: 'primer', color: 'primer-color', strand: 'forward', sequence: 'ACGT',
    glyphs: [], templateSpanStart: start, templateSpanEnd: end, selectRange: { start, end },
  }
}

function alignment(columns: TraceTemplateAlignment['columns']): TraceTemplateAlignment {
  return {
    templateStart: 0, templateEnd: 6, traceStart: 0, traceEnd: 6,
    mismatchCount: 0, gapCount: 0, orientation: 'forward', alignmentScore: 0, columns,
  }
}

describe('trace primer refinement eligibility', () => {
  it('retains only fully covered sites and excludes sites crossing a read insertion', () => {
    const columns: TraceTemplateAlignment['columns'] = [
      { kind: 'match', templateIndex: 0, traceIndex: 0, match: true },
      { kind: 'match', templateIndex: 1, traceIndex: 1, match: true },
      { kind: 'match', templateIndex: 2, traceIndex: 2, match: true },
      { kind: 'traceInsert', traceIndex: 3 },
      { kind: 'match', templateIndex: 3, traceIndex: 4, match: true },
      { kind: 'match', templateIndex: 4, traceIndex: 5, match: true },
      { kind: 'match', templateIndex: 5, traceIndex: 6, match: true },
    ]
    const observed = [display(0, 2), display(1, 4), display(3, 5), display(5, 7)]
    expect(tracePrimerDisplaysEligibleForRefinement(observed, alignment(columns)).map((item) => item.primerId))
      .toEqual(['0-2', '3-5'])
  })

  it('excludes sites that extend outside the trace alignment coverage', () => {
    const coverage = {
      ...alignment([
        { kind: 'match', templateIndex: 1, traceIndex: 0, match: true },
        { kind: 'match', templateIndex: 2, traceIndex: 1, match: true },
        { kind: 'match', templateIndex: 3, traceIndex: 2, match: true },
        { kind: 'match', templateIndex: 4, traceIndex: 3, match: true },
      ]),
      templateStart: 1,
      templateEnd: 5,
    }
    const observed = [display(0, 3), display(3, 5)]
    expect(tracePrimerDisplaysEligibleForRefinement(observed, coverage).map((item) => item.primerId)).toEqual(['3-5'])
  })
})
