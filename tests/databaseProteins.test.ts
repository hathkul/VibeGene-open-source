import { describe, expect, it } from 'vitest'
import { defaultFeatureTranslationOptions } from '../src/domain/geneticCode'
import { defaultConstructProperties, normalizeSequenceRecord } from '../src/domain/constructProperties'
import { proteinTranslationSourceFromRecord } from '../src/domain/proteinTranslationProvenance'
import type { SequenceFeature, SequenceRecord } from '../src/domain/types'
import {
  createSequenceRecordFromDatabaseProtein,
  dedupeProteinHits,
  normalizePeptide,
  peptideForTranslatedCds,
  proteinHitsFromRecord,
  proteinIdentityKey,
} from '../src/storage/databaseProteins'

function cds(partial: Partial<SequenceFeature> & Pick<SequenceFeature, 'name' | 'locations'>): SequenceFeature {
  return {
    id: partial.id ?? 'cds-1',
    name: partial.name,
    type: partial.type ?? 'CDS',
    color: partial.color ?? '#f59e0b',
    notes: partial.notes,
    translateInSequenceView: partial.translateInSequenceView,
    translation: partial.translation,
    locations: partial.locations,
  }
}

describe('proteinIdentityKey', () => {
  it('treats name case and peptide case as the same protein', () => {
    expect(proteinIdentityKey('GFP', 'mvs*')).toBe(proteinIdentityKey('gfp', 'MVS'))
  })

  it('keeps different names with the same peptide distinct', () => {
    expect(proteinIdentityKey('GFP', 'MVS')).not.toBe(proteinIdentityKey('YFP', 'MVS'))
  })
})

describe('peptideForTranslatedCds', () => {
  const dna = 'ATGGTTTAA' // M V stop

  it('translates Sequence-view CDS from DNA', () => {
    const feature = cds({
      name: 'orf',
      translateInSequenceView: true,
      translation: defaultFeatureTranslationOptions(1),
      locations: [{ start: 0, end: 9, strand: 'forward' }],
    })
    expect(peptideForTranslatedCds(feature, dna)).toBe('MV')
  })

  it('uses the CDS body rather than an overlong stored /translation', () => {
    const feature = cds({
      name: 'orf',
      notes: '/product="marker" /translation="MVSK"',
      locations: [{ start: 0, end: 9, strand: 'forward' }],
    })
    expect(peptideForTranslatedCds(feature, dna)).toBe('MV')
  })

  it('does not include translation extended beyond the CDS feature body', () => {
    const feature = cds({
      name: 'orf fragment',
      translateInSequenceView: true,
      translation: defaultFeatureTranslationOptions(1),
      locations: [{ start: 0, end: 6, strand: 'forward' }],
    })
    expect(peptideForTranslatedCds(feature, 'ATGGTTAAGTAA')).toBe('MV')
  })

  it('ignores non-CDS features', () => {
    const feature = cds({
      name: 'prom',
      type: 'promoter',
      notes: '/translation="MV"',
      locations: [{ start: 0, end: 9, strand: 'forward' }],
    })
    expect(peptideForTranslatedCds(feature, dna)).toBeNull()
  })
})

describe('dedupeProteinHits', () => {
  it('dedupes the same translated CDS from two files in one folder', () => {
    const dna = 'ATGTCTAAAGGTGAAGAACTG' // MSKGEEL
    const feature = cds({
      name: 'GFP',
      notes: '/translation="MSKGEEL"',
      locations: [{ start: 0, end: 21, strand: 'forward' }],
    })
    const hits = [
      ...proteinHitsFromRecord(
        { features: [feature], sequence: dna, topology: 'linear' },
        { projectId: 'a', projectName: 'pA', folderId: 'folder-1' },
      ),
      ...proteinHitsFromRecord(
        { features: [feature], sequence: dna, topology: 'linear' },
        { projectId: 'b', projectName: 'pB', folderId: 'folder-1' },
      ),
    ]
    const rows = dedupeProteinHits(hits)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.sources.map((source) => source.projectId)).toEqual(['a', 'b'])
    expect(normalizePeptide(rows[0]!.sequence)).toBe('MSKGEEL')
  })
})

describe('createSequenceRecordFromDatabaseProtein', () => {
  it('opens a CDS row as a linear protein molecule', () => {
    const record = createSequenceRecordFromDatabaseProtein({
      name: 'GFP',
      sequence: 'mskgeel',
      color: '#22c55e',
      product: 'green fluorescent protein',
      sources: [{ projectId: 'p1', projectName: 'pDemo.dna', folderId: null }],
    })
    expect(record.molecule).toBe('protein')
    expect(record.topology).toBe('linear')
    expect(record.sequence).toBe('MSKGEEL')
    expect(record.name).toBe('GFP')
    expect(record.features[0]?.type).toBe('region')
    expect(record.features[0]?.locations[0]).toEqual({ start: 0, end: 7, strand: 'forward' })
    expect(record.description).toContain('pDemo.dna')
  })

  it('preserves a portable DNA/CDS derivation snapshot', () => {
    const feature = cds({
      id: 'gfp-cds',
      name: 'GFP',
      translateInSequenceView: true,
      translation: defaultFeatureTranslationOptions(1),
      locations: [{ start: 0, end: 9, strand: 'forward' }],
    })
    const sourceRecord: SequenceRecord = {
      id: 'p1',
      name: 'pDemo.dna',
      description: '',
      molecule: 'dna',
      topology: 'linear',
      sequence: 'ATGGTTTAA',
      features: [feature],
      primers: [],
      operations: [],
      construct: defaultConstructProperties,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }
    const record = createSequenceRecordFromDatabaseProtein({
      name: 'GFP',
      sequence: 'MV',
      color: '#22c55e',
      product: 'green fluorescent protein',
      sources: [{ projectId: 'p1', projectName: 'pDemo.dna', folderId: null, featureId: 'gfp-cds' }],
      translationSources: [proteinTranslationSourceFromRecord(sourceRecord, feature)],
    })
    const source = record.protein?.translationDerivation?.sources[0]
    expect(source?.sourceRecord?.sequence).toBe('ATGGTTTAA')
    expect(source?.sourceRecord?.traceFiles).toBeUndefined()
    expect(source?.cds?.nucleotideSequence).toBe('ATGGTTTAA')
    expect(source?.cds?.includedTerminalStop).toBe(true)
    expect(source?.sequenceDigest).toMatch(/^fnv1a64:/)
  })

  it('does not re-snapshot embedded source DNA during protein normalization', () => {
    const feature = cds({
      id: 'gfp-cds',
      name: 'GFP',
      translateInSequenceView: true,
      translation: defaultFeatureTranslationOptions(1),
      locations: [{ start: 0, end: 9, strand: 'forward' }],
    })
    const sourceRecord: SequenceRecord = {
      id: 'p1',
      name: 'pDemo.dna',
      description: '',
      molecule: 'dna',
      topology: 'linear',
      sequence: 'ATGGTTTAA',
      features: [feature],
      primers: [],
      operations: [],
      history: {
        id: 'h1',
        name: 'pDemo.dna',
        seqLen: 9,
        circular: false,
        operation: 'insert',
        resurrectable: false,
        hideHistory: false,
        oligos: [],
        regeneratedSites: [],
        inputSummaries: [],
        features: [],
        children: [],
      },
      construct: defaultConstructProperties,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }
    const protein = createSequenceRecordFromDatabaseProtein({
      name: 'GFP',
      sequence: 'MV',
      color: '#22c55e',
      product: 'green fluorescent protein',
      sources: [{ projectId: 'p1', projectName: 'pDemo.dna', folderId: null, featureId: 'gfp-cds' }],
      translationSources: [proteinTranslationSourceFromRecord(sourceRecord, feature)],
    })

    const embeddedBefore = protein.protein?.translationDerivation?.sources[0]?.sourceRecord
    const normalized = normalizeSequenceRecord(protein)
    const embeddedAfter = normalized.protein?.translationDerivation?.sources[0]?.sourceRecord

    expect(embeddedBefore).toBeDefined()
    expect(embeddedAfter).toBe(embeddedBefore)
  })

  it('stores reverse-strand coding bases in translation order', () => {
    const translation = { ...defaultFeatureTranslationOptions(1), readingFrame: -1 as const }
    const feature = cds({
      id: 'reverse-cds',
      name: 'Reverse CDS',
      translateInSequenceView: true,
      translation,
      locations: [{ start: 0, end: 6, strand: 'reverse' }],
    })
    const sourceRecord: SequenceRecord = {
      id: 'reverse-source',
      name: 'reverse.dna',
      description: '',
      molecule: 'dna',
      topology: 'linear',
      sequence: 'TTACAT',
      features: [feature],
      primers: [],
      operations: [],
      construct: defaultConstructProperties,
      createdAt: '',
      updatedAt: '',
    }
    const source = proteinTranslationSourceFromRecord(sourceRecord, feature)
    expect(source.cds?.nucleotideSequence).toBe('ATGTAA')
    expect(source.cds?.includedTerminalStop).toBe(true)
  })
})
