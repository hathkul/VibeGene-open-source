import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultDnaEnds } from '../src/domain/dnaEnds'
import {
  analyzeTaGcAssembly,
  defaultTaGcInsertConfig,
  defaultTaGcVectorConfig,
  resolveTaGcInsert,
  resolveTaGcVector,
} from '../src/domain/taGcCloning'
import {
  canOfferTaGcPrimerDesign,
  designTaGcPrimersForInsert,
  defaultTaGcPrimerDesignOptions,
  listTaGcPrimerTargets,
  mergeTaGcDesignedPrimersOntoRecord,
  uniquifyTaGcPrimerName,
} from '../src/domain/taGcOverlapPrimers'
import type { SequenceRecord } from '../src/domain/types'

function makeRecord(name: string, sequence: string, overrides?: Partial<SequenceRecord>): SequenceRecord {
  return {
    id: `seq-${name}`,
    name,
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: defaultConstructProperties,
    dnaEnds: defaultDnaEnds(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const INSERT_CORE =
  'ATGCGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTTA'

describe('taGcOverlapPrimers', () => {
  it('offers design only for amplify stretches ≥60 bp', () => {
    const record = makeRecord('I', `GGGG${INSERT_CORE}CCCC`)
    expect(
      canOfferTaGcPrimerDesign({
        insertRecord: record,
        amplifyRange: { start: 4, end: 4 + INSERT_CORE.length },
        assemblyReady: false,
      }),
    ).toBe(true)
    expect(
      canOfferTaGcPrimerDesign({
        insertRecord: record,
        amplifyRange: { start: 4, end: 40 },
        assemblyReady: false,
      }),
    ).toBe(false)
  })

  it('designs anneal-only TA primers and keeps prior oligos on regenerate', () => {
    const record = makeRecord('I', `GGGG${INSERT_CORE}CCCC`)
    const amplifyRange = { start: 4, end: 4 + INSERT_CORE.length }
    const designed = designTaGcPrimersForInsert({
      insertRecord: record,
      amplifyRange,
      options: defaultTaGcPrimerDesignOptions('ta'),
    })
    expect(designed).not.toBeNull()
    expect(designed!.insertForward.name).toBe('I_TA_F')
    expect(designed!.insertReverse.name).toBe('I_TA_R')
    // No Gibson-style homology tails — primers are anneal-only.
    expect(designed!.insertForward.sequence.length).toBeLessThan(40)
    expect(designed!.insertReverse.sequence.length).toBeLessThan(40)

    const withFirst = mergeTaGcDesignedPrimersOntoRecord(record, designed!.insertPrimers)
    expect(withFirst.primers.map((primer) => primer.name)).toEqual(['I_TA_F', 'I_TA_R'])

    const designedAgain = designTaGcPrimersForInsert({
      insertRecord: withFirst,
      amplifyRange,
      options: defaultTaGcPrimerDesignOptions('ta'),
    })
    expect(designedAgain!.insertForward.name).toBe('I_TA_v2_F')
    expect(designedAgain!.insertReverse.name).toBe('I_TA_v2_R')
    // Identical anneal sequences may collapse on merge; names are still unique for the new drafts.
  })

  it('lists Choose vs Regenerate targets from insert readiness', () => {
    const record = makeRecord('I', `GGGG${INSERT_CORE}CCCC`)
    const amplifyRange = { start: 4, end: 4 + INSERT_CORE.length }
    const insert = {
      ...defaultTaGcInsertConfig(record),
      selectedRange: amplifyRange,
    }
    expect(
      listTaGcPrimerTargets({
        insert,
        insertReady: false,
        assemblyReady: false,
        includeReadyInsert: false,
      }),
    ).toHaveLength(1)

    const designed = designTaGcPrimersForInsert({
      insertRecord: record,
      amplifyRange,
      options: defaultTaGcPrimerDesignOptions('gc'),
    })!
    const readyConfig = {
      ...insert,
      record: mergeTaGcDesignedPrimersOntoRecord(record, designed.insertPrimers),
      forwardPrimer: designed.insertForward,
      reversePrimer: designed.insertReverse,
    }
    const resolved = resolveTaGcInsert(readyConfig, 'gc')
    expect(resolved.ready).toBe(true)
    expect(
      listTaGcPrimerTargets({
        insert: readyConfig,
        insertReady: true,
        assemblyReady: false,
        includeReadyInsert: false,
      }),
    ).toHaveLength(0)
    expect(
      listTaGcPrimerTargets({
        insert: readyConfig,
        insertReady: true,
        assemblyReady: true,
        includeReadyInsert: true,
      }),
    ).toHaveLength(1)
    expect(designed.insertForward.name).toBe('I_GC_F')
  })

  it('uniquifies primer names with method tags', () => {
    const taken = new Set(['Gene_TA_F'])
    expect(uniquifyTaGcPrimerName('Gene_TA_F', taken)).toBe('Gene_TA_v2_F')
  })

  it('assembled TA product stays ready after designed sticky PCR insert', () => {
    const insertRecord = makeRecord('I', `GGGG${INSERT_CORE}CCCC`)
    const amplifyRange = { start: 4, end: 4 + INSERT_CORE.length }
    const designed = designTaGcPrimersForInsert({
      insertRecord,
      amplifyRange,
      options: defaultTaGcPrimerDesignOptions('ta'),
    })!
    const insert = resolveTaGcInsert(
      {
        ...defaultTaGcInsertConfig(
          mergeTaGcDesignedPrimersOntoRecord(insertRecord, designed.insertPrimers),
        ),
        forwardPrimer: designed.insertForward,
        reversePrimer: designed.insertReverse,
        selectedRange: amplifyRange,
        polymerase: 'a-or-g-overhang',
      },
      'ta',
    )
    expect(insert.ready).toBe(true)

    // Sticky T-vector: top-strand encoding A…T with 3′ stickiness −1.
    const vectorSeq = 'A' + 'C'.repeat(200) + 'T'
    const vectorRecord = makeRecord('V', vectorSeq, {
      topology: 'linear',
      dnaEnds: {
        upstream: { modification: 'unmodified', stickiness: -1 },
        downstream: { modification: 'unmodified', stickiness: -1 },
      },
    })
    const vector = resolveTaGcVector(
      { ...defaultTaGcVectorConfig(), source: 'custom', customRecord: vectorRecord },
      'ta',
      null,
    )
    expect(vector.ready).toBe(true)
    const analysis = analyzeTaGcAssembly(insert, vector, 'ta')
    expect(analysis.ready).toBe(true)
  })
})
