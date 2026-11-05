import { describe, expect, it } from 'vitest'
import { reverseComplement } from '../../domain/sequence'
import type { HistoryOligo, HistorySgRnaCloning, Primer } from '../../domain/types'
import {
  annealedOligoPairForSelection,
  newPrimerEditorName,
  primerEditingMemberId,
  sgRnaGuideOligoPair,
  sgRnaRecipeGuideForSenseSequence,
} from './primerEditing'

const SENSE = 'AAACCCGGGTTTACGA'
const ANTISENSE = reverseComplement(SENSE)

function primer(id: string, name = id, sequence = 'ACGTACGT'): Primer {
  return { id, name, sequence, color: id }
}

function oligoPair(stem: string): [Primer, Primer] {
  return [primer(`${stem}-s`, `${stem}_sense`, SENSE), primer(`${stem}-a`, `${stem}_antisense`, ANTISENSE)]
}

function recipe(guideIds: string[], oligos: HistoryOligo[] = []): HistorySgRnaCloning {
  return {
    version: 1,
    guides: guideIds.map((id) => ({
      sourceGuideId: id,
      name: `guide ${id}`,
      nuclease: 'SpCas9',
      targetSpacer: 'ACGT',
      expressedGuide: 'ACGT',
    })),
    oligos,
  } as unknown as HistorySgRnaCloning
}

describe('primerEditingMemberId', () => {
  it('targets the selected member only on the Primers tab or without alignments in a library', () => {
    const base = { selectedAlignmentTraceId: 'm1', isLibrary: true }
    expect(primerEditingMemberId({ ...base, activeTab: 'Primers', alignmentsVisible: true })).toBe('m1')
    expect(primerEditingMemberId({ ...base, activeTab: 'Sequence', alignmentsVisible: false })).toBe('m1')
    expect(primerEditingMemberId({ ...base, activeTab: 'Sequence', alignmentsVisible: true })).toBeNull()
    expect(primerEditingMemberId({ ...base, activeTab: 'Primers', alignmentsVisible: true, isLibrary: false })).toBeNull()
    expect(primerEditingMemberId({ ...base, activeTab: 'Primers', alignmentsVisible: false, selectedAlignmentTraceId: null })).toBeNull()
  })
})

describe('newPrimerEditorName', () => {
  it('names new primers from strand and existing count', () => {
    expect(newPrimerEditorName(null, 0)).toBe('Primer 1')
    expect(newPrimerEditorName('forward', 2)).toBe('Forward primer 3')
    expect(newPrimerEditorName('reverse', 4)).toBe('Reverse primer 5')
  })
})

describe('annealedOligoPairForSelection', () => {
  it('resolves a two-primer selection regardless of sense/antisense order', () => {
    const [sense, antisense] = oligoPair('g1')
    expect(annealedOligoPairForSelection([sense, antisense], [])).toEqual({ sense, antisense })
    expect(annealedOligoPairForSelection([antisense, sense], [])).toEqual({ sense, antisense })
  })

  it('finds the partner of a single named oligo by stem', () => {
    const [sense, antisense] = oligoPair('g1')
    expect(annealedOligoPairForSelection([sense], [sense, antisense])).toEqual({ sense, antisense })
    expect(annealedOligoPairForSelection([antisense], [sense, antisense])).toEqual({ sense, antisense })
  })

  it('returns null for empty, oversized, or non-annealing selections', () => {
    const [sense, antisense] = oligoPair('g1')
    expect(annealedOligoPairForSelection([], [sense, antisense])).toBeNull()
    expect(annealedOligoPairForSelection([sense, antisense, primer('p3')], [])).toBeNull()
    expect(annealedOligoPairForSelection([sense], [sense])).toBeNull()
    const [drySense] = oligoPair('dry')
    const nonAnnealing = primer('dry-a', 'dry_antisense', 'TTTTGGGGCCCCAAAA')
    expect(annealedOligoPairForSelection([drySense, nonAnnealing], [])).toBeNull()
  })
})

describe('sgRnaRecipeGuideForSenseSequence', () => {
  it('matches the guide whose oligo equals the sense sequence, case-insensitively', () => {
    const r = recipe(['g1', 'g2'], [
      { name: 'g1_sense', sequence: SENSE, guideId: 'g1' } as HistoryOligo,
      { name: 'g2_sense', sequence: 'TTTTGGGG', guideId: 'g2' } as HistoryOligo,
    ])
    expect(sgRnaRecipeGuideForSenseSequence(r, SENSE.toLowerCase())?.sourceGuideId).toBe('g1')
    expect(sgRnaRecipeGuideForSenseSequence(r, 'CCCC')).toBeUndefined()
    expect(sgRnaRecipeGuideForSenseSequence(undefined, SENSE)).toBeUndefined()
  })
})

describe('sgRnaGuideOligoPair', () => {
  const r = recipe(['g1', 'g2'], [
    { name: 'g1_sense', sequence: SENSE, guideId: 'g1' } as HistoryOligo,
    { name: 'g1_antisense', sequence: ANTISENSE, guideId: 'g1' } as HistoryOligo,
    { name: 'g2_sense', sequence: SENSE, guideId: 'g2' } as HistoryOligo,
  ])

  it('resolves guide and both oligos for a complete guide', () => {
    const pair = sgRnaGuideOligoPair(r, 'g1')
    expect(pair?.guide.sourceGuideId).toBe('g1')
    expect(pair?.sense.name).toBe('g1_sense')
    expect(pair?.antisense.name).toBe('g1_antisense')
  })

  it('returns null when the antisense oligo or the guide is missing', () => {
    expect(sgRnaGuideOligoPair(r, 'g2')).toBeNull()
    expect(sgRnaGuideOligoPair(r, 'missing')).toBeNull()
    expect(sgRnaGuideOligoPair(undefined, 'g1')).toBeNull()
  })
})
