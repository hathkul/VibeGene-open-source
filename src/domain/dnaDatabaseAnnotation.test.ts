import { themeFixturePalette } from '../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import { buildDnaAnnotationPlan, organismFromDnaSourceRecord, parseEbiDnaBlastXml, parseNcbiBlastXml2, type DnaSimilarityHit } from './dnaDatabaseAnnotation'
import type { SequenceRecord } from './types'
import { defaultConstructProperties } from './constructProperties'

describe('DNA database annotation', () => {
  it('reads the organism from a GenBank source feature', () => {
    const record: SequenceRecord = {
      id: 'source', name: 'Source', description: '', molecule: 'dna', topology: 'linear', sequence: 'AACCGG', construct: defaultConstructProperties,
      features: [{ id: 'source-feature', name: 'source', type: 'source', color: themeFixturePalette.gray, notes: '/organism="Mus musculus" /mol_type="genomic DNA"', locations: [{ start: 0, end: 6, strand: 'forward' }] }],
      primers: [], operations: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(organismFromDnaSourceRecord(record)).toBe('Mus musculus')
  })

  it('parses NCBI BLAST XML2 nucleotide alignments', () => {
    const xml = `<BlastOutput2><report><results><search><hits><Hit><description><HitDescr><id>ref|NC_000001.1|</id><accession>NC_000001.1</accession><title>Example reference</title></HitDescr></description><len>1000</len><hsps><Hsp><bit-score>90.5</bit-score><evalue>1e-20</evalue><identity>48</identity><align-len>50</align-len><query-from>1</query-from><query-to>50</query-to><hit-from>101</hit-from><hit-to>150</hit-to><qseq>AACCGG</qseq><hseq>AACCGG</hseq></Hsp></hsps></Hit></hits></search></results></report></BlastOutput2>`
    expect(parseNcbiBlastXml2(xml, 100)[0]).toMatchObject({
      accession: 'NC_000001.1', identityPercent: 96, queryCoveragePercent: 50,
      queryStart: 1, queryEnd: 50, subjectStart: 101, subjectEnd: 150,
    })
  })

  it('parses EMBL-EBI Job Dispatcher nucleotide alignments', () => {
    const xml = `<SequenceSimilaritySearchResult><hits><hit ac="AJ242600.1" description="Annotated vector" length="1000"><alignments><alignment><score>100</score><bits>80.5</bits><expectation>1e-20</expectation><identity>98</identity><querySeq start="1" end="50">AACCGG</querySeq><matchSeq start="101" end="150">AACCGG</matchSeq></alignment></alignments></hit></hits></SequenceSimilaritySearchResult>`
    expect(parseEbiDnaBlastXml(xml, 100)[0]).toMatchObject({
      provider: 'ena', accession: 'AJ242600.1', identityPercent: 98, queryCoveragePercent: 50,
      queryStart: 1, queryEnd: 50, subjectStart: 101, subjectEnd: 150,
    })
  })

  it('projects source features through a reverse-strand local alignment', () => {
    const hit: DnaSimilarityHit = {
      provider: 'ncbi',
      accession: 'NC_TEST.1', title: 'Test', subjectLength: 20, bitScore: 50, eValue: 1e-10,
      identityPercent: 100, queryCoveragePercent: 100, queryStart: 1, queryEnd: 10,
      subjectStart: 10, subjectEnd: 1, queryAligned: 'AACCGGTTAA', subjectAligned: 'AACCGGTTAA',
    }
    const source: SequenceRecord = {
      id: 'source', name: 'Source', description: '', molecule: 'dna', topology: 'linear', sequence: 'AACCGGTTAAAACCGGTTAA', construct: defaultConstructProperties,
      features: [{ id: 'feature', name: 'Example CDS', type: 'CDS', color: themeFixturePalette.bluePrimary, locations: [{ start: 2, end: 8, strand: 'forward' }] }],
      primers: [], operations: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const annotation = buildDnaAnnotationPlan(hit, source, 100).annotations[0]!
    expect(annotation).toMatchObject({ transferable: true, coveragePercent: 100, targetRange: '103–108' })
    expect(annotation.feature?.locations).toEqual([{ start: 102, end: 108, strand: 'reverse' }])
  })

  it('segments partial features and omits unmapped source bases', () => {
    const hit: DnaSimilarityHit = {
      provider: 'ena', accession: 'PARTIAL.1', title: 'Partial', subjectLength: 20, bitScore: 40, eValue: 1e-8,
      identityPercent: 100, queryCoveragePercent: 100, queryStart: 1, queryEnd: 8,
      subjectStart: 1, subjectEnd: 10, queryAligned: 'AA--CCGGTT', subjectAligned: 'AATTCCGGTT',
    }
    const source: SequenceRecord = {
      id: 'source', name: 'Source', description: '', molecule: 'dna', topology: 'linear', sequence: 'AATTCCGGTT', construct: defaultConstructProperties,
      features: [{ id: 'feature', name: 'Partial feature', type: 'misc_feature', color: themeFixturePalette.bluePrimary, locations: [{ start: 0, end: 10, strand: 'forward' }] }],
      primers: [], operations: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const annotation = buildDnaAnnotationPlan(hit, source, 50).annotations[0]!
    expect(annotation.coveragePercent).toBe(80)
    expect(annotation.targetRange).toBe('51–52, 53–58')
    expect(annotation.feature?.locations).toEqual([
      { start: 50, end: 52, strand: 'forward' },
      { start: 52, end: 58, strand: 'forward' },
    ])
    expect(annotation.feature?.notes).toContain('Partial match transferred as 2 exact-match segments; unmapped and differing bases omitted')
  })

  it('splits transferred features around mismatching query bases', () => {
    const hit: DnaSimilarityHit = {
      provider: 'ena', accession: 'VARIANT.1', title: 'Variant', subjectLength: 8, bitScore: 30, eValue: 1e-5,
      identityPercent: 87.5, queryCoveragePercent: 100, queryStart: 1, queryEnd: 8,
      subjectStart: 1, subjectEnd: 8, queryAligned: 'AACCTGTT', subjectAligned: 'AACCGGTT',
    }
    const source: SequenceRecord = {
      id: 'source', name: 'Source', description: '', molecule: 'dna', topology: 'linear', sequence: 'AACCGGTT', construct: defaultConstructProperties,
      features: [{ id: 'feature', name: 'Variant feature', type: 'misc_feature', color: themeFixturePalette.bluePrimary, locations: [{ start: 0, end: 8, strand: 'forward' }] }],
      primers: [], operations: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const annotation = buildDnaAnnotationPlan(hit, source, 20).annotations[0]!
    expect(annotation.feature?.locations).toEqual([
      { start: 20, end: 24, strand: 'forward' },
      { start: 25, end: 28, strand: 'forward' },
    ])
    expect(annotation.feature?.notes).toContain('differing bases omitted')
  })
})
