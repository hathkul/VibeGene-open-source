import { describe, expect, it } from 'vitest'
import {
  hydrateLibraryMemberPrimersOntoTraces,
  packLibraryMemberPrimers,
  projectPrimerOntoLibraryMembers,
  removePrimerFromLibraryMembers,
} from '../src/domain/libraryMemberPrimers'
import { withPackedLibraryMemberFeatures } from '../src/domain/libraryMemberFeatures'
import { createDnaLibraryFromMembers } from '../src/domain/dnaLibrary'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'
import type { Primer } from '../src/domain/types'

function primer(id: string, sequence = 'ATGC'): Primer {
  return {
    id,
    name: id,
    sequence,
    color: '#7c3aed',
    description: '',
  }
}

describe('libraryMemberPrimers', () => {
  it('packs and hydrates member primers for persistence', () => {
    const member = {
      ...traceRecordFromSequence('ATGCATGC', 'read.seq'),
      primers: [primer('p1')],
    }
    const { record } = createDnaLibraryFromMembers([member], { name: 'Lib' })
    const packed = withPackedLibraryMemberFeatures(record, [member])
    expect(packLibraryMemberPrimers([member])).toHaveLength(1)
    expect(packed.dna?.libraryMemberPrimers?.[0]?.primers[0]?.id).toBe('p1')

    const bare = { ...member, primers: undefined }
    const hydrated = hydrateLibraryMemberPrimersOntoTraces(packed, [bare])
    expect(hydrated[0]?.primers?.[0]?.id).toBe('p1')
  })

  it('projects consensus primers onto aligned members even without bindings', () => {
    const a = traceRecordFromSequence('ATGCATGC', 'a.seq')
    const b = traceRecordFromSequence('ATGCATGC', 'b.seq')
    const { members } = createDnaLibraryFromMembers([a, b], { name: 'Lib' })
    const consensusPrimer = primer('oligo1', 'ATGC')
    const next = projectPrimerOntoLibraryMembers(consensusPrimer, members)
    expect(next.every((member) => member.primers?.some((entry) => entry.id === 'oligo1'))).toBe(true)
    expect(next[0]!.primers![0]!.sequence).toBe('ATGC')
  })

  it('anneals onto only members that hybridize when hybridization is provided', async () => {
    const { defaultPrimerHybridizationParams } = await import('../src/domain/primerHybridization')
    const hit = traceRecordFromSequence(`${'N'.repeat(20)}GAATTCGCGGCCGC${'N'.repeat(20)}`, 'hit.seq')
    const miss = traceRecordFromSequence(`${'N'.repeat(40)}`, 'miss.seq')
    const { members } = createDnaLibraryFromMembers([hit, miss], { name: 'Lib' })
    const oligo = primer('eco', 'GAATTCGCGGCCGC')
    const next = projectPrimerOntoLibraryMembers(oligo, members, {
      hybridization: defaultPrimerHybridizationParams,
    })
    expect(next[0]!.primers?.some((entry) => entry.id === 'eco')).toBe(true)
    expect(next[0]!.primers![0]!.bindings?.length).toBeGreaterThan(0)
    expect(next[1]!.primers?.some((entry) => entry.id === 'eco')).toBeFalsy()
  })

  it('removes projected primers from members', () => {
    const member = {
      ...traceRecordFromSequence('ATGC', 'a.seq'),
      primers: [primer('oligo1'), primer('local', 'GCAT')],
    }
    const next = removePrimerFromLibraryMembers('oligo1', [member])
    expect(next[0]!.primers?.map((entry) => entry.id)).toEqual(['local'])
  })
})
