import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LinearAlignmentMapTraces } from './LinearAlignmentMapTraces'
import { LINEAR_ALIGNMENT_MISMATCH_MIN_WIDTH } from '../domain/linearAlignmentMap'
import type { TraceFileRecord } from '../domain/traceTypes'

const trace: TraceFileRecord = {
  id: 'trace-1',
  fileName: 'read.ab1',
  sequence: 'ACGTACGTAC',
  chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
  enabled: true,
  expanded: false,
  showAnnotations: false,
  alignment: {
    templateStart: 0,
    templateEnd: 10,
    traceStart: 0,
    traceEnd: 10,
    mismatchCount: 1,
    gapCount: 1,
    orientation: 'forward',
    alignmentScore: 0,
    columns: Array.from({ length: 10 }, (_, index) => index === 7
      ? { kind: 'templateGap' as const, templateIndex: index, traceIndex: index }
      : { kind: 'match' as const, templateIndex: index, traceIndex: index, match: index !== 3 }),
  },
}

function render(selectedTraceId: string | null) {
  return renderToStaticMarkup(createElement('svg', null, createElement(LinearAlignmentMapTraces, {
    traceFiles: [trace],
    alignmentsVisible: true,
    bandTop: 0,
    bandHeight: 24,
    trackLeft: 0,
    trackRight: 1000,
    selectedTraceId,
    sequenceX: (position: number) => position * 0.1,
    onSelectTrace: () => {},
  })))
}

describe('LinearAlignmentMapTraces', () => {
  it.each([null, 'trace-1'])('keeps mismatch and indel marks visible (selected: %s)', (selectedTraceId) => {
    const markup = render(selectedTraceId)
    const marks = markup.match(/class="linear-alignment-trace-mismatch"/g) ?? []
    expect(marks).toHaveLength(2)
    expect(markup).toMatch(new RegExp(`width="${LINEAR_ALIGNMENT_MISMATCH_MIN_WIDTH}"[^>]*class="linear-alignment-trace-mismatch"`))
  })
})
