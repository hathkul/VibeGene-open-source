import { describe, expect, it } from 'vitest'
import {
  buildAgaroseGelLibraryPlan,
  lastOccupiedGelSampleLaneIndex,
  listAgaroseGelMemberSources,
  padAgaroseGelEnzymeSlots,
  sequenceRecordForAgaroseGel,
} from '../src/domain/agaroseGelLibrary'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { createDnaLibraryFromMembers } from '../src/domain/dnaLibrary'
import { createId } from '../src/domain/sequence'
import type { TraceFileRecord } from '../src/domain/traceTypes'

function makeMember(fileName: string, sequence: string): TraceFileRecord {
  return {
    id: createId('member'),
    fileName,
    sequence,
    chromatogram: {
      aTrace: [],
      tTrace: [],
      gTrace: [],
      cTrace: [],
      basePos: [],
      baseCalls: [],
    },
    enabled: true,
    expanded: false,
    showAnnotations: true,
    alignment: null,
  }
}

describe('listAgaroseGelMemberSources', () => {
  it('returns one source per valid library member', () => {
    const { record, members } = createDnaLibraryFromMembers(
      [makeMember('A.seq', 'AAAA'), makeMember('B.seq', 'CCCC')],
      { name: 'Lib' },
    )
    const library = { ...record, traceFiles: members }
    const sources = listAgaroseGelMemberSources(library)
    expect(sources).toHaveLength(2)
    expect(sources.every((source) => source.record.sequence.length > 0)).toBe(true)
  })

  it('returns empty for non-library constructs', () => {
    const timestamp = new Date().toISOString()
    expect(
      listAgaroseGelMemberSources({
        id: 'plain',
        name: 'Plain',
        description: '',
        molecule: 'dna',
        topology: 'linear',
        sequence: 'ATGC',
        features: [],
        primers: [],
        history: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ).toEqual([])
  })
})

describe('buildAgaroseGelLibraryPlan', () => {
  it('prefills one lane per library member when nothing is selected', () => {
    const { record, members } = createDnaLibraryFromMembers(
      [makeMember('A.seq', 'AAAA'), makeMember('B.seq', 'CCCC'), makeMember('C.seq', 'GGGG')],
      { name: 'Lib' },
    )
    const plan = buildAgaroseGelLibraryPlan({ record, members })
    expect(plan.initialSamples).toHaveLength(3)
    expect(plan.initialSamples.map((sample) => sample.record.sequence)).toEqual([
      'AAAA',
      'CCCC',
      'GGGG',
    ])
    expect(plan.memberSources).toHaveLength(3)
  })

  it('prefills only selected library members when a selection exists', () => {
    const { record, members } = createDnaLibraryFromMembers(
      [makeMember('A.seq', 'AAAA'), makeMember('B.seq', 'CCCC'), makeMember('C.seq', 'GGGG')],
      { name: 'Lib' },
    )
    const plan = buildAgaroseGelLibraryPlan({
      record,
      members,
      selectedMemberIds: [members[1]!.id],
    })
    expect(plan.initialSamples).toHaveLength(1)
    expect(plan.initialSamples[0]?.record.sequence).toBe('CCCC')
  })
})

describe('sequenceRecordForAgaroseGel', () => {
  it('drops history trees and native packets so gel payloads can serialize', () => {
    const timestamp = new Date().toISOString()
    const slim = sequenceRecordForAgaroseGel({
      id: 'product',
      name: 'Product',
      description: '',
      molecule: 'dna',
      topology: 'circular',
      sequence: 'ATGCATGC',
      features: [],
      primers: [],
      operations: [],
      history: {
        id: '1',
        name: 'Product',
        seqLen: 8,
        circular: true,
        operation: 'insertFragments',
        resurrectable: false,
        hideHistory: false,
        oligos: [],
        regeneratedSites: [],
        inputSummaries: [],
        features: [],
        sequence: 'ATGCATGC',
        children: [],
      },
      snapGeneNativeHistory: {
        nodePackets: [{ nodeId: '1', payload: new Uint8Array(2048).fill(7) }],
      },
      construct: defaultConstructProperties,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(slim.sequence).toBe('ATGCATGC')
    expect(slim.history).toBeUndefined()
    expect(slim.snapGeneNativeHistory).toBeUndefined()
    const json = JSON.stringify({ currentRecord: slim, initialSamples: [{ label: slim.name, record: slim }] })
    expect(json).not.toContain('nodePackets')
    expect(json).not.toContain('"history"')
    expect(json.length).toBeLessThan(2000)
  })
})

describe('padAgaroseGelEnzymeSlots', () => {
  it('pads named enzymes into four cut slots', () => {
    expect(padAgaroseGelEnzymeSlots(['EcoRI', 'BamHI'])).toEqual(['EcoRI', 'BamHI', '', ''])
    expect(padAgaroseGelEnzymeSlots(undefined)).toEqual(['', '', '', ''])
    expect(padAgaroseGelEnzymeSlots(['A', 'B', 'C', 'D', 'E'])).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('lastOccupiedGelSampleLaneIndex', () => {
  it('returns 0 when only MW or empty samples exist', () => {
    expect(lastOccupiedGelSampleLaneIndex([{ kind: 'mw' }, { kind: 'sample' }])).toBe(0)
  })

  it('returns the last sample index that has a record', () => {
    expect(
      lastOccupiedGelSampleLaneIndex([
        { kind: 'mw' },
        { kind: 'sample', record: { id: 'a' } },
        { kind: 'sample' },
        { kind: 'sample', record: { id: 'b' } },
        { kind: 'sample' },
      ]),
    ).toBe(3)
  })
})
