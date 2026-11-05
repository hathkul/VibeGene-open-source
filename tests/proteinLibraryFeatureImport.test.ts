import { describe, expect, it } from 'vitest'
import { createDnaLibraryFromMembers } from '../src/domain/dnaLibrary'
import { defaultFeatureTranslationOptions } from '../src/domain/geneticCode'
import { projectFeaturesOntoLibraryMembers } from '../src/domain/libraryMemberFeatures'
import {
  parseImportedProteinResidueRange,
  parseLibrarySourceMemberId,
} from '../src/domain/libraryMemberProteinFeatures'
import { buildProteinFeatureImportMatches } from '../src/domain/proteinLibraryFeatureImport'
import { proteinTranslationSourceFromRecord } from '../src/domain/proteinTranslationProvenance'
import { createId, featureBounds } from '../src/domain/sequence'
import { alignTraceToTemplate } from '../src/domain/traceAlignment'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'
import type { SequenceFeature, SequenceRecord } from '../src/domain/types'

/** Consensus: ATG AAA GGG TTT CCC → M K G F P */
const CONSENSUS = 'ATGAAAGGGTTTCCC'
/** Member inserts GCG (A) after GGG → M K G A F P */
const MEMBER = 'ATGAAAGGGGCGTTTCCC'

function cdsFeature(id = 'cds1'): SequenceFeature {
  return {
    id,
    name: 'VHH',
    type: 'CDS',
    color: '#f59e0b',
    locations: [{ start: 0, end: CONSENSUS.length, strand: 'forward' }],
    translateInSequenceView: true,
    translation: defaultFeatureTranslationOptions(1),
  }
}

function proteinFeature(start: number, end: number, name = 'Domain'): SequenceFeature {
  return {
    id: createId('feature'),
    name,
    type: 'domain',
    color: '#2563eb',
    locations: [{ start, end, strand: 'forward' }],
  }
}

describe('proteinLibraryFeatureImport', () => {
  it('imports annotations from a member peptide that differs from consensus', () => {
    const alignment = alignTraceToTemplate(MEMBER, CONSENSUS)
    expect(alignment).not.toBeNull()
    const member = {
      ...traceRecordFromSequence(MEMBER, 'good-clone.seq'),
      alignment,
      features: [{
        ...cdsFeature(),
        locations: [{ start: 0, end: MEMBER.length, strand: 'forward' as const }],
      }],
    }
    const other = {
      ...traceRecordFromSequence(CONSENSUS, 'other.seq'),
      alignment: alignTraceToTemplate(CONSENSUS, CONSENSUS),
      features: [cdsFeature()],
    }
    const { record } = createDnaLibraryFromMembers([member, other], { name: 'VHH lib' })
    const library: SequenceRecord = {
      ...record,
      sequence: CONSENSUS,
      features: [cdsFeature()],
      topology: 'linear',
    }

    const protein: SequenceRecord = {
      id: 'prot-member',
      name: 'VHH (good-clone.seq)',
      molecule: 'protein',
      topology: 'linear',
      sequence: 'MKGAFP',
      features: [proteinFeature(2, 5, 'CDR')],
      primers: [],
      operations: [],
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      protein: {
        translationDerivation: {
          kind: 'translated-cds',
          createdAt: '2020-01-01T00:00:00.000Z',
          sources: [proteinTranslationSourceFromRecord(
            {
              ...member,
              id: library.id,
              name: library.name,
              molecule: 'dna',
              topology: 'linear',
              primers: [],
              operations: [],
              createdAt: library.createdAt,
              updatedAt: library.updatedAt,
              features: member.features!,
              sequence: MEMBER,
            },
            member.features![0]!,
          )],
        },
      },
    }

    expect(() => buildProteinFeatureImportMatches(protein, library)).toThrow(/No CDS/)

    const { matches, cds } = buildProteinFeatureImportMatches(protein, library, {
      libraryMembers: [member, other],
    })
    expect(cds.id).toBe('cds1')
    expect(matches).toHaveLength(1)
    // Notes keep source-member AA coords and library-source tag
    expect(parseImportedProteinResidueRange(matches[0]!.feature.notes)).toEqual({ start: 2, end: 5 })
    expect(parseLibrarySourceMemberId(matches[0]!.feature.notes)).toBe(member.id)

    // Consensus DNA covers the homologous GGG…TTT region (insertion lifts as a span)
    const bounds = featureBounds(matches[0]!.feature)
    expect(bounds.end - bounds.start).toBeGreaterThanOrEqual(6)
    expect(CONSENSUS.slice(bounds.start, bounds.start + 3)).toBe('GGG')

    // Projection onto the source member restores the exact annotated DNA span
    const projected = projectFeaturesOntoLibraryMembers(
      matches.map((match) => match.feature),
      [member, other],
      { consensusSequence: CONSENSUS, topology: 'linear', consensusCds: cdsFeature() },
    )
    const onSource = projected[0]!.features!.find((feature) => feature.id === matches[0]!.feature.id)!
    expect(featureBounds(onSource)).toEqual({ start: 6, end: 15, strand: 'forward' })
    expect(MEMBER.slice(6, 15)).toBe('GGGGCGTTT')
  })

  it('keeps source-member domains intact when consensus CDS has an internal stop', () => {
    // Consensus ORF has an internal stop then continues (NFap-like frankenstein CDS).
    const consensus = 'ATGAAAGGGTAAAAACCCGGG' // MKG*KP G…
    const memberSeq = 'ATGAAAGGGGCGTTTCCC' // MKGAFP — good ORF, no stop
    const alignment = alignTraceToTemplate(memberSeq, consensus)
    const member = {
      ...traceRecordFromSequence(memberSeq, 'good.seq'),
      id: 'member-good',
      alignment: alignment ?? undefined,
      features: [{
        id: 'cds1',
        name: 'VHH',
        type: 'CDS',
        color: '#f59e0b',
        locations: [{ start: 0, end: memberSeq.length, strand: 'forward' as const }],
        translateInSequenceView: true,
        translation: defaultFeatureTranslationOptions(1),
      }],
    }
    const { record } = createDnaLibraryFromMembers([member], { name: 'Stop lib' })
    const library: SequenceRecord = {
      ...record,
      sequence: consensus,
      features: [{
        id: 'cds1',
        name: 'VHH',
        type: 'CDS',
        color: '#f59e0b',
        locations: [{ start: 0, end: consensus.length, strand: 'forward' }],
        translateInSequenceView: true,
        translation: defaultFeatureTranslationOptions(1),
      }],
      topology: 'linear',
    }
    const protein: SequenceRecord = {
      id: 'prot',
      name: 'good protein',
      molecule: 'protein',
      topology: 'linear',
      sequence: 'MKGAFP',
      features: [
        proteinFeature(0, 3, 'N-term'),
        proteinFeature(3, 6, 'C-term'),
      ],
      primers: [],
      operations: [],
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    }

    const { matches } = buildProteinFeatureImportMatches(protein, library, {
      libraryMembers: [member],
    })
    expect(matches.length).toBeGreaterThanOrEqual(1)
    for (const match of matches) {
      expect(parseLibrarySourceMemberId(match.feature.notes)).toBe('member-good')
    }

    const projected = projectFeaturesOntoLibraryMembers(
      matches.map((match) => match.feature),
      [member],
      {
        consensusSequence: consensus,
        topology: 'linear',
        consensusCds: library.features[0],
      },
    )
    const onMember = projected[0]!.features ?? []
    const nTerm = onMember.find((feature) => feature.name === 'N-term')
    const cTerm = onMember.find((feature) => feature.name === 'C-term')
    expect(nTerm).toBeTruthy()
    expect(featureBounds(nTerm!)).toEqual({ start: 0, end: 9, strand: 'forward' })
    expect(cTerm).toBeTruthy()
    expect(featureBounds(cTerm!)).toEqual({ start: 9, end: 18, strand: 'forward' })
    expect(memberSeq.slice(9, 18)).toBe('GCGTTTCCC')
  })
})
