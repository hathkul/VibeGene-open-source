import { themeFixturePalette } from '../test-support/themeFixturePalette'
// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { defaultConstructProperties } from './constructProperties'
import { parseFeatureQualifiers, serializeFeatureQualifiers } from './featureQualifiers'
import { exportGenBank, exportSnapGene, parseGenBank, parseSnapGene } from './parsers'
import { reverseComplement } from './sequence'
import {
  createSgRNAFeatures,
  deleteSgRNAAnnotation,
  findSgRNATargets,
  groupSgRNAFeatures,
  matchesIupacPam,
  replaceSgRNAAnnotation,
  SGRNA_PRESETS,
  sgRnaNominalCut,
  sgRnaCas12aIllustrativeCuts,
} from './sgrna'
import { sgRnaRowLanes, sgRnaSegmentsForRow, sgRnaVisualSegments } from './sgrnaVisualLayout'
import type { SequenceFeature, SequenceRecord } from './types'

const GUIDE = 'ACGTACGTACGTACGTACGA'
const SP = SGRNA_PRESETS[0]!

function record(sequence: string, features: SequenceFeature[], topology: 'linear' | 'circular' = 'linear'): SequenceRecord {
  return {
    id: 'sg-test', name: 'sgRNA test', description: '', molecule: 'dna', topology,
    sequence, features, primers: [], operations: [], construct: defaultConstructProperties,
    createdAt: '', updatedAt: '',
  }
}

describe('sgRNA target mapping', () => {
  it('shows illustrative Cas12a cuts for GuideScan TTTT PAMs on both strands', () => {
    const options = { ...SGRNA_PRESETS[2]!, pamMotif: 'TTTN' }
    const sequences = [`CCCTTTT${GUIDE}AAAAAA`, `${'C'.repeat(10)}${reverseComplement(GUIDE)}AAAA${'C'.repeat(5)}`]
    for (const [index, sequence] of sequences.entries()) {
      const hit = findSgRNATargets(sequence, GUIDE, 'linear', options).find((item) => item.strand === (index === 0 ? 'forward' : 'reverse'))!
      const annotation = groupSgRNAFeatures(createSgRNAFeatures(hit, { name: 'Cas12a', nuclease: 'Cas12a', pamMotif: 'TTTN', pamSide: '5prime', spacer: GUIDE }))[0]!
      expect(sgRnaCas12aIllustrativeCuts(annotation, sequence.length, 'linear')).toEqual(index === 0 ? { nonTarget: 25, target: 30 } : { nonTarget: 12, target: 7 })
      expect(sgRnaCas12aIllustrativeCuts({ ...annotation, observedPam: 'CTTT' }, sequence.length, 'linear')).toBeNull()
    }
  })
  it('maps illustrative Cas12a strand cuts on both strands, including outside a short guide', () => {
    const cpf1 = SGRNA_PRESETS[2]!
    const annotate = (sequence: string, topology: 'linear' | 'circular', start?: number) => {
      const hit = findSgRNATargets(sequence, GUIDE, topology, cpf1).find((candidate) => start === undefined || candidate.guideStart === start)!
      return groupSgRNAFeatures(createSgRNAFeatures(hit, { name: 'Cas12a', nuclease: 'Cas12a', pamMotif: 'TTTV', pamSide: '5prime', spacer: GUIDE }))[0]!
    }
    const forward = `CCCTTTA${GUIDE}AAAAAA`
    const reverse = `${'C'.repeat(10)}${reverseComplement(GUIDE)}TAAA${'C'.repeat(5)}`
    const circular = `${GUIDE.slice(8)}CCCCCCTTTA${GUIDE.slice(0, 8)}`
    expect(sgRnaCas12aIllustrativeCuts(annotate(forward, 'linear'), forward.length, 'linear')).toEqual({ nonTarget: 25, target: 30 })
    expect(sgRnaCas12aIllustrativeCuts(annotate(reverse, 'linear'), reverse.length, 'linear')).toEqual({ nonTarget: 12, target: 7 })
    expect(sgRnaCas12aIllustrativeCuts(annotate(circular, 'circular', circular.length - 8), circular.length, 'circular')).toEqual({ nonTarget: 10, target: 15 })
    const short = `CCCTTTA${GUIDE}`
    expect(sgRnaCas12aIllustrativeCuts(annotate(short, 'linear'), short.length, 'linear')).toEqual({ nonTarget: 25, target: null })
    expect(sgRnaNominalCut(annotate(forward, 'linear'), forward.length, 'linear')).toBeNull()
  })
  it('locates the SpCas9 nominal cut on both strands and across the circular origin', () => {
    const annotation = (sequence: string, topology: 'linear' | 'circular', start?: number) => {
      const hit = findSgRNATargets(sequence, GUIDE, topology, SP).find((candidate) => start === undefined || candidate.guideStart === start)!
      return groupSgRNAFeatures(createSgRNAFeatures(hit, { name: 'Guide', nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer: GUIDE }))[0]!
    }
    const forward = `TTT${GUIDE}AGGTTT`
    const reverse = `TTTCCT${reverseComplement(GUIDE)}TTT`
    const circular = `${GUIDE.slice(8)}AGGAAAA${GUIDE.slice(0, 8)}`
    expect(sgRnaNominalCut(annotation(forward, 'linear'), forward.length, 'linear')).toBe(20)
    expect(sgRnaNominalCut(annotation(reverse, 'linear'), reverse.length, 'linear')).toBe(9)
    expect(sgRnaNominalCut(annotation(circular, 'circular', circular.length - 8), circular.length, 'circular')).toBe(9)
    expect(sgRnaNominalCut({ ...annotation(forward, 'linear'), nuclease: 'Cas12a' }, forward.length, 'linear')).toBeNull()
  })

  it('places the SaCas9 cut relative to the PAM for a 21-base guide', () => {
    const spacer = `${GUIDE}C`
    const preset = SGRNA_PRESETS[1]!
    for (const [sequence, expected] of [[`TTT${spacer}AAGAATTTT`, 21], [`TTTATTCTT${reverseComplement(spacer)}TTT`, 12]] as const) {
      const hit = findSgRNATargets(sequence, spacer, 'linear', preset)[0]!
      const annotation = groupSgRNAFeatures(createSgRNAFeatures(hit, { name: 'Sa guide', nuclease: 'SaCas9', pamMotif: preset.pamMotif, pamSide: '3prime', spacer }))[0]!
      expect(sgRnaNominalCut(annotation, sequence.length, 'linear')).toBe(expected)
    }
  })
  it('finds SpCas9 forward and reverse guide matches with strand-oriented PAMs', () => {
    const plus = findSgRNATargets(`TTT${GUIDE}AGGTTT`, GUIDE, 'linear', SP)
    expect(plus).toMatchObject([{ strand: 'forward', guideStart: 3, pamStart: 23, pamSequence: 'AGG' }])
    const minus = findSgRNATargets(`TTTCCT${reverseComplement(GUIDE)}TTT`, GUIDE, 'linear', SP)
    expect(minus).toMatchObject([{ strand: 'reverse', guideStart: 6, pamStart: 3, pamSequence: 'AGG' }])
  })

  it('matches degenerate PAMs and the 5prime Cas12a orientation', () => {
    expect(matchesIupacPam('AGGAAT', 'NNGRRT')).toBe(true)
    expect(matchesIupacPam('TTTA', 'TTTV')).toBe(true)
    expect(matchesIupacPam('TTTT', 'TTTV')).toBe(false)
    const cpf1 = SGRNA_PRESETS[2]!
    const plus = findSgRNATargets(`CCCTTTA${GUIDE}CCC`, GUIDE, 'linear', cpf1)
    expect(plus).toMatchObject([{ strand: 'forward', guideStart: 7, pamStart: 3, pamSequence: 'TTTA' }])
    const minus = findSgRNATargets(`CCC${reverseComplement(GUIDE)}TAAACCC`, GUIDE, 'linear', cpf1)
    expect(minus).toMatchObject([{ strand: 'reverse', guideStart: 3, pamStart: 23, pamSequence: 'TTTA' }])
  })

  it('splits circular-origin guide and PAM locations', () => {
    const sequence = `${GUIDE.slice(8)}AGGAAAA${GUIDE.slice(0, 8)}`
    const hit = findSgRNATargets(sequence, GUIDE, 'circular', SP).find((candidate) => candidate.guideStart === sequence.length - 8)
    expect(hit?.guideLocations).toMatchObject([{ start: sequence.length - 8, end: sequence.length }, { start: 0, end: 12 }])
    expect(hit?.pamSequence).toBe('AGG')
    expect(findSgRNATargets(sequence, GUIDE, 'linear', SP)).toHaveLength(0)
  })

  it('rejects invalid guide bases and guide length outside a selected nuclease range', () => {
    expect(() => findSgRNATargets('ACGT', 'ACGN', 'linear', SP)).toThrow(/A, C, G, or T/)
    expect(() => findSgRNATargets('ACGT', 'ACGT', 'linear', SP)).toThrow(/at least 20/)
  })
})

describe('sgRNA visual mapping', () => {
  it('places actual forward guide and PAM bases in adjacent framed segments', () => {
    const sequence = `TTT${GUIDE}AGGTTT`
    const hit = findSgRNATargets(sequence, GUIDE, 'linear', SP)[0]!
    const annotation = groupSgRNAFeatures(createSgRNAFeatures(hit, {
      name: 'Guide A', nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer: GUIDE,
    }))
    const segments = sgRnaVisualSegments(annotation, sequence)
    expect(segments.map(({ part, start, end, bases }) => ({ part, start, end, bases }))).toEqual([
      { part: 'guide', start: 3, end: 23, bases: GUIDE },
      { part: 'pam', start: 23, end: 26, bases: 'AGG' },
    ])
    expect(sgRnaRowLanes(segments).count).toBe(1)
    expect(sgRnaSegmentsForRow(segments, 20, 27, 'forward').map((part) => part.bases)).toEqual([GUIDE.slice(-3), 'AGG'])
  })

  it('shows reverse guide and PAM bases aligned to the lower genomic strand', () => {
    const sequence = `TTTCCT${reverseComplement(GUIDE)}TTT`
    const hit = findSgRNATargets(sequence, GUIDE, 'linear', SP)[0]!
    const annotation = groupSgRNAFeatures(createSgRNAFeatures(hit, {
      name: 'Guide B', nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer: GUIDE,
    }))
    const segments = sgRnaVisualSegments(annotation, sequence)
    expect(segments.map(({ part, bases }) => ({ part, bases }))).toEqual([
      { part: 'guide', bases: [...GUIDE].reverse().join('') },
      { part: 'pam', bases: 'GGA' },
    ])
    expect(segments[1]?.end).toBe(segments[0]?.start)
    expect(sgRnaSegmentsForRow(segments, 3, 26, 'reverse')).toHaveLength(2)
  })
})

describe('sgRNA feature persistence', () => {
  beforeAll(async () => {
    const { initSnapGeneLzma } = await import('./snapgeneLzma')
    await initSnapGeneLzma()
  })

  function pair() {
    const hit = findSgRNATargets(`TTT${GUIDE}AGGTTT`, GUIDE, 'linear', SP)[0]!
    return createSgRNAFeatures(hit, { name: 'Target A', nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer: GUIDE, id: 'shared-1' })
  }

  it('creates two linked ordinary features and preserves qualifiers through .dna and GenBank', () => {
    const features = pair()
    expect(features.map((feature) => feature.type)).toEqual(['misc_feature', 'misc_feature'])
    expect(features.map((feature) => parseFeatureQualifiers(feature.notes).vibegene_sgrna_id)).toEqual(['shared-1', 'shared-1'])
    expect(groupSgRNAFeatures(features)).toMatchObject([{ id: 'shared-1', pamMotif: 'NGG', observedPam: 'AGG', spacer: GUIDE }])
    const original = record(`TTT${GUIDE}AGGTTT`, features)
    const dna = parseSnapGene(exportSnapGene(original), 'sgRNA.dna')
    const gb = parseGenBank(exportGenBank(original), 'sgRNA.gb')
    for (const imported of [dna, gb]) {
      const annotations = groupSgRNAFeatures(imported.features)
      expect(annotations).toHaveLength(1)
      expect(annotations[0]).toMatchObject({ id: 'shared-1', nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer: GUIDE, observedPam: 'AGG' })
      expect(annotations[0]?.guide.locations).toMatchObject([{ start: 3, end: 23, strand: 'forward' }])
      expect(annotations[0]?.pam?.locations).toMatchObject([{ start: 23, end: 26, strand: 'forward' }])
    }
  })

  it('round-trips an origin-spanning guide through both feature formats', () => {
    const sequence = `${GUIDE.slice(8)}AGGAAAA${GUIDE.slice(0, 8)}`
    const hit = findSgRNATargets(sequence, GUIDE, 'circular', SP).find((candidate) => candidate.guideLocations.length === 2)!
    const features = createSgRNAFeatures(hit, { name: 'Origin target', nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer: GUIDE, id: 'origin-1' })
    const original = record(sequence, features, 'circular')
    for (const imported of [parseSnapGene(exportSnapGene(original), 'origin.dna'), parseGenBank(exportGenBank(original), 'origin.gb')]) {
      const annotations = groupSgRNAFeatures(imported.features)
      expect(annotations).toHaveLength(1)
      expect(annotations[0]?.guide.locations).toEqual(hit.guideLocations)
      expect(annotations[0]?.pam?.locations).toEqual(hit.pamLocations)
    }
  })

  it('preserves unknown qualifiers on replacement and unrelated or orphan features on deletion', () => {
    const [guide, pam] = pair()
    guide.notes = serializeFeatureQualifiers({ ...parseFeatureQualifiers(guide.notes), custom_tag: 'keep' })
    const unrelated: SequenceFeature = { id: 'other', name: 'Other', type: 'misc_feature', color: themeFixturePalette.blackLong, locations: [{ start: 0, end: 1, strand: 'forward' }] }
    const orphan: SequenceFeature = { ...pam, id: 'orphan', notes: serializeFeatureQualifiers({ ...parseFeatureQualifiers(pam.notes), vibegene_sgrna_id: 'orphan-id' }) }
    const replacement = pair()
    const updated = replaceSgRNAAnnotation([unrelated, guide, pam, orphan], 'shared-1', replacement)
    expect(updated).toHaveLength(4)
    expect(parseFeatureQualifiers(groupSgRNAFeatures(updated)[0]?.guide.notes).custom_tag).toBe('keep')
    expect(groupSgRNAFeatures(updated)[0]?.guide.id).toBe(guide.id)
    const deleted = deleteSgRNAAnnotation(updated, 'shared-1')
    expect(deleted.map((feature) => feature.id)).toEqual(['other', 'orphan'])
    expect(groupSgRNAFeatures(deleted)).toHaveLength(0)
  })
})
