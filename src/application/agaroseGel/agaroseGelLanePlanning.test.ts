import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../../domain/constructProperties'
import { reverseComplement } from '../../domain/sequence'
import type { SequenceRecord } from '../../domain/types'
import type { MwLadder } from '../../domain/mwLadders'
import {
  buildGelBandPrintHtml,
  buildGelFragmentListText,
  createEmptyGelSample,
  createInitialGelLanes,
  listFirstPcrPrimerOptions,
  listGelLaneBands,
  listGelLaneFragments,
  listSecondPcrPrimerOptions,
  sampleGelLaneLabel,
  type GelSampleLane,
} from './agaroseGelLanePlanning'

function dnaRecord(name: string, sequence = 'GAATTCAAAAAAGGATCC', topology: SequenceRecord['topology'] = 'linear'): SequenceRecord {
  return {
    id: `record-${name}`,
    name,
    description: '',
    molecule: 'dna',
    topology,
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const ladder: MwLadder = {
  id: 'fixture-ladder',
  name: 'Fixture ladder',
  supplier: 'Fixture',
  preferredUnits: 'bp',
  concentration: null,
  url: null,
  isDefault: false,
  fragments: [
    { lengthBp: 1000, mass: 10, format: 'bold' },
    { lengthBp: 500, mass: 5, format: 'hidden' },
  ],
}

function sampleLane(overrides: Partial<GelSampleLane> = {}): GelSampleLane {
  return {
    ...createEmptyGelSample(),
    record: dnaRecord('sample'),
    ...overrides,
  }
}

describe('agarose gel lane planning', () => {
  it('keeps the MW lane first, preserves source records, and pads four cut slots', () => {
    const record = dnaRecord('source')
    const [mw, sample, empty] = createInitialGelLanes([
      { label: 'source label', record, enzymeNames: [' EcoRI ', 'BamHI'] },
    ], 3, 'fixture-ladder')

    expect(mw).toEqual({ kind: 'mw', ladderId: 'fixture-ladder' })
    expect(sample).toMatchObject({ kind: 'sample', record, sourceLabel: 'source label' })
    expect(sample && sample.kind === 'sample' ? sample.record : null).toBe(record)
    expect(sample && sample.kind === 'sample' ? sample.enzymeNames : []).toEqual(['EcoRI', 'BamHI', '', ''])
    expect(empty).toEqual(createEmptyGelSample())
  })

  it('keeps at least two lanes and uses the topology-aware uncut fragment', () => {
    const record = dnaRecord('circular', 'ACGT', 'circular')
    const fragments = listGelLaneFragments(sampleLane({ record }))
    expect(fragments).toEqual([{ id: 'uncut', start: 0, end: 4, length: 4, wraps: true }])
  })

  it('plans cut bands and labels without coupling to React or storage', () => {
    const lane = sampleLane({
      record: dnaRecord('digest', 'GAATTCAAAAAAGGATCC'),
      enzymeNames: ['EcoRI'],
    })
    expect(listGelLaneFragments(lane).map((fragment) => fragment.length)).toEqual([17, 1])
    expect(sampleGelLaneLabel(lane)).toBe('digest · EcoRI')
    expect(buildGelFragmentListText([
      { kind: 'mw', ladderId: ladder.id },
      lane,
    ], 1, 'agarose', () => ladder)).toContain('1.0% agarose\n\nMW\tFixture ladder\t1000, 500\n1\tdigest · EcoRI\t17, 1')
  })

  it('sorts first PCR choices and returns no partner for a missing binding role', () => {
    const record = dnaRecord('primers')
    record.primers = [
      { id: 'z', name: 'Zeta', sequence: 'AAAA', color: 'fixture-color', bindings: [] },
      { id: 'a', name: 'Alpha', sequence: 'CCCC', color: 'fixture-color', bindings: [] },
    ]
    expect(listFirstPcrPrimerOptions(record).map((primer) => primer.name)).toEqual(['Alpha', 'Zeta'])
    expect(listSecondPcrPrimerOptions(record, 'a')).toEqual([])
  })

  it('deduplicates PCR amplicons and sorts them by descending product length then start', () => {
    const forwardSequence = 'GCGTACGATCGGATCCGATC'
    const reverseTemplate = 'CGATGCCATGAGTCGACCTA'
    const sequence = `TTAA${forwardSequence}GGGATCGTACCTGAGCTAGC${forwardSequence}CCTAGGTCAGTGACCGATGC${reverseTemplate}AATCGGCTAGCTGACCGTAA`
    const record = dnaRecord('pcr', sequence)
    record.primers = [
      {
        id: 'forward',
        name: 'Forward',
        sequence: forwardSequence,
        color: 'fixture-color',
        bindings: [
          { strand: 'forward', templateStart: 4, templateEnd: 24, components: [{ primerBases: forwardSequence, templateStart: 4, templateEnd: 24 }] },
          { strand: 'forward', templateStart: 44, templateEnd: 64, components: [{ primerBases: forwardSequence, templateStart: 44, templateEnd: 64 }] },
        ],
      },
      {
        id: 'reverse',
        name: 'Reverse',
        sequence: reverseComplement(reverseTemplate),
        color: 'fixture-color',
        bindings: [
          { strand: 'reverse', templateStart: 84, templateEnd: 104, components: [{ primerBases: reverseTemplate, templateStart: 84, templateEnd: 104 }] },
          { strand: 'reverse', templateStart: 84, templateEnd: 104, components: [{ primerBases: reverseTemplate, templateStart: 84, templateEnd: 104 }] },
        ],
      },
    ]
    const fragments = listGelLaneFragments({
      ...createEmptyGelSample(),
      record,
      digestMode: 'pcr',
      primerIds: ['forward', 'reverse'],
    })
    expect(fragments).toHaveLength(2)
    expect(fragments.map((fragment) => fragment.length)).toEqual([100, 60])
    expect(new Set(fragments.map((fragment) => fragment.id)).size).toBe(fragments.length)
    expect(fragments.map((fragment) => fragment.start)).toEqual([4, 44])
  })

  it('plans MW display bands and print blocks with hidden ladder bands omitted', () => {
    const mw = { kind: 'mw' as const, ladderId: ladder.id }
    expect(listGelLaneBands(mw, () => ladder)).toEqual([
      { id: 'mw-0-1000', length: 1000, mass: 10, start: 0, end: 0, wraps: false },
      { id: 'mw-1-500', length: 500, mass: 5, start: 0, end: 0, wraps: false },
    ])
    const html = buildGelBandPrintHtml([mw, createEmptyGelSample()], () => ladder)
    expect(html).toContain('MW · Fixture ladder')
    expect(html).toContain(`${(1000).toLocaleString()} bp`)
    expect(html).not.toContain('500 bp')
    expect(html).toContain('Lane 1')
  })
})
