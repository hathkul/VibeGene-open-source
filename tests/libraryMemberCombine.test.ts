import { describe, expect, it } from 'vitest'
import {
  matchLibraryReadName,
  matchLibraryReadPattern,
  proposeLibraryMemberCombineGroups,
} from '../src/domain/libraryMemberCombine'
import { nestLibraryMembersAsClone } from '../src/domain/libraryMemberReads'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'

describe('libraryMemberCombine', () => {
  it('matches convention parts and ignores irrelevant suffixes', () => {
    expect(
      matchLibraryReadName('1A1_dir_B01.ab1', {
        convention: '<unique_name>_<tag>_<irrelevant>',
        tags: ['dir', 'rev'],
        uniqueNameLength: 3,
      }),
    ).toEqual({ uniqueName: '1A1', slot: 0, tag: 'dir' })

    expect(
      matchLibraryReadName('1A1_rev_C99.ab1', {
        convention: '<unique_name>_<tag>_<irrelevant>',
        tags: ['dir', 'rev'],
        uniqueNameLength: 3,
      }),
    ).toEqual({ uniqueName: '1A1', slot: 1, tag: 'rev' })
  })

  it('supports tag before unique name and flexible unique length', () => {
    expect(
      matchLibraryReadName('dir-Clone12-wellA.ab1', {
        convention: '<tag>-<unique_name>-<irrelevant>',
        tags: ['dir', 'rev'],
      }),
    ).toEqual({ uniqueName: 'Clone12', slot: 0, tag: 'dir' })
  })

  it('groups traces that share unique_name even when irrelevant parts differ', () => {
    const members = [
      traceRecordFromSequence('ATGCATGCATAA', '1A1_dir_B01.ab1'),
      traceRecordFromSequence('ATGCATGCATAG', '1A1_rev_C02.ab1'),
      traceRecordFromSequence('GGGGCCCCAAAA', '1A3_dir_X.ab1'),
      traceRecordFromSequence('GGGGCCCCAAAT', '1A3_rev_Y.ab1'),
      traceRecordFromSequence('TTTTTTTTTTTT', 'orphan_dir_Z.ab1'),
    ]
    const groups = proposeLibraryMemberCombineGroups(members, {
      maxReads: 2,
      patterns: ['dir', 'rev'],
      convention: '<unique_name>_<tag>_<irrelevant>',
      uniqueNameLength: 3,
    })
    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.stem).sort()).toEqual(['1A1', '1A3'])
    expect(groups[0]!.fileNames.some((name) => name.includes('B01'))).toBe(true)
    expect(groups[0]!.fileNames.some((name) => name.includes('C02'))).toBe(true)
  })

  it('keeps legacy strip-tag matching for matchLibraryReadPattern', () => {
    expect(matchLibraryReadPattern('1A1_dir_B01.ab1', ['dir', 'rev'])).toEqual({
      stem: '1A1_B01',
      slot: 0,
    })
  })

  it('skips members that already have nested reads', () => {
    const a = traceRecordFromSequence('ATGCATGCATAA', '1A1_dir_B01.ab1')
    const b = traceRecordFromSequence('ATGCATGCATAG', '1A1_rev_C02.ab1')
    const nested = nestLibraryMembersAsClone([a, b], [a.id, b.id], { keepMemberId: a.id })
    const extra = traceRecordFromSequence('GGGG', '1A3_dir_X.ab1')
    const groups = proposeLibraryMemberCombineGroups([...nested, extra], {
      maxReads: 2,
      patterns: ['dir', 'rev'],
      convention: '<unique_name>_<tag>_<irrelevant>',
      uniqueNameLength: 3,
    })
    expect(groups).toHaveLength(0)
  })
})
