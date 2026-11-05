import { describe, expect, it } from 'vitest'
import {
  dnaComparisonSourcesFromLibraryMembers,
  mergeLibraryMembersIntoDnaComparisonSources,
} from '../src/domain/dnaComparisonImport'

describe('library members in DNA comparative sources', () => {
  it('maps members to comparison sources with the same ids', () => {
    const sources = dnaComparisonSourcesFromLibraryMembers([
      { id: 'm1', fileName: 'a.seq', sequence: 'ATGC', enabled: true },
      { id: 'm2', fileName: 'b.seq', sequence: '', enabled: true },
      { id: 'm3', fileName: 'c.seq', sequence: 'GG', enabled: false, parseError: 'bad' },
      { id: 'm4', fileName: 'd.seq', sequence: 'TTAA', enabled: false },
    ])
    expect(sources).toEqual([
      { id: 'm1', name: 'a.seq', fileName: 'a.seq', sequence: 'ATGC', enabled: true },
      { id: 'm4', name: 'd.seq', fileName: 'd.seq', sequence: 'TTAA', enabled: false },
    ])
  })

  it('puts members before homologs and drops homologs that reuse member ids', () => {
    const merged = mergeLibraryMembersIntoDnaComparisonSources(
      [{ id: 'm1', fileName: 'member.seq', sequence: 'ATGC', enabled: true }],
      [
        { id: 'm1', name: 'stale homolog', sequence: 'AAAA', enabled: true },
        { id: 'h1', name: 'homolog', sequence: 'CCCC', enabled: true },
      ],
    )
    expect(merged.map((source) => source.id)).toEqual(['m1', 'h1'])
    expect(merged[0]?.name).toBe('member.seq')
  })
})
