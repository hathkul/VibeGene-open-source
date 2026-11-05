import { describe, expect, it } from 'vitest'
import {
  buildLibraryMemberTabRow,
  reorderLibraryMembersById,
  sortLibraryMemberTabRows,
} from '../src/domain/libraryMemberTab'
import { capabilitiesForRecord, isWorkspaceTabAvailable } from '../src/domain/moleculeCapabilities'
import { emptyChromatogramForSequence } from '../src/domain/sequenceTraceFactory'
import type { TraceFileRecord } from '../src/domain/traceTypes'

function member(partial: Partial<TraceFileRecord> & Pick<TraceFileRecord, 'id' | 'fileName' | 'sequence'>): TraceFileRecord {
  return {
    chromatogram: emptyChromatogramForSequence(partial.sequence),
    enabled: true,
    expanded: false,
    showAnnotations: false,
    alignment: null,
    ...partial,
  }
}

describe('library Members tab helpers', () => {
  it('exposes Members only for DNA libraries', () => {
    expect(isWorkspaceTabAvailable('Members', 'dna')).toBe(false)
    expect(capabilitiesForRecord({ molecule: 'dna' }).workspaceTabs).not.toContain('Members')
    expect(
      capabilitiesForRecord({ molecule: 'dna', dna: { documentRole: 'library' } }).workspaceTabs,
    ).toContain('Members')
    expect(isWorkspaceTabAvailable('Members', { molecule: 'dna', dna: { documentRole: 'library' } })).toBe(true)
  })

  it('builds and sorts member rows', () => {
    const rows = sortLibraryMemberTabRows(
      [
        buildLibraryMemberTabRow(member({
          id: 'b',
          fileName: 'b.seq',
          sequence: 'AT',
          alignment: {
            templateStart: 0,
            templateEnd: 2,
            traceStart: 0,
            traceEnd: 2,
            mismatchCount: 1,
            gapCount: 0,
            orientation: 'reverse',
            alignmentScore: 10,
            columns: [],
          },
        })),
        buildLibraryMemberTabRow(member({ id: 'a', fileName: 'a.seq', sequence: 'ATGCGG' })),
      ],
      'length',
      'desc',
    )
    expect(rows.map((row) => row.member.id)).toEqual(['a', 'b'])
    expect(rows[1]?.orientation).toBe('reverse')
    expect(rows[1]?.mismatchCount).toBe(1)
  })

  it('keeps array order for manual sort and reorders by id', () => {
    const rows = [
      buildLibraryMemberTabRow(member({ id: 'b', fileName: 'b.seq', sequence: 'AT' })),
      buildLibraryMemberTabRow(member({ id: 'a', fileName: 'a.seq', sequence: 'ATGCGG' })),
    ]
    expect(sortLibraryMemberTabRows(rows, 'manual', 'asc').map((row) => row.member.id)).toEqual(['b', 'a'])
    const members = rows.map((row) => row.member)
    expect(reorderLibraryMembersById(members, 'a', 'b').map((item) => item.id)).toEqual(['a', 'b'])
    expect(reorderLibraryMembersById(members, 'b', null).map((item) => item.id)).toEqual(['a', 'b'])
  })
})
