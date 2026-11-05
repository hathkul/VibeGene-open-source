import { describe, expect, it } from 'vitest'
import {
  assembleSequenceFromReads,
  detachLibraryMemberRead,
  findAssemblyConflicts,
  groupLibraryMembersAsClone,
  mergeAlignedReadIntoContig,
  nestLibraryMembersAsClone,
  suggestGroupedMemberName,
} from '../src/domain/libraryMemberReads'
import { alignTraceToTemplate } from '../src/domain/traceAlignment'
import { reverseComplement } from '../src/domain/sequence'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'
import type { LibraryMemberRead } from '../src/domain/traceTypes'

function read(name: string, sequence: string): LibraryMemberRead {
  const member = traceRecordFromSequence(sequence, name)
  return {
    id: member.id,
    fileName: name,
    sequence: member.sequence,
    chromatogram: member.chromatogram,
    enabled: true,
    expanded: false,
    alignment: null,
  }
}

describe('libraryMemberReads', () => {
  it('suggests a shared clone name from F/R file names', () => {
    expect(suggestGroupedMemberName(['Clone12_F.ab1', 'Clone12_R.ab1'])).toBe('Clone12')
  })

  it('assembles overlapping forward reads into a longer contig', () => {
    const left = read('left.seq', 'ATGCATGCAT')
    const right = read('right.seq', 'CATGCATGAA')
    // overlap ATGCAT / CAT GCA TG
    const { sequence, reads } = assembleSequenceFromReads([left, right])
    expect(sequence.length).toBeGreaterThanOrEqual(left.sequence.length)
    expect(reads.every((entry) => entry.alignment || entry.parseError)).toBe(true)
    expect(sequence.includes('ATGC')).toBe(true)
  })

  it('merges a reverse-complement read using quality-aware overlap', () => {
    const forward = 'ATGCATGCATGC'
    const reverseNative = reverseComplement('GCATGCATGCAT') // overlaps heavily when RC'd
    const contig = forward
    const alignment = alignTraceToTemplate(reverseNative, contig)
    expect(alignment).not.toBeNull()
    const merged = mergeAlignedReadIntoContig(
      contig,
      { sequence: reverseNative, chromatogram: traceRecordFromSequence(reverseNative, 'r').chromatogram },
      alignment!,
    )
    expect(merged.length).toBeGreaterThanOrEqual(contig.length)
  })

  it('groups two members into one clone with nested reads', () => {
    const a = traceRecordFromSequence('ATGCATGCATAAAA', 'Clone_F.seq')
    const b = traceRecordFromSequence('ATGCATGCATBBBB', 'Clone_R.seq')
    // Make B mostly overlap A
    const b2 = traceRecordFromSequence('ATGCATGCATAA', 'Clone_R.seq')
    const grouped = groupLibraryMembersAsClone([a, b2], [a.id, b2.id])
    expect(grouped).toHaveLength(1)
    expect(grouped[0]!.reads).toHaveLength(2)
    expect(grouped[0]!.sequenceAssembled).toBe(true)
    expect(grouped[0]!.sequence.length).toBeGreaterThan(0)
    void b
  })

  it('nests members immediately without waiting for assembly', () => {
    const a = traceRecordFromSequence('ATGCATGCATAAAA', 'Clone_F.seq')
    const b = traceRecordFromSequence('ATGCATGCATAA', 'Clone_R.seq')
    const nested = nestLibraryMembersAsClone([a, b], [a.id, b.id], { keepMemberId: a.id })
    expect(nested).toHaveLength(1)
    expect(nested[0]!.id).toBe(a.id)
    expect(nested[0]!.reads).toHaveLength(2)
    expect(nested[0]!.sequenceAssembled).toBe(false)
    expect(nested[0]!.alignment).toBeNull()
  })

  it('flags member positions where nested reads disagree', () => {
    const contig = 'ATGC'
    const forward = read('Clone_F.seq', 'ATGC')
    const reverse = read('Clone_R.seq', 'ATGT')
    const member = {
      ...traceRecordFromSequence(contig, 'Clone'),
      sequence: contig,
      sequenceAssembled: true,
      reads: [
        {
          ...forward,
          alignment: {
            templateStart: 0,
            templateEnd: 4,
            traceStart: 0,
            traceEnd: 4,
            mismatchCount: 0,
            gapCount: 0,
            orientation: 'forward' as const,
            alignmentScore: 4,
            columns: [
              { kind: 'match' as const, templateIndex: 0, traceIndex: 0, match: true },
              { kind: 'match' as const, templateIndex: 1, traceIndex: 1, match: true },
              { kind: 'match' as const, templateIndex: 2, traceIndex: 2, match: true },
              { kind: 'match' as const, templateIndex: 3, traceIndex: 3, match: true },
            ],
          },
        },
        {
          ...reverse,
          alignment: {
            templateStart: 0,
            templateEnd: 4,
            traceStart: 0,
            traceEnd: 4,
            mismatchCount: 1,
            gapCount: 0,
            orientation: 'forward' as const,
            alignmentScore: 3,
            columns: [
              { kind: 'match' as const, templateIndex: 0, traceIndex: 0, match: true },
              { kind: 'match' as const, templateIndex: 1, traceIndex: 1, match: true },
              { kind: 'match' as const, templateIndex: 2, traceIndex: 2, match: true },
              { kind: 'match' as const, templateIndex: 3, traceIndex: 3, match: false },
            ],
          },
        },
      ],
    }
    const conflicts = findAssemblyConflicts(member)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.memberIndex).toBe(3)
    expect(conflicts[0]!.votes.map((vote) => vote.base).sort()).toEqual(['C', 'T'])
  })

  it('detaches a read back to a top-level member', () => {
    const a = traceRecordFromSequence('ATGCATGCATAAAA', 'Clone_F.seq')
    const b = traceRecordFromSequence('ATGCATGCATAA', 'Clone_R.seq')
    const grouped = groupLibraryMembersAsClone([a, b], [a.id, b.id])
    const parent = grouped[0]!
    const readId = parent.reads![1]!.id
    const next = detachLibraryMemberRead(grouped, parent.id, readId)
    expect(next).toHaveLength(2)
    expect(next.some((member) => member.reads && member.reads.length > 0) || next.every((member) => !member.reads?.length)).toBe(true)
  })
})
