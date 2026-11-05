// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../constructProperties'
import { parseFeatureQualifiers, serializeFeatureQualifiers } from '../featureQualifiers'
import {
  GUIDESCAN_EVIDENCE_QUALIFIER,
  evidenceFromDesignCandidate,
  evidenceFromValidationResult,
  guideScanEvidenceMatchesContext,
  parseGuideScanEvidence,
  serializeGuideScanEvidence,
  type GuideScanEvidence,
  type GuideScanGuideCandidate,
  type GuideScanGuideValidationResult,
} from './index'
import { exportGenBank, exportSnapGene, parseGenBank, parseSnapGene } from '../parsers'
import {
  createSgRNAFeatures,
  findSgRNATargets,
  groupSgRNAFeatures,
  replaceSgRNAAnnotation,
  SGRNA_PRESETS,
} from '../sgrna'
import type { SequenceFeature, SequenceRecord } from '../types'

const GUIDE = 'ACTGCCCTTGCACACTGGGG'
const SP = SGRNA_PRESETS[0]!

const sampleCandidate: GuideScanGuideCandidate = {
  id: 'g1',
  rank: 2,
  regionName: 'BRCA2',
  organism: 'hg38',
  enzyme: 'cas9',
  chromosome: 'chr13',
  start: 100,
  end: 122,
  strand: 'forward',
  sequence: `${GUIDE}NGG`,
  spacer: GUIDE,
  pam: 'NGG',
  specificity: 0.91,
  cuttingEfficiency: 0.44,
  annotations: ['exon'],
  offTargetCounts: {
    distance0: 0,
    distance1: 1,
    distance2: 2,
    distance3: 0,
    distance4: 3,
  },
  offTargets: [
    {
      accession: 'huge-list-should-not-persist',
      chromosome: 'chr1',
      direction: 'forward',
      distance: 1,
      position: 99,
    },
  ],
}

function record(sequence: string, features: SequenceFeature[]): SequenceRecord {
  return {
    id: 'sg-evidence',
    name: 'evidence test',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features,
    primers: [],
    operations: [],
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
  }
}

function hitForGuide() {
  return findSgRNATargets(`TTT${GUIDE}AGGTTT`, GUIDE, 'linear', SP)[0]!
}

describe('GuideScan evidence encode/decode', () => {
  it('round-trips designed evidence without storing off-target hit lists', () => {
    const evidence = evidenceFromDesignCandidate(sampleCandidate, {
      jobId: 'job-design',
      capturedAt: '2026-01-02T03:04:05.000Z',
    })
    expect(evidence).toMatchObject({
      version: 1,
      source: 'design',
      outcome: 'found',
      organism: 'hg38',
      enzyme: 'cas9',
      jobId: 'job-design',
      rank: 2,
      specificity: 0.91,
      cuttingEfficiency: 0.44,
      annotations: ['exon'],
    })
    const encoded = serializeGuideScanEvidence(evidence)
    expect(encoded.startsWith('v1.')).toBe(true)
    expect(encoded.includes('"')).toBe(false)
    expect(parseGuideScanEvidence(encoded)).toMatchObject({
      source: 'design',
      jobId: 'job-design',
      rank: 2,
      offTargetCounts: sampleCandidate.offTargetCounts,
      chromosome: 'chr13',
    })
    expect(JSON.stringify(parseGuideScanEvidence(encoded))).not.toContain('huge-list')
  })

  it('captures validation found and not-found outcomes', () => {
    const found: GuideScanGuideValidationResult = {
      jobId: 'job-v',
      resultType: 'grna',
      organism: 'hg38',
      enzyme: 'cas9',
      querySequence: GUIDE,
      found: true,
      guide: sampleCandidate,
      errorMessage: null,
    }
    expect(evidenceFromValidationResult(found)).toMatchObject({
      source: 'validation',
      outcome: 'found',
      querySequence: GUIDE,
      specificity: 0.91,
    })
    const missing: GuideScanGuideValidationResult = {
      ...found,
      found: false,
      guide: null,
      errorMessage: 'Guide not found in GuideScan2 database.',
    }
    expect(evidenceFromValidationResult(missing)).toMatchObject({
      source: 'validation',
      outcome: 'not_found',
      message: 'Guide not found in GuideScan2 database.',
    })
    expect(evidenceFromValidationResult(missing).specificity).toBeUndefined()
  })

  it('detects stale evidence when spacer, enzyme, or organism diverge', () => {
    const evidence = evidenceFromDesignCandidate(sampleCandidate)
    expect(guideScanEvidenceMatchesContext(evidence, {
      spacer: GUIDE,
      enzyme: 'cas9',
      organism: 'hg38',
    })).toBe(true)
    expect(guideScanEvidenceMatchesContext(evidence, {
      spacer: 'A'.repeat(20),
      enzyme: 'cas9',
      organism: 'hg38',
    })).toBe(false)
    expect(guideScanEvidenceMatchesContext(evidence, {
      spacer: GUIDE,
      enzyme: 'cpf1',
      organism: 'hg38',
    })).toBe(false)
    expect(guideScanEvidenceMatchesContext(evidence, {
      spacer: GUIDE,
      enzyme: 'cas9',
      organism: 'mm39',
    })).toBe(false)
  })
})

describe('GuideScan evidence feature persistence', () => {
  beforeAll(async () => {
    const { initSnapGeneLzma } = await import('../snapgeneLzma')
    await initSnapGeneLzma()
  })

  it('persists designed metadata on the guide feature and groups it back', () => {
    const evidence = evidenceFromDesignCandidate(sampleCandidate, { jobId: 'job-d' })
    const pair = createSgRNAFeatures(hitForGuide(), {
      name: 'Designed guide',
      nuclease: 'SpCas9',
      pamMotif: 'NGG',
      pamSide: '3prime',
      spacer: GUIDE,
      id: 'designed-1',
      guideScanEvidence: evidence,
    })
    const guideQ = parseFeatureQualifiers(pair[0].notes)
    const pamQ = parseFeatureQualifiers(pair[1].notes)
    expect(guideQ[GUIDESCAN_EVIDENCE_QUALIFIER]).toBeTruthy()
    expect(pamQ[GUIDESCAN_EVIDENCE_QUALIFIER]).toBeUndefined()
    const grouped = groupSgRNAFeatures(pair)
    expect(grouped[0]?.guideScanEvidence).toMatchObject({
      source: 'design',
      jobId: 'job-d',
      rank: 2,
      specificity: 0.91,
      offTargetCounts: sampleCandidate.offTargetCounts,
    })
  })

  it('saves validated evidence and clears it on replace when omitted', () => {
    const validationEvidence = evidenceFromValidationResult({
      jobId: 'job-val',
      resultType: 'grna',
      organism: 'hg38',
      enzyme: 'cas9',
      querySequence: GUIDE,
      found: true,
      guide: sampleCandidate,
      errorMessage: null,
    })
    const original = createSgRNAFeatures(hitForGuide(), {
      name: 'Validated',
      nuclease: 'SpCas9',
      pamMotif: 'NGG',
      pamSide: '3prime',
      spacer: GUIDE,
      id: 'val-1',
      guideScanEvidence: validationEvidence,
    })
    expect(groupSgRNAFeatures(original)[0]?.guideScanEvidence?.source).toBe('validation')

    const cleared = createSgRNAFeatures(hitForGuide(), {
      name: 'Validated',
      nuclease: 'SpCas9',
      pamMotif: 'NGG',
      pamSide: '3prime',
      spacer: GUIDE,
      id: 'val-1',
    })
    const updated = replaceSgRNAAnnotation(original, 'val-1', cleared)
    expect(groupSgRNAFeatures(updated)[0]?.guideScanEvidence).toBeNull()

    const refreshedEvidence: GuideScanEvidence = {
      ...validationEvidence,
      specificity: 0.77,
      capturedAt: '2026-02-01T00:00:00.000Z',
    }
    const withNew = createSgRNAFeatures(hitForGuide(), {
      name: 'Validated',
      nuclease: 'SpCas9',
      pamMotif: 'NGG',
      pamSide: '3prime',
      spacer: GUIDE,
      id: 'val-1',
      guideScanEvidence: refreshedEvidence,
    })
    const replaced = replaceSgRNAAnnotation(updated, 'val-1', withNew)
    expect(groupSgRNAFeatures(replaced)[0]?.guideScanEvidence).toMatchObject({
      source: 'validation',
      specificity: 0.77,
    })
  })

  it('preserves unrelated custom qualifiers while updating evidence', () => {
    const evidence = evidenceFromDesignCandidate(sampleCandidate)
    const [guide, pam] = createSgRNAFeatures(hitForGuide(), {
      name: 'Custom Q',
      nuclease: 'SpCas9',
      pamMotif: 'NGG',
      pamSide: '3prime',
      spacer: GUIDE,
      id: 'custom-1',
      guideScanEvidence: evidence,
    })
    guide.notes = serializeFeatureQualifiers({
      ...parseFeatureQualifiers(guide.notes),
      custom_tag: 'keep-me',
    })
    const nextEvidence = evidenceFromValidationResult({
      jobId: 'job-2',
      resultType: 'grna',
      organism: 'hg38',
      enzyme: 'cas9',
      querySequence: GUIDE,
      found: false,
      guide: null,
      errorMessage: 'Guide not found in GuideScan2 database.',
    })
    const replacement = createSgRNAFeatures(hitForGuide(), {
      name: 'Custom Q',
      nuclease: 'SpCas9',
      pamMotif: 'NGG',
      pamSide: '3prime',
      spacer: GUIDE,
      id: 'custom-1',
      guideScanEvidence: nextEvidence,
    })
    const updated = replaceSgRNAAnnotation([guide, pam], 'custom-1', replacement)
    const grouped = groupSgRNAFeatures(updated)[0]!
    expect(parseFeatureQualifiers(grouped.guide.notes).custom_tag).toBe('keep-me')
    expect(grouped.guideScanEvidence).toMatchObject({
      source: 'validation',
      outcome: 'not_found',
    })
  })

  it('reads evidence from the PAM feature when the guide lacks it', () => {
    const evidence = evidenceFromDesignCandidate(sampleCandidate)
    const [guide, pam] = createSgRNAFeatures(hitForGuide(), {
      name: 'Pam fallback',
      nuclease: 'SpCas9',
      pamMotif: 'NGG',
      pamSide: '3prime',
      spacer: GUIDE,
      id: 'pam-fallback',
      guideScanEvidence: evidence,
    })
    const encoded = parseFeatureQualifiers(guide.notes)[GUIDESCAN_EVIDENCE_QUALIFIER]!
    const guideQs = { ...parseFeatureQualifiers(guide.notes) }
    delete guideQs[GUIDESCAN_EVIDENCE_QUALIFIER]
    const guideWithout = { ...guide, notes: serializeFeatureQualifiers(guideQs) }
    pam.notes = serializeFeatureQualifiers({
      ...parseFeatureQualifiers(pam.notes),
      [GUIDESCAN_EVIDENCE_QUALIFIER]: encoded,
    })
    const grouped = groupSgRNAFeatures([guideWithout, pam])
    expect(grouped[0]?.guideScanEvidence).toMatchObject({ source: 'design', rank: 2 })
  })

  it('round-trips GuideScan evidence through SnapGene and GenBank', () => {
    const evidence = evidenceFromDesignCandidate(sampleCandidate, {
      jobId: 'job-rt',
      capturedAt: '2026-03-04T05:06:07.000Z',
    })
    const features = createSgRNAFeatures(hitForGuide(), {
      name: 'Round trip',
      nuclease: 'SpCas9',
      pamMotif: 'NGG',
      pamSide: '3prime',
      spacer: GUIDE,
      id: 'rt-1',
      guideScanEvidence: evidence,
    })
    const original = record(`TTT${GUIDE}AGGTTT`, features)
    for (const imported of [
      parseSnapGene(exportSnapGene(original), 'evidence.dna'),
      parseGenBank(exportGenBank(original), 'evidence.gb'),
    ]) {
      const annotations = groupSgRNAFeatures(imported.features)
      expect(annotations).toHaveLength(1)
      expect(annotations[0]?.guideScanEvidence).toMatchObject({
        source: 'design',
        organism: 'hg38',
        enzyme: 'cas9',
        jobId: 'job-rt',
        rank: 2,
        specificity: 0.91,
        cuttingEfficiency: 0.44,
        chromosome: 'chr13',
        offTargetCounts: sampleCandidate.offTargetCounts,
        annotations: ['exon'],
      })
      expect(annotations[0]?.id).toBe('rt-1')
      expect(annotations[0]?.spacer).toBe(GUIDE)
    }
  })
})
