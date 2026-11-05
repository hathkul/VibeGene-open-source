// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  detectCommonFeatures,
  featureFromCommonMatch,
  findExactDnaHits,
  isCommonFeatureAlreadyPresent,
  shouldTranslateCommonFeature,
  type CommonFeatureTemplate,
} from '../src/domain/commonFeatures'
import { parseFeatureQualifiers } from '../src/domain/featureQualifiers'
import { reverseComplement } from '../src/domain/sequence'
import type { SequenceFeature, SequenceRecord } from '../src/domain/types'

function makeRecord(sequence: string, features: SequenceFeature[] = [], topology: 'circular' | 'linear' = 'circular'): SequenceRecord {
  return {
    id: 'rec-1',
    name: 'test.dna',
    description: '',
    molecule: 'dna',
    topology,
    sequence,
    features,
    primers: [],
    operations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

const factorXa: CommonFeatureTemplate = {
  id: 'factor-xa-site',
  fileName: 'Factor Xa site.dna',
  name: 'Factor Xa site',
  type: 'CDS',
  color: '#cc99b2',
  sequence: 'ATCGAGGGTAGG',
  notes: 'product: Factor Xa recognition and cleavage site',
  qualifiers: [{ name: 'product', value: 'Factor Xa recognition and cleavage site' }],
  locations: [{ start: 0, end: 12, strand: 'forward' }],
  cleavageArrows: [11],
  translateInSequenceView: true,
}

describe('common feature detection', () => {
  it('finds exact forward hits including circular wrap', () => {
    expect(findExactDnaHits('AAATCGAGGGTAGGTT', 'ATCGAGGGTAGG', 'linear')).toEqual([2])
    expect(findExactDnaHits('GGGTAGGAAAATCGA', 'ATCGAGGGTAGG', 'circular')).toEqual([10])
  })

  it('detects forward and reverse matches and marks already-present', () => {
    const query = factorXa.sequence
    const sequence = `AAA${query}TTT${reverseComplement(query)}GGG`
    const existing = featureFromCommonMatch(factorXa, 3, 'forward', sequence.length)
    const record = makeRecord(sequence, [existing], 'linear')
    const matches = detectCommonFeatures(record, [factorXa])
    expect(matches).toHaveLength(2)
    const forward = matches.find((match) => match.strand === 'forward')
    const reverse = matches.find((match) => match.strand === 'reverse')
    expect(forward?.alreadyPresent).toBe(true)
    expect(reverse?.alreadyPresent).toBe(false)
    expect(forward?.start).toBe(3)
    expect(reverse?.start).toBe(3 + query.length + 3)
  })

  it('isCommonFeatureAlreadyPresent matches name, bounds, and strand', () => {
    const sequence = `NNN${factorXa.sequence}NNN`
    const feature = featureFromCommonMatch(factorXa, 3, 'forward', sequence.length)
    const record = makeRecord(sequence, [feature], 'linear')
    expect(isCommonFeatureAlreadyPresent(record, feature)).toBe(true)
    expect(
      isCommonFeatureAlreadyPresent(record, {
        ...feature,
        locations: [{ start: 4, end: 16, strand: 'forward' }],
      }),
    ).toBe(false)
  })

  it('keeps only the longest same-name variant among matches', () => {
    const shortVariant: CommonFeatureTemplate = {
      ...factorXa,
      id: 'factor-xa-short',
      fileName: 'Factor Xa site (2).dna',
      sequence: 'ATCGAGGG',
      locations: [{ start: 0, end: 8, strand: 'forward' }],
    }
    const longVariant: CommonFeatureTemplate = {
      ...factorXa,
      id: 'factor-xa-long',
      sequence: 'ATCGAGGGTAGGAA',
      locations: [{ start: 0, end: 14, strand: 'forward' }],
    }
    const sequence = `NNN${longVariant.sequence}NNN`
    const matches = detectCommonFeatures(makeRecord(sequence, [], 'linear'), [shortVariant, longVariant, factorXa])
    expect(matches).toHaveLength(1)
    expect(matches[0].template.id).toBe('factor-xa-long')
    expect(matches[0].template.sequence.length).toBe(14)
  })

  it('translates CDS templates that carry /product even without an explicit flag', () => {
    const productOnly: CommonFeatureTemplate = {
      ...factorXa,
      translateInSequenceView: undefined,
      translation: undefined,
      notes: undefined,
      qualifiers: [{ name: 'product', value: 'Factor Xa recognition and cleavage site' }],
    }
    expect(shouldTranslateCommonFeature(productOnly)).toBe(true)
    const feature = featureFromCommonMatch(productOnly, 0, 'forward', productOnly.sequence.length)
    expect(feature.translateInSequenceView).toBe(true)
    expect(feature.translation).toBeDefined()
    expect(parseFeatureQualifiers(feature.notes).product).toBe(
      'Factor Xa recognition and cleavage site',
    )
  })

  it('does not force translation for non-CDS /product features', () => {
    const trna: CommonFeatureTemplate = {
      ...factorXa,
      name: 'argU',
      type: 'tRNA',
      translateInSequenceView: undefined,
      translation: undefined,
      qualifiers: [{ name: 'product', value: 'tRNA-Arg' }],
    }
    expect(shouldTranslateCommonFeature(trna)).toBe(false)
    expect(featureFromCommonMatch(trna, 0, 'forward', trna.sequence.length).translateInSequenceView).toBeUndefined()
  })
})
