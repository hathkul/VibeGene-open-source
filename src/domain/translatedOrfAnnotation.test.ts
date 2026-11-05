import { describe, expect, it } from 'vitest'
import { reverseComplement } from './sequence'
import type { UniProtSimilarityHit } from './proteinUniProtAnnotation'
import { buildTranslatedOrfHitPlan, detectTranslatedOrfs } from './translatedOrfAnnotation'

describe('translated ORF annotation candidates', () => {
  it('detects and translates a forward start-to-stop ORF', () => {
    const sequence = `ATG${'GCC'.repeat(40)}TAA`
    const [orf] = detectTranslatedOrfs(sequence, 25)
    expect(orf?.proteinSequence).toBe(`M${'A'.repeat(40)}`)
    expect(orf?.feature.locations).toEqual([{ start: 0, end: sequence.length, strand: 'forward' }])
    expect(orf?.cells).toHaveLength(41)
  })

  it('retains reverse-strand codon positions for DNA projection', () => {
    const coding = `ATG${'GCC'.repeat(30)}TAA`
    const sequence = `CCCC${reverseComplement(coding)}CCCC`
    const orf = detectTranslatedOrfs(sequence, 25).find((candidate) => candidate.feature.locations[0]?.strand === 'reverse')
    expect(orf?.proteinSequence).toBe(`M${'A'.repeat(30)}`)
    expect(orf?.feature.locations[0]).toEqual({ start: 4, end: 4 + coding.length, strand: 'reverse' })
    expect(orf?.cells[0]?.positions).toEqual([coding.length + 3, coding.length + 2, coding.length + 1])
  })

  it('offsets ORF and codon coordinates detected inside a selection', () => {
    const coding = `ATG${'GCC'.repeat(25)}TAA`
    const [orf] = detectTranslatedOrfs(coding, 25, 120)
    expect(orf?.feature.locations[0]).toEqual({ start: 120, end: 120 + coding.length, strand: 'forward' })
    expect(orf?.cells[0]?.positions).toEqual([120, 121, 122])
  })

  it('projects only identical amino acids back to their DNA codons', () => {
    const coding = `ATG${'GCT'.repeat(4)}TGT${'GCT'.repeat(4)}TAA`
    const orf = detectTranslatedOrfs(coding, 5)[0]!
    const hit = {
      accession: 'PTEST', description: 'Test protein', subjectLength: 10, bitScore: 50, eValue: 1e-10,
      identityPercent: 90, positivesPercent: 90, queryCoveragePercent: 100, queryStart: 1, queryEnd: 10,
      subjectStart: 1, subjectEnd: 10, reviewed: true, featureCount: 1, bondCount: 0,
      entry: {
        primaryAccession: 'PTEST', sequence: { value: 'MAAAAYAAAA', length: 10 },
        features: [{ type: 'DOMAIN', description: 'Test domain', location: { start: { value: 1 }, end: { value: 10 } } }],
      },
    } as UniProtSimilarityHit
    const feature = buildTranslatedOrfHitPlan(orf, hit).annotations[0]!.feature
    expect(feature.locations).toEqual([
      { start: 0, end: 15, strand: 'forward' },
      { start: 18, end: 30, strand: 'forward' },
    ])
  })
})
