import { describe, expect, it } from 'vitest'
import { alignTraceToTemplate } from '../../domain/traceAlignment'
import { traceRecordFromSequence } from '../../domain/sequenceTraceFactory'
import {
  computeMemberSequenceEdit,
  planReferenceReplacementFromTrace,
  planSequenceEditProfilerDetail,
  resolveMemberSequenceEditContext,
} from './sequenceEditCommitPlan'

describe('sequenceEditCommitPlan', () => {
  it('formats profiler detail for insertions and deletions', () => {
    expect(planSequenceEditProfilerDetail({ start: 2, end: 2, insertedLength: 3 })).toBe('+3 bp @ 2')
    expect(planSequenceEditProfilerDetail({ start: 4, end: 7, insertedLength: 0 })).toBe('-3 bp @ 4')
  })

  it('plans reference replacement from trace with sanitized sequence and caret', () => {
    const plan = planReferenceReplacementFromTrace({
      consensusSequence: 'ATGCATGC',
      templateStart: 2,
      templateEnd: 4,
      replacement: 'aa',
    })
    expect(plan).toEqual({
      kind: 'apply',
      nextSequence: 'ATaaATGC',
      nextRange: { start: 4, end: 4 },
      replacement: { start: 2, end: 4, insertedLength: 2 },
      status: 'Replaced 2 bp with trace sequence (2 bp).',
    })
    expect(planReferenceReplacementFromTrace({
      consensusSequence: 'ATGC',
      templateStart: 0,
      templateEnd: 1,
      replacement: '!!!',
    })).toEqual({ kind: 'noop' })
  })

  it('resolves member edit mode for browse-native vs alignment template edits', () => {
    const member = traceRecordFromSequence('ATGCATGC', 'read.ab1')
    const base = {
      selectedAlignmentTraceId: member.id,
      traceFiles: [member],
    }
    expect(resolveMemberSequenceEditContext({ ...base, alignmentsVisible: false, recordIsDnaLibrary: false }))
      .toEqual({ kind: 'unavailable' })
    expect(resolveMemberSequenceEditContext({ ...base, alignmentsVisible: false, recordIsDnaLibrary: true }))
      .toMatchObject({ kind: 'ready', mode: 'native' })
    expect(resolveMemberSequenceEditContext({ ...base, alignmentsVisible: true, recordIsDnaLibrary: true }))
      .toMatchObject({ kind: 'ready', mode: 'template' })
  })

  it('computes template-member edits through domain helpers', () => {
    const consensus = 'ATGCATGC'
    const member = {
      ...traceRecordFromSequence(consensus, 'read.ab1'),
      alignment: alignTraceToTemplate(consensus, consensus),
    }
    const context = {
      kind: 'ready' as const,
      member,
      mode: 'template' as const,
    }
    const edited = computeMemberSequenceEdit(
      context,
      { start: 2, end: 4, insertedLength: 2 },
      'AA',
      { sequence: consensus, topology: 'linear' },
    )
    expect(edited.sequence).toBe('ATAAATGC')
  })
})
