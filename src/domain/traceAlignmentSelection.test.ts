import { describe, expect, it } from 'vitest'
import {
  displayedTraceOrdinal,
  displayedTraceSelectionForTemplateRange,
  initialDirectionForAlignment,
  selectedAlignedTraceSequence,
  traceInspectorTemplateRange,
  traceStoredIndicesForTemplateRange,
} from './traceAlignmentSelection'
import type { TraceTemplateAlignment } from './traceTypes'

function forwardAlignment(): TraceTemplateAlignment {
  // Template 10..15 aligned to trace ordinals 0..4 (one templateGap at template 12).
  return {
    templateStart: 10,
    templateEnd: 16,
    traceStart: 0,
    traceEnd: 5,
    mismatchCount: 0,
    gapCount: 1,
    orientation: 'forward',
    alignmentScore: 1,
    columns: [
      { kind: 'match', templateIndex: 10, traceIndex: 0, match: true },
      { kind: 'match', templateIndex: 11, traceIndex: 1, match: true },
      { kind: 'templateGap', templateIndex: 12, traceIndex: -1 },
      { kind: 'match', templateIndex: 13, traceIndex: 2, match: true },
      { kind: 'match', templateIndex: 14, traceIndex: 3, match: true },
      { kind: 'match', templateIndex: 15, traceIndex: 4, match: true },
    ],
  }
}

describe('trace alignment selection', () => {
  it('copies displayed trace calls including insertions and skipping deletions', () => {
    const alignment: TraceTemplateAlignment = {
      ...forwardAlignment(), templateStart: 0, templateEnd: 3, traceStart: 0, traceEnd: 3,
      columns: [
        { kind: 'match', templateIndex: 0, traceIndex: 0, match: true },
        { kind: 'traceInsert', traceIndex: 1 },
        { kind: 'templateGap', templateIndex: 1, traceIndex: -1 },
        { kind: 'match', templateIndex: 2, traceIndex: 2, match: false },
      ],
    }
    expect(selectedAlignedTraceSequence(alignment, ['A', 'G', 'T'], 0, 2)).toBe('AGT')
    const reverse = { ...alignment, orientation: 'reverse' as const, columns: [
      { kind: 'match' as const, templateIndex: 0, traceIndex: 2, match: true },
      { kind: 'traceInsert' as const, traceIndex: 1 },
      { kind: 'templateGap' as const, templateIndex: 1, traceIndex: -1 },
      { kind: 'match' as const, templateIndex: 2, traceIndex: 0, match: false },
    ] }
    expect(selectedAlignedTraceSequence(reverse, ['A', 'G', 'T'], 2, 0)).toBe('ACT')
  })
  it('projects a template span onto stored trace indices', () => {
    const alignment = forwardAlignment()
    expect(traceStoredIndicesForTemplateRange(alignment, 11, 14)).toEqual([1, 2])
    expect(traceStoredIndicesForTemplateRange(alignment, 20, 25)).toEqual([])
    expect(traceStoredIndicesForTemplateRange(null, 0, 5)).toEqual([])
  })

  it('mirrors stored ordinals for the reverse display', () => {
    expect(displayedTraceOrdinal(0, 5, 'forward')).toBe(0)
    expect(displayedTraceOrdinal(0, 5, 'reverse')).toBe(4)
    expect(displayedTraceOrdinal(4, 5, 'reverse')).toBe(0)
  })

  it('derives the opening direction from the alignment orientation', () => {
    expect(initialDirectionForAlignment(forwardAlignment())).toBe('forward')
    expect(initialDirectionForAlignment({ ...forwardAlignment(), orientation: 'reverse' })).toBe('reverse')
    expect(initialDirectionForAlignment(null)).toBe('forward')
  })

  it('selects a contiguous displayed range covering gaps in the span', () => {
    const alignment = forwardAlignment()
    const forward = displayedTraceSelectionForTemplateRange(alignment, 5, 11, 15)
    expect(forward).toEqual({ direction: 'forward', selection: { start: 1, end: 3 } })
    expect(displayedTraceSelectionForTemplateRange(null, 5, 0, 3)).toBeNull()
    expect(displayedTraceSelectionForTemplateRange(alignment, 0, 0, 3)).toBeNull()
  })

  it('mirrors the selection when the read is aligned as a reverse complement', () => {
    const alignment = { ...forwardAlignment(), orientation: 'reverse' as const }
    const reverse = displayedTraceSelectionForTemplateRange(alignment, 5, 11, 15)
    expect(reverse).toEqual({ direction: 'reverse', selection: { start: 1, end: 3 } })
  })

  it('has no selection when the template span misses the aligned region', () => {
    expect(displayedTraceSelectionForTemplateRange(forwardAlignment(), 5, 40, 45)).toBeNull()
  })
})

describe('traceInspectorTemplateRange', () => {
  const range = { start: 4, end: 9 }

  it('carries the template span while alignments are shown, even with a focused trace', () => {
    expect(traceInspectorTemplateRange({
      selectedRange: range,
      alignmentsVisible: true,
      recordIsDnaLibrary: true,
      focusedTraceId: 'trace-a',
    })).toEqual(range)
    expect(traceInspectorTemplateRange({
      selectedRange: range,
      alignmentsVisible: true,
      recordIsDnaLibrary: false,
      focusedTraceId: 'trace-a',
    })).toEqual(range)
  })

  it('drops the span in member-native library browse, where the range is not template coordinates', () => {
    expect(traceInspectorTemplateRange({
      selectedRange: range,
      alignmentsVisible: false,
      recordIsDnaLibrary: true,
      focusedTraceId: 'trace-a',
    })).toBeNull()
  })

  it('keeps ordinary hidden-alignment selections because they stay template coordinates', () => {
    expect(traceInspectorTemplateRange({
      selectedRange: range,
      alignmentsVisible: false,
      recordIsDnaLibrary: true,
      focusedTraceId: null,
    })).toEqual(range)
    expect(traceInspectorTemplateRange({
      selectedRange: range,
      alignmentsVisible: false,
      recordIsDnaLibrary: false,
      focusedTraceId: 'trace-a',
    })).toEqual(range)
  })

  it('has no span without a selection', () => {
    expect(traceInspectorTemplateRange({
      selectedRange: null,
      alignmentsVisible: true,
      recordIsDnaLibrary: true,
      focusedTraceId: 'trace-a',
    })).toBeNull()
  })
})
