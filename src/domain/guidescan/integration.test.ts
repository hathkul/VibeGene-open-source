import { describe, expect, it } from 'vitest'
import { createSgRNAFeatures } from '../sgrna'
import { defaultConstructProperties, normalizeSequenceRecord } from '../constructProperties'
import { createId } from '../sequence'
import type { SequenceRecord } from '../types'
import {
  GUIDESCAN_DEFAULT_TOP_N,
  genomicTargetForSelection,
  mapGuideScanCandidateToHit,
  pickGuideScanCatalogDefaults,
  sgRNAAnnotationExists,
  withGenomicAnchor,
} from './index'
import type { GuideScanGuideCandidate, GuideScanSupportedInfo } from './types'

function testRecord(sequence: string, anchor?: Parameters<typeof withGenomicAnchor>[1]): SequenceRecord {
  const base: SequenceRecord = {
    id: createId('seq'),
    name: 'genomic test',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
  return anchor ? withGenomicAnchor(base, anchor) : base
}

const sampleCandidate: GuideScanGuideCandidate = {
  id: 'g1',
  rank: 1,
  regionName: 'region',
  organism: 'hg38',
  enzyme: 'cas9',
  chromosome: 'chr17',
  start: 150,
  end: 172,
  strand: 'forward',
  sequence: 'ACTGCCCTTGCACACTGGGGNGG',
  spacer: 'ACTGCCCTTGCACACTGGGG',
  pam: 'NGG',
  specificity: 0.4,
  cuttingEfficiency: 0.2,
  annotations: [],
  offTargetCounts: {
    distance0: 0,
    distance1: 0,
    distance2: 0,
    distance3: 0,
    distance4: 0,
  },
  offTargets: [],
}

describe('GuideScan integration helpers', () => {
  it('defaults catalog picks to hg38 cas9 and topN 20', () => {
    const catalog: GuideScanSupportedInfo = {
      version: '1',
      cliVersion: 'v2',
      available: [
        { organism: 'mm39', enzyme: 'cpf1' },
        { organism: 'hg38', enzyme: 'cas9' },
      ],
      organisms: ['mm39', 'hg38'],
      enzymes: ['cas9', 'cpf1'],
    }
    expect(pickGuideScanCatalogDefaults(catalog)).toEqual({ organism: 'hg38', enzyme: 'cas9' })
    expect(GUIDESCAN_DEFAULT_TOP_N).toBe(20)
  })

  it('maps selection spans through a genomic anchor', () => {
    const record = testRecord('A'.repeat(200), {
      organism: 'hg38',
      chromosome: 'chr17',
      start: 100,
      end: 299,
      strand: 'forward',
    })
    const target = genomicTargetForSelection(record, { start: 10, end: 30 })
    expect(target).toEqual({
      chromosome: 'chr17',
      start: 110,
      end: 129,
      name: 'chr17:110-129',
    })
  })

  it('maps GuideScan candidates onto anchored records and creates sgRNA features', () => {
    const prefix = 'A'.repeat(50)
    const guide = 'ACTGCCCTTGCACACTGGGG'
    const suffix = 'AGG' + 'T'.repeat(127)
    const record = testRecord(prefix + guide + suffix, {
      organism: 'hg38',
      chromosome: 'chr17',
      start: 100,
      end: 100 + prefix.length + guide.length + suffix.length - 1,
      strand: 'forward',
    })
    const hit = mapGuideScanCandidateToHit(sampleCandidate, record, 'cas9')
    expect(hit?.guideStart).toBe(50)
    const pair = createSgRNAFeatures(hit!, {
      name: 'GuideScan hit',
      nuclease: 'SpCas9',
      pamMotif: 'NGG',
      pamSide: '3prime',
      spacer: guide,
    })
    const annotated = normalizeSequenceRecord({ ...record, features: [...record.features, ...pair] })
    expect(annotated.features).toHaveLength(2)
    expect(sgRNAAnnotationExists(annotated, hit!, guide)).toBe(true)
  })

  it('maps GuideScan candidates on reverse-oriented Ensembl-like gene records', () => {
    const prefix = 'A'.repeat(50)
    const guide = 'ACTGCCCTTGCACACTGGGG'
    const suffix = 'AGG' + 'T'.repeat(127)
    const anchorStart = 7_571_720
    const anchorEnd = anchorStart + prefix.length + guide.length + suffix.length - 1
    const record = testRecord(prefix + guide + suffix, {
      organism: 'hg38',
      chromosome: 'chr17',
      start: anchorStart,
      end: anchorEnd,
      strand: 'reverse',
    })
    const guideStartIndex = prefix.length
    const genomicGuideStart = anchorEnd - guideStartIndex
    const genomicTargetStart = genomicGuideStart - (guide.length + suffix.slice(0, 3).length - 1)
    const candidate: GuideScanGuideCandidate = {
      ...sampleCandidate,
      id: 'g-reverse',
      chromosome: 'chr17',
      start: genomicTargetStart,
      end: genomicGuideStart,
      strand: 'reverse',
      spacer: guide,
      sequence: `${guide}NGG`,
    }
    const hit = mapGuideScanCandidateToHit(candidate, record, 'cas9')
    expect(hit?.guideStart).toBe(guideStartIndex)
    expect(hit?.strand).toBe('forward')
    const pair = createSgRNAFeatures(hit!, {
      name: 'TP53-like hit',
      nuclease: 'SpCas9',
      pamMotif: 'NGG',
      pamSide: '3prime',
      spacer: guide,
    })
    expect(pair[0]!.locations[0]).toMatchObject({ start: guideStartIndex, end: guideStartIndex + guide.length, strand: 'forward' })
  })

  it('maps minus-strand genomic candidates on unanchored gene-oriented records via opposite strand', () => {
    const prefix = 'A'.repeat(50)
    const guide = 'ACTGCCCTTGCACACTGGGG'
    const suffix = 'AGG' + 'T'.repeat(127)
    const record = testRecord(prefix + guide + suffix)
    const guideStartIndex = prefix.length
    const candidate: GuideScanGuideCandidate = {
      ...sampleCandidate,
      id: 'g-reverse-unanchored',
      strand: 'reverse',
      spacer: guide,
      sequence: `${guide}NGG`,
    }
    const hit = mapGuideScanCandidateToHit(candidate, record, 'cas9')
    expect(hit?.guideStart).toBe(guideStartIndex)
    expect(hit?.strand).toBe('forward')
  })

  it('does not map ambiguous repeated spacers on the same record strand', () => {
    const guide = 'ACTGCCCTTGCACACTGGGG'
    const unit = guide + 'AGG'
    const record = testRecord(unit + 'TTTT' + unit)
    const candidate: GuideScanGuideCandidate = {
      ...sampleCandidate,
      id: 'g-dup',
      spacer: guide,
    }
    expect(mapGuideScanCandidateToHit(candidate, record, 'cas9')).toBeNull()
  })
})
