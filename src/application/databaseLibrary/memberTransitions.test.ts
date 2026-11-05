import { describe, expect, it } from 'vitest'
import {
  dedupeFocusedMemberReplacement,
  dedupeReferenceReplacement,
  planLibraryMemberCommit,
  referenceSelectionState,
  selectLibraryMember,
  selectedLibraryMemberIdsForDelete,
} from './memberTransitions'
import { convertConstructToLibrary } from '../../domain/dnaLibrary'
import { labPlasmid } from '../../domain/fixtures'
import { traceRecordFromSequence } from '../../domain/sequenceTraceFactory'

describe('database library member transitions', () => {
  it('selects ranges and additive toggles deterministically', () => {
    expect(selectLibraryMember({
      rowIds: ['a', 'b', 'c', 'd'],
      selectedIds: ['a'],
      anchorId: 'a',
      memberId: 'c',
      shiftKey: true,
      additive: false,
    })).toEqual({
      selectedIds: ['a', 'b', 'c'],
      anchorId: 'c',
      focusedId: 'c',
      message: 'Selected 3 members.',
    })
    expect(selectLibraryMember({
      rowIds: ['a', 'b'],
      selectedIds: ['a', 'b'],
      anchorId: 'b',
      memberId: 'b',
      shiftKey: false,
      additive: true,
    })).toMatchObject({ selectedIds: ['a'], focusedId: 'a' })
  })

  it('falls back from selected members to the focused member for delete', () => {
    expect(selectedLibraryMemberIdsForDelete([], 'member-1')).toEqual(['member-1'])
    expect(selectedLibraryMemberIdsForDelete(['member-1'], 'member-2')).toEqual(['member-1'])
    expect(selectedLibraryMemberIdsForDelete([], null)).toEqual([])
  })

  it('keeps reference and focus on the surviving deduplicated member', () => {
    const groups = [{ keepMemberId: 'keep', memberIds: ['ref', 'keep'], suggestedName: 'merged' }]
    const removed = new Set(['ref'])
    expect(dedupeReferenceReplacement(groups, removed, 'ref')).toBe('keep')
    expect(dedupeFocusedMemberReplacement(groups, 'ref', new Set(['keep']))).toBe('keep')
    expect(referenceSelectionState('member-1')).toEqual({
      referenceId: 'member-1',
      consensusEnabled: false,
    })
    expect(referenceSelectionState(null)).toEqual({
      referenceId: null,
      consensusEnabled: true,
    })
  })

  it('keeps multi-member libraries as members and deterministically collapses zero-or-one-member libraries', () => {
    const peer = traceRecordFromSequence(labPlasmid.sequence, 'peer', { id: 'peer' })
    const { record: library, members } = convertConstructToLibrary(labPlasmid, [peer])

    expect(planLibraryMemberCommit(library, members)).toEqual({ kind: 'members', members })

    const collapsed = planLibraryMemberCommit(library, [members[0]!])
    expect(collapsed.kind).toBe('collapse')
    if (collapsed.kind === 'collapse') {
      expect(collapsed.record.dna?.documentRole).toBeUndefined()
      expect(collapsed.record.sequence).toBe(members[0]!.sequence)
    }

    expect(planLibraryMemberCommit(library, []).kind).toBe('collapse')
  })
})
