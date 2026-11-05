import { describe, expect, it } from 'vitest'
import {
  constructRecordFromLibraryMember,
  libraryMemberHeaderMeta,
  libraryMemberSequenceEntryFromRecord,
  sequenceRecordFromLibraryMember,
} from '../src/domain/libraryMemberRecord'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'

describe('libraryMemberRecord', () => {
  it('builds a linear DNA record from a library member', () => {
    const member = traceRecordFromSequence('ATGCATGC', 'read1.ab1')
    const record = sequenceRecordFromLibraryMember(member)
    expect(record.molecule).toBe('dna')
    expect(record.topology).toBe('linear')
    expect(record.sequence).toBe('ATGCATGC')
    expect(record.name).toBe('read1.ab1')
    expect(record.dnaEnds).toBeDefined()
  })

  it('includes stored member features on the browse record', () => {
    const member = {
      ...traceRecordFromSequence('ATGCATGC', 'read1.ab1'),
      features: [{
        id: 'f1',
        name: 'tag',
        type: 'misc_feature',
        color: '#64748b',
        locations: [{ start: 1, end: 4, strand: 'forward' as const }],
      }],
    }
    const record = sequenceRecordFromLibraryMember(member)
    expect(record.features).toHaveLength(1)
    expect(record.features[0]?.name).toBe('tag')
  })

  it('notes assembled multi-read members in meta', () => {
    const member = {
      ...traceRecordFromSequence('ATGC', 'clone'),
      sequenceAssembled: true,
      reads: [
        {
          id: 'r1',
          fileName: 'a.ab1',
          sequence: 'AT',
          chromatogram: traceRecordFromSequence('AT', 'a').chromatogram,
          enabled: true,
          expanded: false,
          alignment: null,
        },
        {
          id: 'r2',
          fileName: 'b.ab1',
          sequence: 'GC',
          chromatogram: traceRecordFromSequence('GC', 'b').chromatogram,
          enabled: true,
          expanded: false,
          alignment: null,
        },
      ],
    }
    expect(libraryMemberHeaderMeta(member)).toBe('4 bp · 2 reads · assembled')
  })

  it('opens a member as a standalone construct with a new id', () => {
    const member = {
      ...traceRecordFromSequence('ATGCATGC', 'clone.ab1'),
      features: [{
        id: 'f1',
        name: 'tag',
        type: 'misc_feature',
        color: '#64748b',
        locations: [{ start: 1, end: 4, strand: 'forward' as const }],
      }],
    }
    const record = constructRecordFromLibraryMember(member, { libraryName: 'VHH lib' })
    expect(record.id).not.toBe(member.id)
    expect(record.molecule).toBe('dna')
    expect(record.dna?.documentRole).not.toBe('library')
    expect(record.traceFiles).toBeUndefined()
    expect(record.features).toHaveLength(1)
    expect(record.operations[0]?.type).toBe('openLibraryMember')
    expect(record.operations[0]?.summary).toContain('clone.ab1')
    expect(record.operations[0]?.summary).toContain('VHH lib')
  })

  it('copies a Database DNA construct as a library-member sequence', () => {
    const entry = libraryMemberSequenceEntryFromRecord({
      id: 'plasmid-1',
      name: 'pDemo',
      sequence: 'ATGCATGC',
      molecule: 'dna',
      features: [{
        id: 'f1',
        name: 'tag',
        type: 'misc_feature',
        color: '#64748b',
        locations: [{ start: 1, end: 4, strand: 'forward' }],
      }],
      primers: [{
        id: 'p1',
        name: 'fwd',
        sequence: 'ATGC',
        color: '#2563eb',
      }],
    })
    expect(entry?.name).toBe('pDemo')
    expect(entry?.sequence).toBe('ATGCATGC')
    expect(entry?.features).toHaveLength(1)
    expect(entry?.features?.[0]?.id).not.toBe('f1')
    expect(entry?.primers).toHaveLength(1)
    expect(entry?.primers?.[0]?.id).not.toBe('p1')
  })

  it('skips proteins, libraries, and the open library itself', () => {
    expect(libraryMemberSequenceEntryFromRecord({
      id: 'prot-1',
      name: 'GFP',
      sequence: 'MSKGEEL',
      molecule: 'protein',
      features: [],
      primers: [],
    })).toBeNull()
    expect(libraryMemberSequenceEntryFromRecord({
      id: 'lib-1',
      name: 'VHH lib',
      sequence: 'ATGCATGC',
      molecule: 'dna',
      dna: { documentRole: 'library' },
      features: [],
      primers: [],
    })).toBeNull()
    expect(libraryMemberSequenceEntryFromRecord({
      id: 'plasmid-1',
      name: 'pDemo',
      sequence: 'ATGCATGC',
      molecule: 'dna',
      features: [],
      primers: [],
    }, { skipRecordId: 'plasmid-1' })).toBeNull()
  })
})
