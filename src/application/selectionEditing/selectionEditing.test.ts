import { describe, expect, it } from 'vitest'
import {
  clampSelectionRange,
  directionalSelectionSpan,
  invertSelectionRange,
  invertStrandPairSelection,
  planCaretDeletion,
  redoTransition,
  replaceSequenceRange,
  selectionRangeFromOneBased,
  transformSequenceCase,
  undoTransition,
} from './selectionEditing'

describe('selection editing workflow', () => {
  it('clamps ordinary and collapsed selections at document boundaries', () => {
    expect(clampSelectionRange({ start: -4, end: 0 }, 10)).toEqual({ start: 0, end: 1 })
    expect(clampSelectionRange({ start: 10, end: 20 }, 10, { collapsed: true })).toEqual({ start: 10, end: 10 })
  })

  it('converts one-based range input and rejects empty documents', () => {
    expect(selectionRangeFromOneBased(2, 8, 6)).toEqual({ start: 1, end: 6 })
    expect(selectionRangeFromOneBased(1, 1, 0)).toBeNull()
  })

  it('preserves circular direction while normalizing linear spans', () => {
    expect(directionalSelectionSpan(8, 3, 'circular')).toEqual({ start: 8, end: 3 })
    expect(directionalSelectionSpan(8, 3, 'linear')).toEqual({ start: 3, end: 8 })
  })

  it('plans caret deletion without crossing sequence boundaries', () => {
    expect(planCaretDeletion(4, 10, true)).toEqual({ start: 3, end: 4, nextRange: { start: 3, end: 3 } })
    expect(planCaretDeletion(10, 10, false)).toBeNull()
  })

  it('transforms wrapped case selections and replaces sequence ranges', () => {
    expect(transformSequenceCase('aBcDeF', { start: 4, end: 2 }, true)).toBe('ABcDEF')
    expect(replaceSequenceRange('ABCDEFG', 2, 5, 'xy')).toBe('ABxyFG')
  })

  it('inverts duplex and sticky ranges around a circular template', () => {
    expect(invertSelectionRange({ start: 8, end: 3 }, 10)).toEqual({ start: 3, end: 8 })
    expect(invertStrandPairSelection({
      forward: { start: 8, end: 3 },
      reverse: { start: 7, end: 2 },
    }, 10)).toEqual({
      forward: { start: 3, end: 8 },
      reverse: { start: 2, end: 7 },
    })
  })

  it('computes undo and redo stack transitions from a current snapshot', () => {
    expect(undoTransition([1, 2], [3], 4)).toEqual({ snapshot: 2, nextUndo: [1], nextRedo: [3, 4] })
    expect(redoTransition([1], [2, 3], 4)).toEqual({ snapshot: 3, nextUndo: [1, 4], nextRedo: [2] })
    expect(undoTransition([], [], 1)).toBeNull()
  })
})
