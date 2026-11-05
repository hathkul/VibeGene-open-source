import { describe, expect, it } from 'vitest'
import { selectPrimerRowCommand, shouldUseSelectedPrimerRange } from './usePrimerManagementController'

describe('primer management selection orchestration', () => {
  it('uses a range only when the DNA sequence owns the selection', () => {
    const range = { start: 12, end: 24 }
    expect(shouldUseSelectedPrimerRange(range, 'dna', null)).toBe(true)
    expect(shouldUseSelectedPrimerRange(range, 'feature', null)).toBe(false)
    expect(shouldUseSelectedPrimerRange(range, 'primer', null)).toBe(false)
    expect(shouldUseSelectedPrimerRange(range, 'dna', { forward: range, reverse: range })).toBe(false)
    expect(shouldUseSelectedPrimerRange(null, 'dna', null)).toBe(false)
  })

  it('selects a contiguous shift range within one member', () => {
    expect(selectPrimerRowCommand({
      rowIds: ['a', 'b', 'c', 'd'],
      primerId: 'd',
      memberId: 'member-1',
      anchorId: 'b',
      selectedIds: ['b'],
      selectedMemberId: 'member-1',
      selectedPrimerId: 'b',
      shiftKey: true,
      additive: false,
    })).toMatchObject({
      kind: 'select',
      selectedIds: ['b', 'c', 'd'],
      focusedId: 'd',
      status: 'Selected 3 primers.',
    })
  })

  it('clears the last additive selection without selecting another member', () => {
    expect(selectPrimerRowCommand({
      rowIds: ['a', 'b'],
      primerId: 'b',
      memberId: 'member-1',
      anchorId: 'a',
      selectedIds: ['b'],
      selectedMemberId: 'member-1',
      selectedPrimerId: 'b',
      shiftKey: false,
      additive: true,
    })).toMatchObject({
      kind: 'clear',
      selectedIds: [],
      status: 'Cleared primer selection.',
    })
  })

  it('keeps focus on a remaining selection after additive removal', () => {
    expect(selectPrimerRowCommand({
      rowIds: ['a', 'b', 'c'],
      primerId: 'b',
      memberId: 'member-1',
      anchorId: 'a',
      selectedIds: ['a', 'b'],
      selectedMemberId: 'member-1',
      selectedPrimerId: 'b',
      shiftKey: false,
      additive: true,
    })).toMatchObject({
      kind: 'select',
      selectedIds: ['a'],
      focusedId: 'a',
    })
  })

  it('resets the range anchor when additive selection moves to another member', () => {
    expect(selectPrimerRowCommand({
      rowIds: ['a', 'b'],
      primerId: 'b',
      memberId: 'member-2',
      anchorId: 'a',
      selectedIds: ['a'],
      selectedMemberId: 'member-1',
      selectedPrimerId: 'a',
      shiftKey: false,
      additive: true,
    })).toMatchObject({
      kind: 'select',
      selectedIds: ['b'],
      anchorId: 'b',
      memberId: 'member-2',
    })
  })
})
