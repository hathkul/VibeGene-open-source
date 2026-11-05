import { describe, expect, it } from 'vitest'
import { detectCommonPrimers } from '../src/domain/commonPrimers'
import { entryMatchesBuiltInGroup, type BuiltInPlasmidEntry } from '../src/domain/builtInPlasmids'
import {
  COMMON_PRIMERS_SOURCE_ID,
  collectTagsAmongCommonPrimers,
  commonPrimersToHits,
  dedupePrimerHits,
  filterPrimersByTag,
  primerHitsFromRecord,
  primerIdentityKey,
  primerRowIsCommon,
} from '../src/storage/databasePrimers'
import type { Primer } from '../src/domain/types'

function primer(name: string, sequence: string, id = name): Primer {
  return { id, name, sequence, color: '#7c3aed' }
}

const duplex = 'GACCACCATGTCAACGTTGG'

describe('detectCommonPrimers', () => {
  const template = `${'N'.repeat(20)}${duplex}${'N'.repeat(20)}`

  it('keeps library oligos that hybridize and flags ones already on the construct', () => {
    const matches = detectCommonPrimers(
      template,
      [
        { name: 'T7-F', sequence: duplex },
        { name: 'noise', sequence: 'AAAAAAAAAAAAAAAAAAAA' },
      ],
      [primer('T7-F', duplex)],
    )
    expect(matches.map((match) => match.primer.name)).toEqual(['T7-F'])
    expect(matches[0]!.alreadyPresent).toBe(true)
  })

  it('marks a hybridizing library oligo as new when the construct does not have it', () => {
    const matches = detectCommonPrimers(template, [{ name: 'T7-F', sequence: duplex }], [])
    expect(matches).toHaveLength(1)
    expect(matches[0]!.alreadyPresent).toBe(false)
  })

  it('lists only tags present on common primers and can filter by tag', () => {
    const library = [
      { name: 'T7-F', sequence: duplex },
      { name: 'M13', sequence: 'GTTTTCCCAGTCACGAC' },
    ]
    const tagMap = new Map([
      [primerIdentityKey('T7-F', duplex), ['sequencing', 'T7']],
      [primerIdentityKey('M13', 'GTTTTCCCAGTCACGAC'), ['sequencing']],
      [primerIdentityKey('other', 'AAAA'), ['ignored']],
    ])
    expect(collectTagsAmongCommonPrimers(library, tagMap)).toEqual(['sequencing', 'T7'])
    expect(filterPrimersByTag(library, tagMap, 'T7').map((primer) => primer.name)).toEqual(['T7-F'])
    expect(filterPrimersByTag(library, tagMap, 'sequencing').map((primer) => primer.name)).toEqual([
      'T7-F',
      'M13',
    ])
  })
})

describe('common primer database rows', () => {
  it('tags common-library hits so they stay distinct from construct files', () => {
    const hits = commonPrimersToHits([
      {
        id: 'c1',
        name: 'T7-F',
        sequence: 'ATGC',
        color: '#7c3aed',
        description: '',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    expect(hits).toHaveLength(1)
    expect(hits[0]!.projectId).toBe(COMMON_PRIMERS_SOURCE_ID)
    expect(hits[0]!.commonId).toBe('c1')
    expect(hits[0]!.key).toBe(primerIdentityKey('T7-F', 'ATGC'))
  })

  it('merges a common copy with the same oligo on a construct', () => {
    const construct = primerHitsFromRecord([primer('T7-F', 'ATGC')], {
      projectId: 'p1',
      projectName: 'pET',
      folderId: 'folder-1',
    })
    const common = commonPrimersToHits([
      {
        id: 'c1',
        name: 'T7-F',
        sequence: 'atgc',
        color: '#7c3aed',
        description: '',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    const rows = dedupePrimerHits([...construct, ...common])
    expect(rows).toHaveLength(1)
    expect(primerRowIsCommon(rows[0]!)).toBe(true)
    expect(rows[0]!.sources.map((source) => source.projectId).sort()).toEqual([COMMON_PRIMERS_SOURCE_ID, 'p1'])
  })
})

describe('built-in plasmid groups', () => {
  const donor: BuiltInPlasmidEntry = {
    id: 'donor:pDONR221.dna',
    kind: 'gateway-donor',
    group: 'gateway',
    label: 'pDONR221',
    length: 4761,
    kindLabel: 'Gateway donor',
  }

  it('nests donor vectors under Gateway and Built-in', () => {
    expect(entryMatchesBuiltInGroup(donor, 'builtin')).toBe(true)
    expect(entryMatchesBuiltInGroup(donor, 'gateway')).toBe(true)
    expect(entryMatchesBuiltInGroup(donor, 'gateway-donor')).toBe(true)
    expect(entryMatchesBuiltInGroup(donor, 'gateway-destination')).toBe(false)
    expect(entryMatchesBuiltInGroup(donor, 'ta')).toBe(false)
  })
})
