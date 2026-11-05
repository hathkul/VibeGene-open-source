import { describe, expect, it } from 'vitest'
import {
  buildProteinFeatureImportMatches,
  findMatchingTranslatedCds,
  mapProteinFeatureOntoCds,
  resolveProteinImportCds,
  segmentsForProteinResidues,
  translationCellsMatchingProtein,
} from '../src/domain/proteinAnnotationToDna'
import { createDnaLibraryFromMembers } from '../src/domain/dnaLibrary'
import { defaultFeatureTranslationOptions } from '../src/domain/geneticCode'
import { proteinTranslationSourceFromRecord } from '../src/domain/proteinTranslationProvenance'
import { createId } from '../src/domain/sequence'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'
import type { SequenceFeature, SequenceRecord } from '../src/domain/types'

/** ATG AAA GGG TAA → M K G (stop) */
const CDS_SEQ = 'ATGAAAGGGTAA'
const PEPTIDE = 'MKG'

function cdsFeature(id = 'cds1'): SequenceFeature {
  return {
    id,
    name: 'TestCDS',
    type: 'CDS',
    color: '#f59e0b',
    locations: [{ start: 0, end: CDS_SEQ.length, strand: 'forward' }],
    translateInSequenceView: true,
    translation: defaultFeatureTranslationOptions(1),
  }
}

function dnaRecord(features: SequenceFeature[] = [cdsFeature()]): SequenceRecord {
  return {
    id: 'dna-1',
    name: 'Source DNA',
    molecule: 'dna',
    topology: 'linear',
    sequence: CDS_SEQ,
    features,
    primers: [],
    operations: [],
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }
}

function proteinRecord(features: SequenceFeature[]): SequenceRecord {
  return {
    id: 'prot-1',
    name: 'Test protein',
    molecule: 'protein',
    topology: 'linear',
    sequence: PEPTIDE,
    features,
    primers: [],
    operations: [],
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    protein: {
      translationDerivation: {
        kind: 'translated-cds',
        createdAt: '2020-01-01T00:00:00.000Z',
        sources: [],
      },
    },
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

describe('proteinAnnotationToDna', () => {
  it('maps contiguous AA residues to codon spans', () => {
    const dna = dnaRecord()
    const cds = dna.features[0]!
    const cells = translationCellsMatchingProtein(cds, dna.sequence, dna.topology, PEPTIDE)
    expect(cells).toHaveLength(3)
    const segments = segmentsForProteinResidues(cells!, 1, 3, 'forward')
    expect(segments).toEqual([{ start: 3, end: 9, strand: 'forward' }])
  })

  it('maps a protein domain onto CDS DNA as misc_feature', () => {
    const dna = dnaRecord()
    const cds = dna.features[0]!
    const cells = translationCellsMatchingProtein(cds, dna.sequence, dna.topology, PEPTIDE)!
    const domain = proteinFeature(0, 2, 'N-term')
    const mapped = mapProteinFeatureOntoCds(domain, cells, 'forward')
    expect('reason' in mapped).toBe(false)
    if ('reason' in mapped) return
    expect(mapped.dnaFeature.type).toBe('misc_feature')
    expect(mapped.dnaFeature.locations).toEqual([{ start: 0, end: 6, strand: 'forward' }])
  })

  it('finds a matching CDS by peptide identity without provenance', () => {
    const dna = dnaRecord()
    const matches = findMatchingTranslatedCds(dna, PEPTIDE)
    expect(matches).toHaveLength(1)
    expect(matches[0]!.cds.id).toBe('cds1')
    expect(resolveProteinImportCds(proteinRecord([]), dna)?.cds.id).toBe('cds1')
  })

  it('builds import matches for Features → Import from another file', () => {
    const dna = dnaRecord()
    const domain = proteinFeature(0, 3, 'Full')
    const protein = proteinRecord([domain])
    const { matches, cds } = buildProteinFeatureImportMatches(protein, dna)
    expect(cds.id).toBe('cds1')
    expect(matches).toHaveLength(1)
    expect(matches[0]!.feature.locations).toEqual([{ start: 0, end: 9, strand: 'forward' }])
    expect(matches[0]!.matchPercent).toBe(100)
  })

  it('prefers the provenance CDS when several peptides match', () => {
    const first = cdsFeature('cds-a')
    const second: SequenceFeature = {
      ...cdsFeature('cds-b'),
      locations: [{ start: 0, end: CDS_SEQ.length, strand: 'forward' }],
    }
    const dna = dnaRecord([first, second])
    const source = proteinTranslationSourceFromRecord(dna, second)
    const protein: SequenceRecord = {
      ...proteinRecord([proteinFeature(0, 1)]),
      protein: {
        translationDerivation: {
          kind: 'translated-cds',
          createdAt: '2020-01-01T00:00:00.000Z',
          sources: [source],
        },
      },
    }
    expect(resolveProteinImportCds(protein, dna)?.cds.id).toBe('cds-b')
  })

  it('works on a DNA library consensus CDS', () => {
    const a = traceRecordFromSequence(CDS_SEQ, 'a.seq')
    const b = traceRecordFromSequence(CDS_SEQ, 'b.seq')
    const { record } = createDnaLibraryFromMembers([a, b], { name: 'Lib' })
    const library: SequenceRecord = {
      ...record,
      sequence: CDS_SEQ,
      features: [cdsFeature()],
      topology: 'linear',
    }
    const domain = proteinFeature(1, 2, 'Middle')
    const { matches } = buildProteinFeatureImportMatches(proteinRecord([domain]), library)
    expect(matches[0]!.feature.locations).toEqual([{ start: 3, end: 6, strand: 'forward' }])
  })
})
